import { Env, json, isMock, store } from "../_utils";
import { realGetPayment } from "../_real/store";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const store_id = url.searchParams.get("store_id") || "store_dev_0001";

  if (isMock(env)) return json({ payment_status: store.payment || "trial" });

  const payment_status = await realGetPayment(env, store_id);
  return json({ payment_status });
};
