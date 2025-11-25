// CP3-TRUTH: master read with non-destructive normalize
import { realGetMenu } from "../_real/menu";
import { canonicalDefaults } from "../lib/merge-upsert";

export async function onRequestGet({ request, env }: any) {
  const url = new URL(request.url);
  const store_id = url.searchParams.get("store_id");
  if (!store_id) return new Response("store_id required", { status: 400 });

  const master = await realGetMenu(env, store_id);
  const items = (master.items || []).map((it: any) => canonicalDefaults(it));
  return Response.json({ store_id, items });
}

export async function onRequestPost({ request, env }: any) {
  const body = await request.json();
  const store_id = body.store_id;
  const item_id = body.item_id;
  if (!store_id || !item_id) return new Response("store_id,item_id required", { status: 400 });
  const out = await realUpsertMenuItem(env, store_id, item_id, body);
  return Response.json(out);
}
