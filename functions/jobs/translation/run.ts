import { Env, json, isMock, bad } from "../../_utils";
import { realGetMenu, realUpsertMenuItem } from "../../_real/store";
import { llmTranslateItem } from "../../_real/llm";

const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));

async function withRetry<T>(fn:()=>Promise<T>, tries=3){
  let last:any;
  for (let i=0;i<tries;i++){
    try { return await fn(); }
    catch(e:any){
      last = e;
      const msg = String(e?.message||e);
      const retriable = /429|timeout|503|502|500|gemini error 5|network/i.test(msg);
      if (!retriable || i===tries-1) throw e;
      await sleep(600*(i+1));
    }
  }
  throw last;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  const store_id = body?.store_id;
  if (!store_id) return bad(422, "INVALID", "store_id required");

  // mock: 既存のfree drain stub維持
  if (isMock(env)) {
    return json({ drained: 0, queued: 0, note: "mock drain noop" });
  }

  const menu = await realGetMenu(env, store_id);
  const queued = menu.filter((x:any)=>x.translation_status==="queued");

  let drained = 0;
  let blocked = 0;
  let errors = 0;

  for (const item of queued) {
    // QC/承認ゲート
    if (item.qc_status !== "ok" || item.owner_approved !== true) {
      const merged = { ...item, translation_status: "blocked" };
      await realUpsertMenuItem(env, store_id, merged);
      blocked++;
      continue;
    }

    // すでにdoneなら冪等スキップ
    if (item.translation_status === "done" && item.translations) continue;

    try {
      const result = await withRetry(()=>llmTranslateItem(env, item), 3);

      const merged = {
        ...item,
        translations: result.translations,
        translation_status: "done",
        translation_error: null
      };

      await realUpsertMenuItem(env, store_id, merged);
      drained++;
    } catch (e:any) {
      const msg = (e?.message || String(e)).slice(0, 240);
      const merged = {
        ...item,
        translation_status: "error",
        translation_error: msg
      };
      await realUpsertMenuItem(env, store_id, merged);
      errors++;
    }
  }

  return json({
    drained,
    queued: queued.length,
    blocked,
    errors,
    note: "real drain via LLM adapter (gemini now, claude swappable)"
  });
};
