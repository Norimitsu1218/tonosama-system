import { Env, json, isMock, bad, store } from "../../_utils";
import { realGetMenu, realUpsertMenuItem } from "../../_real/store";

/**
 * POST /jobs/translation/all
 * body: { store_id }
 * approved & qc ok の item_id を全部 queued 化
 */
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  const store_id = body?.store_id;
  if (!store_id) return bad(422, "INVALID", "store_id required");

  if (isMock(env)) {
    const cnt = store.menu.filter((x:any)=>x.store_id===store_id && x.owner_approved && x.qc_status==="ok").length;
    return json({ status:"queued", count: cnt });
  }

  const items = await realGetMenu(env, store_id);
  const targets = items.filter((x:any)=>x.owner_approved && x.qc_status==="ok");

  for (const it of targets) {
    await realUpsertMenuItem(env, store_id, { ...it, translation_status: "queued" });
  }

  return json({ status:"queued", count: targets.length });
};
