import { Env } from "../_utils";

const MENU_KEY = (store_id:string)=>`menu:${store_id}`;

export async function realGetMenu(env:Env, store_id:string){
  const kv = env.MENU_KV;
  if (!kv) throw new Error("MENU_KV binding missing");
  const raw = await kv.get(MENU_KEY(store_id));
  return raw ? JSON.parse(raw) : [];
}

export async function realUpsertMenuItem(env:Env, store_id:string, item:any){
  const kv = env.MENU_KV;
  if (!kv) throw new Error("MENU_KV binding missing");
  const menu = await realGetMenu(env, store_id);
  const i = menu.findIndex((x:any)=>x.item_id===item.item_id);
  if (i>=0) menu[i] = { ...menu[i], ...item };
  else menu.push(item);
  await kv.put(MENU_KEY(store_id), JSON.stringify(menu));
  return item;
}

export async function realSetPayment(env:Env, store_id:string, status:string){
  const kv = env.PAYMENT_KV;
  if (!kv) throw new Error("PAYMENT_KV binding missing");
  await kv.put(`payment:${store_id}`, status);
  return status;
}

export async function realGetPayment(env:Env, store_id:string){
  const kv = env.PAYMENT_KV;
  if (!kv) throw new Error("PAYMENT_KV binding missing");
  return (await kv.get(`payment:${store_id}`)) || "trial";
}
