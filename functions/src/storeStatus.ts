export type StoreStatus = "CREATED" | "GENERATING" | "REVIEWING" | "PAID" | "LIVE";

export function toLiveStatus(current: unknown): StoreStatus {
  if (current === "PAID" || current === "LIVE") {
    return "LIVE";
  }
  return "LIVE";
}
