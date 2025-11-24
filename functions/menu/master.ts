import { Env, store, json, isMock } from "../_utils";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const store_id = url.searchParams.get("store_id") || "store_dev_0001";

  store.menu = store.menu || [];

  if (isMock(env)) {
    // Pages Functions are stateless between requests, so seed on-demand
    if (store.menu.length === 0) {
      store.menu.push({
        store_id,
        item_id: "draft_001",
        name_ja: "ねぎま",
        price: 220,
        category: "焼き鳥",
        image_status: "none",
        ja18s_draft: "香ばしい鶏ももと長ねぎを…（18秒文）",
        status: "needs_review",
        qc_status: "needs_review",
        qc_reason: "価格/部位の要確認",
        owner_approved: false,
        ja18s_final: "",
        translation_status: "idle"
      });
    }
  }

  const items = store.menu.filter((x:any)=>x.store_id===store_id);
  return json({ store_id, items });
};
