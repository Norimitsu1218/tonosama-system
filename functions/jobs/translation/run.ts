import { Env, json, isMock, bad } from "../../_utils";
import { realGetMenu, realUpsertMenuItem } from "../../_real/store";
import { llmGenerate14Lang } from "../../_real/llm";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  const store_id = body?.store_id;
  if (!store_id) return bad(422, "INVALID", "store_id required");

  // mock は従来通り “doneにするだけ”
  if (isMock(env)) {
    let drained = 0;
    for (const it of (body.items||[])) {
      drained++;
    }
    return json({ drained, note:"mock drain" });
  }

  // real: queued items を KV から拾って LLM → upsert → done
  const menu = await realGetMenu(env, store_id);
  const queued = menu.filter((x:any)=>x.translation_status==="queued");

  let drained = 0;
  for (const item of queued) {
    try {
      const result = await llmGenerate14Lang(env, {
        store_id,
        item_id: item.item_id,
        name_ja: item.name_ja,
        price: item.price,
        ja18s_final: item.ja18s_final || item.ja18s_draft || ""
      });

      const merged = {
        ...item,
        translations: result.translations || {},
        translation_status: "done",
        translation_error: null
      };

      await realUpsertMenuItem(env, store_id, merged);
      drained++;
    } catch (e:any) {
      const merged = {
        ...item,
        translation_status: "error",
        translation_error: e?.message || String(e)
      };
      await realUpsertMenuItem(env, store_id, merged);
    }
  }

  return json({ drained, queued: queued.length, note:"real drain via LLM adapter" });
};
