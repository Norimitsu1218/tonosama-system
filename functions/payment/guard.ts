import type { PagesFunction } from "@cloudflare/workers-types";
import { Env, isMock, store, json } from "../_utils";
import { realGetPayment } from "../_real/store";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const store_id = url.searchParams.get("store_id") || "store_dev_0001";

  // mock
  if (isMock(env)) return json({ payment_status: store.payment || "trial" });

  // real (but never crash)
  try {
    const payment_status = await realGetPayment(env, store_id);
    return json({ payment_status: payment_status || "trial" });
  } catch (e:any) {
    console.error("[payment/guard] realGetPayment failed:", e?.message || e);
    return json({ payment_status: "trial", warn: "realGetPayment_failed" }, 200);
  }
};
