import { Env, json, bad, isMock, store } from "../_utils";
import { realSetPayment } from "../_real/store";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = await request.json().catch(()=>null) as any;
  if (!body?.store_id || !body?.status) {
    return bad(422, "INVALID", "store_id/status required");
  }
  if (isMock(env)) {
    store.payment = body.status;
    return json({ payment_status: store.payment });
  }
  const status = await realSetPayment(env, body.store_id, body.status);
  return json({ payment_status: status });
};
