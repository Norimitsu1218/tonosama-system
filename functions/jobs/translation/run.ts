// CP3-DRAIN + CP4-QC-AUTO: translation drain with QC gate
import { realGetMenu, realUpsertMenuItem } from "../_real/menu";
import { llmTranslateItem } from "../_real/llm";
import { qcCheckOne } from "../lib/qc-automation";

const QC_ENABLED = (process.env.QC_AUTOMATION || "off").toLowerCase() === "on";

export async function onRequestPost(req: Request & { env: any }) {
  const { store_id } = await req.json().catch(() => ({}));
  if (!store_id) {
    return new Response("store_id required", { status: 400 });
  }

  const master = await realGetMenu(req.env, store_id);
  const items = (master.items || []).filter((it: any) => it.owner_approved === true && String(it.qc_status).toLowerCase() === "ok");

  let drained = 0;
  let errors = 0;

  for (const item of items) {
    const item_id = item.item_id;

    try {
      await realUpsertMenuItem(req.env, store_id, item_id, {
        translation_status: "running",
        translation_error: null,
      });

      const llmOut = await llmTranslateItem(req.env, item);
      const translations: Record<string, { name_localized: string; body_localized: string }> = {};

      for (const [lang, payload] of Object.entries(llmOut.translations || {})) {
        const localized = {
          lang,
          name_localized: payload.name,
          body_localized: payload.desc,
        };
        if (QC_ENABLED) {
          await qcCheckOne(req.env, localized);
        }
        translations[lang] = {
          name_localized: localized.name_localized,
          body_localized: localized.body_localized,
        };
      }

      await realUpsertMenuItem(req.env, store_id, item_id, {
        translations,
        translation_status: "done",
        translation_error: null,
      });

      drained++;
    } catch (error: any) {
      errors++;
      await realUpsertMenuItem(req.env, store_id, item_id, {
        translation_status: "error",
        translation_error: String(error?.message || error),
      }).catch(() => {});
    }
  }

  const remaining = (await realGetMenu(req.env, store_id)).items?.filter((it: any) => it.translation_status !== "done")?.length || 0;
  const success = drained;

  return new Response(
    JSON.stringify({
      store_id,
      queued: items.length,
      drained,
      success,
      errors,
      remaining,
      note: "CP3-DRAIN/CP4-QC-AUTO running",
    }),
    { headers: { "content-type": "application/json" } }
  );
}
