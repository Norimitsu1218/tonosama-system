import { Env, store, json, isMock, bad } from "../../_utils";

export const onRequestPatch: PagesFunction<Env> = async ({ env, params, request }) => {
  const item_id = String(params.item_id || "");
  if (!item_id) return bad(400, "ITEM_ID_REQUIRED", "item_id required");

  const body = await request.json().catch(() => ({} as any));

  if (isMock(env)) {
    store.menu = store.menu || [];
    let i = store.menu.findIndex((x:any)=>x.item_id===item_id);

    if (i < 0) {
      // upsert create
      store.menu.push({ item_id, ...body });
      i = store.menu.length - 1;
    } else {
      store.menu[i] = { ...store.menu[i], ...body, item_id };
    }
    return json(store.menu[i]);
  }

  return bad(501, "REAL_API_NOT_IMPLEMENTED", "real api not implemented");
};
