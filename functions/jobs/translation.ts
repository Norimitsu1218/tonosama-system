import { Env, store, json, isMock, bad } from "../_utils";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) {
    return bad(422, "INVALID_BODY", "items[] required");
  }

  if (isMock(env)) {
    body.items.forEach((it:any)=>{
      const i = (store.menu || []).findIndex((x:any)=>x.item_id===it.item_id);
      if (i >= 0) store.menu[i].translation_status = "queued";
    });
    return json({ status: "queued", count: body.items.length });
  }

  // real: TODO enqueue translation_jobs
  return bad(501, "REAL_API_NOT_IMPLEMENTED", "real api not implemented");
};
