import { Env, json, isMock, bad } from "../_utils";
import { realGetMenu, realUpsertMenuItem } from "../_real/menu";
import { llmTranslateItem } from "../_real/llm";
import { qcCheckOne } from "../lib/qc-automation";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(() => ({})) as any;
  const store_id = body?.store_id;
  if (!store_id) return bad(422, "INVALID", "store_id required");

  // mock は no-op
  if (isMock(env)) {
    return json({ store_id, drained: 0, errors: 0, queued: 0, note: "mock mode: no-op" });
  }

  const master = await realGetMenu(env as any, store_id);
  const items = (master.items || []) as any[];

  // ---- eligibility debug ----
  const total = items.length;
  const approvedItems = items.filter(it => it.owner_approved === true);
  const qcOkItems = approvedItems.filter(it => String(it.qc_status).toLowerCase() === "ok");
  const ja18sItems = qcOkItems.filter(it => String(it.ja18s_final || "").trim().length > 0);
  const eligibleItems = ja18sItems.filter(it => it.translation_status === "queued");

  const debug = {
    total,
    approved: approvedItems.length,
    qc_ok: qcOkItems.length,
    ja18s_nonempty: ja18sItems.length,
    eligible: eligibleItems.length,
    sample: eligibleItems.slice(0, 3).map(it => it.item_id),
  };

  // ---- batch / retry config ----
  const chunkSize = Number(env.TRANSLATION_CHUNK_SIZE || 8);
  const retryMax  = Number(env.TRANSLATION_RETRY_MAX || 2);
  const backoffMs = Number(env.TRANSLATION_BACKOFF_MS || 800);
  const qcEnabled = String(env.QC_AUTOMATION || "off").toLowerCase() === "on";

  let drained = 0;
  let errors = 0;

  // ---- chunk loop ----
  for (let i = 0; i < eligibleItems.length; i += chunkSize) {
    const chunk = eligibleItems.slice(i, i + chunkSize);

    for (const item of chunk) {
      const item_id = item.item_id;
      let attempt = Number(item.translation_attempt || 0);

      try {
        // running に上げてから LLM
        await realUpsertMenuItem(env as any, store_id, item_id, {
          translation_status: "running",
          translation_error: null,
        });

        const llmOut = await llmTranslateItem(env as any, item);

        // 既存 translations を壊さずマージ
        const translations: Record<string, any> = { ...(item.translations || {}) };

        for (const [lang, payloadAny] of Object.entries((llmOut as any)?.translations || {})) {
          const payload: any = payloadAny;
          const localized = {
            lang,
            name_localized:
              payload.name_localized ?? payload.name ?? payload.title ?? "",
            body_localized:
              payload.body_localized ?? payload.desc ?? payload.description ?? "",
          };

          if (qcEnabled) {
            await qcCheckOne(env as any, localized);
          }

          translations[lang] = {
            name_localized: localized.name_localized,
            body_localized: localized.body_localized,
          };
        }

        await realUpsertMenuItem(env as any, store_id, item_id, {
          translations,
          translation_status: "done",
          translation_done_at: Date.now(),
          translation_error: null,
          translation_attempt: attempt,
          next_retry_at: null,
        });

        drained++;
      } catch (e: any) {
        attempt++;
        const msg = e?.message || String(e);

        if (attempt <= retryMax) {
          const next_retry_at = Date.now() + backoffMs * attempt;

          await realUpsertMenuItem(env as any, store_id, item_id, {
            translation_status: "queued",
            translation_attempt: attempt,
            next_retry_at,
            translation_error: msg,
          }).catch(() => {});
        } else {
          errors++;

          await realUpsertMenuItem(env as any, store_id, item_id, {
            translation_status: "error",
            translation_attempt: attempt,
            translation_error: msg,
            translation_error_at: Date.now(),
          }).catch(() => {});
        }
      }

      // Worker時間の安全マージン
      await sleep(5);
    }
  }

  // remaining queued を再計算
  const menu2 = await realGetMenu(env as any, store_id);
  const remainingQueued =
    (menu2.items || []).filter((it: any) => it.translation_status === "queued").length;

  return json({
    store_id,
    debug,
    drained,
    errors,
    queued: remainingQueued,
    note: "CP4 async-batch drain (chunk + retry/backoff + QC gate)",
  });
};
