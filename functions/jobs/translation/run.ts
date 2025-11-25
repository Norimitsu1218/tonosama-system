import { realGetMenu, realUpsertMenuItem } from "../../_real/menu";
import { expand14langs, translateOne } from "../../lib/translate";
import { backoffMs, dueNow } from "../../lib/batch";

export const onRequestPost: PagesFunction = async (ctx) => {
  const { request, env } = ctx;
  const { store_id } = await request.json<any>();
  if (!store_id) return new Response("store_id required", { status: 400 });

  const menu = await realGetMenu(env as any, store_id);
  const items = (menu.items || [])
    .filter((it: any) => it.translation_status === "queued")
    .filter((it: any) => dueNow(it));

  const limit = Number((env as any).BATCH_RUN_LIMIT || 10);
  const target = items.slice(0, limit);

  let drained = 0;
  let errors = 0;

  for (const it of target) {
    try {
      const jobs = expand14langs({
        store_id,
        item_id: it.item_id,
        ja_name: it.ja_name || it.name_ja,
        ja18s_final: it.ja18s_final,
      });

      const outs: any[] = [];
      for (const j of jobs) {
        const out = await translateOne(env as any, j);
        outs.push(out);
      }

      const translations = Object.fromEntries(
        outs.map((o) => [o.lang, { name_localized: o.name_localized, body_localized: o.body_localized }])
      );

      await realUpsertMenuItem(env as any, store_id, it.item_id, {
        translations,
        translation_status: "done",
        translation_error: null,
      });

      drained++;
    } catch (e: any) {
      errors++;
      const attempt = Number(it.attempt || 0) + 1;
      const next_retry_at = Date.now() + backoffMs(attempt);

      await realUpsertMenuItem(env as any, store_id, it.item_id, {
        translation_status: "error",
        translation_error: String(e?.message || e),
        attempt,
        next_retry_at,
      });
    }
  }

  // remainingは「due待ち含め queued がまだある数」
  const menu2 = await realGetMenu(env as any, store_id);
  const remaining = (menu2.items || []).filter((it: any) => it.translation_status === "queued").length;

  return Response.json({
    drained,
    errors,
    queued: remaining,
    note: "real drain with chunk+retry/backoff (CP4 async-batch)",
  });
};
