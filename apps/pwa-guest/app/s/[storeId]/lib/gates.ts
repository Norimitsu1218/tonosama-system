export type PaymentStatus = "PAID" | "TRIAL" | "NG";

export function isAllowed(status: PaymentStatus): boolean {
  return status === "PAID" || status === "TRIAL";
}
