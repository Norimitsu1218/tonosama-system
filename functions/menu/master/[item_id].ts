// CP3-TRUTH: PATCH unified via realUpsertMenuItem
import { realUpsertMenuItem } from "../../_real/menu";

export async function onRequestPatch({ request, env, params }: any) {
  const item_id = params.item_id;
  const body = await request.json();
  const url = new URL(request.url);
  const store_id = body.store_id || url.searchParams.get("store_id");
  if (!store_id) return new Response("store_id required", { status: 400 });

  const out = await realUpsertMenuItem(env, store_id, item_id, body);
  return Response.json(out);
}
