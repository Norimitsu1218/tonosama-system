import { Env, store, json } from "../_utils";

export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ payment_status: store.payment || "trial" });
};
