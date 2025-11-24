import { Env, store, json, isMock, bad } from "../_utils";
import { realGetPayment, realUpsertMenuItem } from "../_real/store";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  if (!body?.store_id || !Array.isArray(body.items)) {
    return bad(422, "INVALID", "store_id/items required");
  }
  const store_id = body.store_id;

  if (isMock(env)) {
    body.items.forEach((it:any)=>{
      const i = store.menu.findIndex((x:any)=>x.item_id===it.item_id);
      if (i>=0) store.menu[i].translation_status="queued";
    });
    return json({ status: "queued", count: body.items.length });
  }

  const pay = await realGetPayment(env, store_id);
  if (!["trial","paid"].includes(pay)) {
    return bad(402, "PAYMENT_BLOCKED", `payment_status=${pay}`);
  }

  for (const it of body.items) {
    await realUpsertMenuItem(env, store_id, {
      item_id: it.item_id,
      store_id,
      translation_status: "queued"
    });
  }
  return json({ status: "queued", count: body.items.length });
};
