export type McpReadAction = "readStoreProfile" | "readStoreBundle" | "readOwnerTelemetry";

export type StoreProfile = {
  storeId: string;
  name?: string;
  address?: string;
  mapUrl?: string;
};

export type StoreBundle = {
  paymentStatus: "PAID" | "TRIAL" | "NG";
  menuItems: Array<{ id: string; name: string; price: number; tags?: string[] }>;
  drinks: Array<{ id: string; name: string; price: number; tags?: string[] }>;
};

export type OwnerTelemetry = {
  storeId: string;
  range: "today" | "yesterday" | "7d" | "30d";
  days: Array<Record<string, number | string>>;
};

export interface McpReadOnlyAdapter {
  readStoreProfile(storeId: string): Promise<StoreProfile>;
  readStoreBundle(storeId: string): Promise<StoreBundle>;
  readOwnerTelemetry(storeId: string, range: OwnerTelemetry["range"]): Promise<OwnerTelemetry>;
}

export function assertReadOnlyAction(action: string): asserts action is McpReadAction {
  if (action !== "readStoreProfile" && action !== "readStoreBundle" && action !== "readOwnerTelemetry") {
    throw new Error(`read_only_violation:${action}`);
  }
}
