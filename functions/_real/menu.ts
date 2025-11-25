// CP3-TRUTH: real menu adapters with merge-upsert safety
import { mergeUpsert } from "../lib/merge-upsert";

export async function realGetMenu(env: any, store_id: string) {
  const kv = env.MENU_KV;
  const raw = await kv.get(, "json");
  return raw || { store_id, items: [] };
}

export async function realSetMenu(env: any, store_id: string, menu: any) {
  const kv = env.MENU_KV;
  await kv.put(, JSON.stringify(menu));
  return menu;
}

export async function realGetMenuItem(env: any, store_id: string, item_id: string) {
  const master = await realGetMenu(env, store_id);
  return (master.items || []).find((x: any) => x.item_id === item_id) || null;
}

export async function realUpsertMenuItemRaw(
  env: any,
  store_id: string,
  item_id: string,
  next: any
) {
  const master = await realGetMenu(env, store_id);
  master.items = master.items || [];
  const i = master.items.findIndex((x: any) => x.item_id === item_id);
  if (i >= 0) master.items[i] = next;
  else master.items.push(next);
  await realSetMenu(env, store_id, master);
  return next;
}

export async function realUpsertMenuItem(
  env: any,
  store_id: string,
  item_id: string,
  incoming: any
) {
  const prev = await realGetMenuItem(env, store_id, item_id).catch(() => null);
  const next = mergeUpsert(prev, incoming);
  return await realUpsertMenuItemRaw(env, store_id, item_id, next);
}
