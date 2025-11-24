import { Env, store, json, isMock, bad } from "../_utils";
import { realGetMenu, realUpsertMenuItem } from "../_real/store";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  if (!body?.store_id || !Array.isArray(body.items)) {
    return bad(422, "INVALID", "store_id/items required");
  }

  if (isMock(env)) {
    body.items.forEach((it:any)=>{
      const i = store.menu.findIndex(x=>x.item_id===it.item_id);
      if (i>=0) store.menu[i].translation_status="queued";
    });
    return json({ status: "queued", count: body.items.length });
  }

  const menu = await realGetMenu(env, body.store_id);
  let queuedCount = 0;

  for (const it of body.items) {
    const item = menu.find((x:any)=>x.item_id===it.item_id);
    if (!item) continue;
    if (item.qc_status !== "ok" || item.owner_approved !== true) continue;

    const merged = { ...item, translation_status: "queued", translation_error: null };
    await realUpsertMenuItem(env, body.store_id, merged);
    queuedCount++;
  }

  return json({ status:"queued", count: queuedCount });
};
