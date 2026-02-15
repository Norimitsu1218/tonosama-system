import { getApps, initializeApp } from "firebase-admin/app";
import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import type { PaymentStatus } from "./token";

if (getApps().length === 0) {
  initializeApp();
}

type CatalogItem = {
  id: string;
  name: string;
  price: number;
  tags?: string[];
};

type PairingMatrix = Record<string, string[]>;

type StoreBundleResult = {
  paymentStatus: PaymentStatus;
  store: {
    name: string | null;
    address: string | null;
    sourceUrl: string | null;
    mapUrl: string | null;
    lpHeroImageUrl: string | null;
    lpHeroVideoUrl: string | null;
    businessRules: {
      supportsCashless: boolean;
      hasWifi: boolean;
      hasOtoshi: boolean;
    } | null;
    liabilityAccepted: {
      allergy: boolean;
      religion: boolean;
    } | null;
  };
  menuItems: CatalogItem[];
  drinks: CatalogItem[];
  pairings: PairingMatrix;
  bundleVersion: string;
};

function normalizePairingOverrides(input: unknown): PairingMatrix {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  const source = input as Record<string, unknown>;
  const out: PairingMatrix = {};
  for (const [foodId, drinkIds] of Object.entries(source)) {
    if (!foodId || !Array.isArray(drinkIds)) {
      continue;
    }
    const ids = drinkIds.filter((id): id is string => typeof id === "string").slice(0, 3);
    if (ids.length > 0) {
      out[foodId] = [...new Set(ids)];
    }
  }
  return out;
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return value === "PAID" || value === "TRIAL" || value === "NG";
}

function normalizeCatalogItems(input: unknown): CatalogItem[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: CatalogItem[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const row = raw as Record<string, unknown>;
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

async function readStoreDoc(storeId: string): Promise<Record<string, unknown>> {
  const snapshot = await getFirestore().doc(`stores/${storeId}`).get();
  return (snapshot.data() as Record<string, unknown> | undefined) ?? {};
}

async function readCatalogDoc(path: string): Promise<Record<string, unknown>> {
  const snapshot = await getFirestore().doc(path).get();
  return (snapshot.data() as Record<string, unknown> | undefined) ?? {};
}

export async function readBillingMode(storeId: string): Promise<"STORE_PAYS" | "GUEST_PAYS"> {
  const store = await readStoreDoc(storeId);
  return store.billingMode === "STORE_PAYS" ? "STORE_PAYS" : "GUEST_PAYS";
}

export async function readPaymentStatus(storeId: string): Promise<PaymentStatus> {
  const store = await readStoreDoc(storeId);
  return isPaymentStatus(store.paymentStatus) ? store.paymentStatus : "NG";
}

export async function readStoreBundle(storeId: string): Promise<{
  paymentStatus: PaymentStatus;
  store: {
    name: string | null;
    address: string | null;
    sourceUrl: string | null;
    mapUrl: string | null;
    lpHeroImageUrl: string | null;
    lpHeroVideoUrl: string | null;
    businessRules: {
      supportsCashless: boolean;
      hasWifi: boolean;
      hasOtoshi: boolean;
    } | null;
    liabilityAccepted: {
      allergy: boolean;
      religion: boolean;
    } | null;
  };
  menuItems: CatalogItem[];
  drinks: CatalogItem[];
  pairings: PairingMatrix;
  bundleVersion: string;
}> {
  const [storeDoc, menuDoc, drinksDoc] = await Promise.all([
    readStoreDoc(storeId),
    readCatalogDoc(`menu_items/${storeId}`),
    readCatalogDoc(`drinks/${storeId}`)
  ]);

  const menuItems = normalizeCatalogItems(menuDoc.items ?? menuDoc.menu ?? []);
  const drinks = normalizeCatalogItems(drinksDoc.items ?? drinksDoc.drinks ?? []);
  const computedPairings = buildPairingMatrix(menuItems, drinks);
  const overridePairings = normalizePairingOverrides(storeDoc.pairingOverrides);
  const pairings: PairingMatrix = { ...computedPairings };
  for (const [foodId, drinkIds] of Object.entries(overridePairings)) {
    if (computedPairings[foodId] || menuItems.some((item) => item.id === foodId)) {
      pairings[foodId] = drinkIds;
    }
  }

  const base: Omit<StoreBundleResult, "bundleVersion"> = {
    paymentStatus: isPaymentStatus(storeDoc.paymentStatus) ? storeDoc.paymentStatus : "NG",
    store: {
      name: typeof storeDoc.name === "string" ? storeDoc.name : null,
      address: typeof storeDoc.address === "string" ? storeDoc.address : null,
      sourceUrl: typeof storeDoc.sourceUrl === "string" ? storeDoc.sourceUrl : null,
      mapUrl: typeof storeDoc.mapUrl === "string" ? storeDoc.mapUrl : null,
      lpHeroImageUrl: typeof storeDoc.lpHeroImageUrl === "string" ? storeDoc.lpHeroImageUrl : null,
      lpHeroVideoUrl: typeof storeDoc.lpHeroVideoUrl === "string" ? storeDoc.lpHeroVideoUrl : null,
      businessRules:
        typeof storeDoc.businessRules === "object" && storeDoc.businessRules !== null
          ? {
              supportsCashless: (storeDoc.businessRules as Record<string, unknown>).supportsCashless === true,
              hasWifi: (storeDoc.businessRules as Record<string, unknown>).hasWifi === true,
              hasOtoshi: (storeDoc.businessRules as Record<string, unknown>).hasOtoshi === true
            }
          : null,
      liabilityAccepted:
        typeof storeDoc.liabilityAccepted === "object" && storeDoc.liabilityAccepted !== null
          ? {
              allergy: (storeDoc.liabilityAccepted as Record<string, unknown>).allergy === true,
              religion: (storeDoc.liabilityAccepted as Record<string, unknown>).religion === true
            }
          : null
    },
    menuItems,
    drinks,
    pairings
  };
  return { ...base, bundleVersion: createBundleVersion(base) };
}

export type { CatalogItem };
export type { StoreBundleResult };

function extractTagValue(tags: string[] | undefined, prefix: string): string | null {
  if (!tags) {
    return null;
  }
  const hit = tags.find((tag) => tag.startsWith(`${prefix}:`));
  if (!hit) {
    return null;
  }
  return hit.slice(prefix.length + 1).toLowerCase();
}

function extractTagNumber(tags: string[] | undefined, prefix: string, fallback = 0): number {
  if (!tags) {
    return fallback;
  }
  const hit = tags.find((tag) => tag.startsWith(`${prefix}:`));
  if (!hit) {
    return fallback;
  }
  const value = Number.parseInt(hit.slice(prefix.length + 1), 10);
  return Number.isFinite(value) ? value : fallback;
}

function pairingScore(food: CatalogItem, drink: CatalogItem): number {
  const foodFlavor = extractTagValue(food.tags, "flavor");
  const drinkFlavor = extractTagValue(drink.tags, "flavor");
  const foodTemp = extractTagValue(food.tags, "temp");
  const drinkTemp = extractTagValue(drink.tags, "temp");
  const foodBody = extractTagValue(food.tags, "body");
  const drinkBody = extractTagValue(drink.tags, "body");
  const foodStory = extractTagNumber(food.tags, "story", 0);
  const drinkStory = extractTagNumber(drink.tags, "story", 0);

  let score = 0;
  if (foodFlavor && drinkFlavor) {
    if (foodFlavor === drinkFlavor) score += 3;
    else if (
      (foodFlavor === "rich" && drinkFlavor === "light") ||
      (foodFlavor === "light" && drinkFlavor === "rich") ||
      (foodFlavor === "spicy" && drinkFlavor === "sweet")
    ) {
      score += 2;
    }
  }
  if (foodTemp && drinkTemp) {
    if (foodTemp === drinkTemp) score += 2;
    else score += 1;
  }
  if (foodBody && drinkBody) {
    if (foodBody === drinkBody) score += 2;
    else score += 1;
  }
  score += Math.min(foodStory, drinkStory);
  return score;
}

export function buildPairingMatrix(menuItems: CatalogItem[], drinks: CatalogItem[]): PairingMatrix {
  if (menuItems.length === 0 || drinks.length === 0) {
    return {};
  }
  const out: PairingMatrix = {};
  for (const food of menuItems) {
    const ranked = [...drinks]
      .map((drink) => ({ id: drink.id, score: pairingScore(food, drink) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((row) => row.id);
    if (ranked.length > 0) {
      out[food.id] = ranked;
    }
  }
  return out;
}

export function createBundleVersion(bundle: Omit<StoreBundleResult, "bundleVersion">): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(bundle));
  return hash.digest("hex").slice(0, 16);
}
