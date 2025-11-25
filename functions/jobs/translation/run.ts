// /jobs/translation/run (drain)
import {
  listQueuedTranslations,
  markTranslationDone,
  markTranslationError
} from "../../lib/translation-kv";
import { translateOne } from "../../lib/translate";

export async function onRequestPost({ request, env }: any) {
  const { store_id } = await request.json();
  const queued = await listQueuedTranslations(env, store_id);

  let success = 0;
  let errors = 0;

  for (const job of queued) {
    try {
      const out = await translateOne(env, job);

  if ((env.QC_AUTOMATION||"off")==="on") { await qcCheckOne(env,{lang, ...out}); }
      await markTranslationDone(env, store_id, job.item_id, out);
      success++;
    } catch (e: any) {
      await markTranslationError(env, store_id, job.item_id, String(e?.message || e));
      errors++;
    }
  }

  // BUGFIX:
  // drained = "no queued items remain AND no errors"
  // if errors > 0, remaining jobs stay queued for retry.
  const remaining = await listQueuedTranslations(env, store_id);
  const drained = remaining.length === 0 && errors === 0;

  return new Response(
    JSON.stringify({
      store_id,
      queued: queued.length,
      success,
      errors,
      drained,
      remaining: remaining.length,
    }),
    { headers: { "content-type": "application/json" } }
  );
}
