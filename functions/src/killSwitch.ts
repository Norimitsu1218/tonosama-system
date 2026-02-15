import { getFirestore } from "firebase-admin/firestore";

type KillSwitchConfig = {
  global: boolean;
  stores: Record<string, boolean>;
};

function parseBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseStores(value: unknown): Record<string, boolean> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const out: Record<string, boolean> = {};
  for (const [storeId, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (typeof enabled !== "boolean") {
      return null;
    }
    out[storeId] = enabled;
  }
  return out;
}

async function readConfig(): Promise<KillSwitchConfig | null> {
  const snapshot = await getFirestore().doc("control/killSwitch").get();
  if (!snapshot.exists) {
    return null;
  }
  const data = (snapshot.data() ?? {}) as Record<string, unknown>;
  const global = parseBoolean(data.global);
  const stores = parseStores(data.stores ?? {});
  if (global === null || stores === null) {
    return null;
  }
  return { global, stores };
}

export async function evaluateKillSwitch(storeId: string): Promise<{
  blocked: boolean;
  reason?: "global" | "store" | "config_error";
}> {
  try {
    const config = await readConfig();
    if (!config) {
      return { blocked: true, reason: "config_error" };
    }
    if (config.global) {
      return { blocked: true, reason: "global" };
    }
    if (config.stores[storeId] === true) {
      return { blocked: true, reason: "store" };
    }
    return { blocked: false };
  } catch {
    return { blocked: true, reason: "config_error" };
  }
}
