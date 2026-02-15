import type { PaymentStatus } from "./gates";

export type RemoteCatalogItem = {
  id: string;
  name: string;
  price: number;
  tags?: string[];
};

export type StoreReadResult = {
  paymentStatus?: PaymentStatus;
  store?: {
    name?: string;
    address?: string;
    sourceUrl?: string;
    mapUrl?: string;
    lpHeroImageUrl?: string;
    lpHeroVideoUrl?: string;
    businessRules?: {
      supportsCashless?: boolean;
      hasWifi?: boolean;
      hasOtoshi?: boolean;
    };
    liabilityAccepted?: {
      allergy?: boolean;
      religion?: boolean;
    };
  };
  menuItems: RemoteCatalogItem[];
  drinks: RemoteCatalogItem[];
  pairings?: Record<string, string[]>;
  bundleVersion?: string;
};

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "PAID" || value === "TRIAL" || value === "NG";
}

function normalizeItems(raw: unknown): RemoteCatalogItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: RemoteCatalogItem[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const name = typeof row.name === "string" ? row.name : null;
    const price = typeof row.price === "number" ? row.price : null;
    const tags = Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string")
      : undefined;
    if (!id || !name || price === null) {
      continue;
    }
    out.push({ id, name, price, tags });
  }
  return out;
}

export async function readStoreDocuments(storeId: string, token: string): Promise<StoreReadResult> {
  if (!token) {
    throw new Error("missing_gate_token");
  }
  const cached = memoryBundleCache.get(storeId);
  const res = await fetch(`/api/storeBundle?storeId=${encodeURIComponent(storeId)}`, {
    method: "GET",
    cache: "default",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(cached?.etag ? { "If-None-Match": cached.etag } : {})
    }
  });
  if (res.status === 304 && cached) {
    return cached.data;
  }
  if (!res.ok) {
    throw new Error("store_bundle_failed");
  }
  const json = (await res.json()) as Partial<StoreReadResult>;
  const pairings =
    typeof json.pairings === "object" && json.pairings !== null
      ? Object.fromEntries(
          Object.entries(json.pairings as Record<string, unknown>)
            .filter(([key, value]) => typeof key === "string" && Array.isArray(value))
            .map(([key, value]) => [
              key,
              (value as unknown[]).filter((entry): entry is string => typeof entry === "string")
            ])
        )
      : undefined;
  const out: StoreReadResult = {
    paymentStatus: isPaymentStatus(json.paymentStatus) ? json.paymentStatus : undefined,
    store: json.store,
    menuItems: normalizeItems(json.menuItems),
    drinks: normalizeItems(json.drinks),
    pairings,
    bundleVersion: typeof json.bundleVersion === "string" ? json.bundleVersion : undefined
  };
  const etag = res.headers.get("ETag");
  if (etag) {
    memoryBundleCache.set(storeId, { etag, data: out });
  }
  return out;
}

const memoryBundleCache = new Map<string, { etag: string; data: StoreReadResult }>();
