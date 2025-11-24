import { Env, store, json, isMock, bad } from "../_utils";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const store_id = url.searchParams.get("store_id") || "";

  if (!store_id) return bad(400, "STORE_ID_REQUIRED", "store_id required");

  // mock: return in-memory menu drafts
  if (isMock(env)) {
    const items = (store.menu || []).filter((x:any)=>x.store_id===store_id || !x.store_id);
    return json({ store_id, items });
  }

  // real: TODO connect MENU_MASTER
  return json({ store_id, items: [] });
};
