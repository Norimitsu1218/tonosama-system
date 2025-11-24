import { Env, store, json, isMock, bad } from "../_utils";

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

  // real: enqueue
  if (!env.TRANSLATION_Q) return bad(500, "QUEUE_BINDING_MISSING", "TRANSLATION_Q missing");
  for (const it of body.items) {
    await env.TRANSLATION_Q.send({ store_id: body.store_id, item_id: it.item_id });
  }
  return json({ status: "queued", count: body.items.length });
};
