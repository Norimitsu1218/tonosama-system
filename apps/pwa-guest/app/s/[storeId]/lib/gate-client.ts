import type { PaymentStatus } from "./gates";

export type GateResult = {
  token: string;
  exp: number;
  paymentStatus: PaymentStatus;
};

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "PAID" || value === "TRIAL" || value === "NG";
}

export async function requestGateToken(storeId: string): Promise<GateResult | null> {
  const res = await fetch(`/api/gate?storeId=${encodeURIComponent(storeId)}`, {
    method: "GET",
    cache: "no-store"
  });
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as Partial<GateResult> & { allowed?: boolean };
  if (json.allowed !== true || typeof json.token !== "string" || typeof json.exp !== "number") {
    return null;
  }
  if (!isPaymentStatus(json.paymentStatus)) {
    return null;
  }
  return {
    token: json.token,
    exp: json.exp,
    paymentStatus: json.paymentStatus
  };
}
