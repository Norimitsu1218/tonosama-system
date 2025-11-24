import { Env, store, json, isMock, bad } from "../../_utils";
import { realUpsertMenuItem } from "../../_real/store";

export const onRequestPatch: PagesFunction<Env> = async ({ env, request, params }) => {
  const item_id = String(params.item_id || "");
  const body = await request.json().catch(()=>null) as any;
  if (!body) return bad(422, "INVALID_JSON", "invalid json");
  const store_id = body.store_id || "store_dev_0001";

  if (isMock(env)) {
    let i = store.menu.findIndex((x:any)=>x.item_id===item_id);
    if (i < 0) { store.menu.push({ item_id, store_id, ...body }); i = store.menu.length-1; }
    else { store.menu[i] = { ...store.menu[i], ...body, item_id, store_id }; }
    return json(store.menu[i]);
  }

  const updated = await realUpsertMenuItem(env, store_id, { item_id, store_id, ...body });
  return json(updated);
};
