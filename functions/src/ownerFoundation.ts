import { onRequest } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { appendApprovalLogEntry } from "./auditHash";
import { verifyOwnerRequest } from "./ownerAuth";
import { getOwnerClientHash, isOwnerRateLimited } from "./ownerRateLimit";
import { readPaymentStatus } from "./storeData";

type CatalogItemInput = {
  id: string;
  name: string;
  price: number;
  tags?: string[];
};

type VisionFrameInput = {
  kind: "food" | "drink";
  name: string;
  price?: number;
  tags?: string[];
  notes?: string;
};

if (getApps().length === 0) {
  initializeApp();
}

const BLOCKED_DOMAINS = ["tabelog.com", "retty.me", "hotpepper.jp", "gurunavi.com", "yelp.com"];
const OWNER_ACTION_COST_YEN: Record<string, number> = {
  foundation_update: 1,
  menu_import: 3,
  soul_capture: 2,
  crystallize: 5,
  sales_diagnosis: 1,
  business_model_select: 1,
  contract_accept: 1,
  activate_account: 1,
  shop_card_import: 1,
  trends_publish: 1,
  initial_fee_checkout: 1
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(value);
}

export function parseSourceUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isSafeSourceUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return !BLOCKED_DOMAINS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

export function extractWebsiteFromText(rawText: string): string | null {
  const hit = rawText.match(/https:\/\/[^\s]+/i);
  if (!hit) {
    return null;
  }
  const parsed = parseSourceUrl(hit[0]);
  if (!parsed || !isSafeSourceUrl(parsed)) {
    return null;
  }
  return parsed.toString();
}

function pickMoodTags(name: string, current: string[] = []): string[] {
  const lowered = name.toLowerCase();
  const tags = new Set(current.filter((tag) => tag === "HUNGRY" || tag === "RELAX" || tag === "ADVENTURE"));
  if (tags.size === 0) {
    if (/(set|don|丼|麺|定食|ramen|bowl|rice|noodle)/.test(lowered)) tags.add("HUNGRY");
    if (/(sake|酒|刺身|つまみ|tea|small plate)/.test(lowered)) tags.add("RELAX");
    if (/(rare|offal|spice|郷土|限定|adventure|季節)/.test(lowered)) tags.add("ADVENTURE");
  }
  if (tags.size === 0) {
    tags.add("HUNGRY");
  }
  return [...tags];
}

function deriveFoodSignals(name: string): string[] {
  const lowered = name.toLowerCase();
  const speed = /(salad|冷|small|漬け)/.test(lowered) ? 4 : /(stew|煮|slow)/.test(lowered) ? 2 : 3;
  const volume = /(set|丼|麺|定食|large|盛り)/.test(lowered) ? 5 : 3;
  const flavor = /(spice|辛|pepper|山椒)/.test(lowered)
    ? "spicy"
    : /(rich|濃厚|cream|脂)/.test(lowered)
      ? "rich"
      : "light";
  return [`speed:${speed}`, `volume:${volume}`, `flavor:${flavor}`];
}

function deriveDrinkSignals(name: string): string[] {
  const lowered = name.toLowerCase();
  const flavor = /(dry|辛口|gin|焼酎)/.test(lowered)
    ? "dry"
    : /(sweet|甘|ume|果実)/.test(lowered)
      ? "sweet"
      : /(rich|濃醇|aged|古酒)/.test(lowered)
        ? "rich"
        : "light";
  const story = /(限定|vintage|杜氏|地酒|single)/.test(lowered) ? 4 : 2;
  return [`flavor:${flavor}`, `story:${story}`];
}

function normalizeCatalogItems(raw: unknown, kind: "food" | "drink"): CatalogItemInput[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const out: CatalogItemInput[] = [];
  for (const row of raw) {
    if (!isObject(row)) {
      return null;
    }
    if (
      typeof row.id !== "string" ||
      !isValidId(row.id) ||
      typeof row.name !== "string" ||
      row.name.trim().length === 0 ||
      typeof row.price !== "number"
    ) {
      return null;
    }
    const baseTags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const moodTags = pickMoodTags(row.name, baseTags);
    const signalTags = kind === "food" ? deriveFoodSignals(row.name) : deriveDrinkSignals(row.name);
    out.push({
      id: row.id,
      name: row.name.trim(),
      price: row.price,
      tags: [...new Set([...moodTags, ...signalTags])]
    });
  }
  return out;
}

function buildVisionItemId(kind: "food" | "drink", name: string, index: number): string {
  const prefix = kind === "food" ? "f" : "d";
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `${prefix}-${slug || "item"}-${index + 1}`;
}

export function normalizeVisionFrames(raw: unknown): VisionFrameInput[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const out: VisionFrameInput[] = [];
  for (const frame of raw) {
    if (!isObject(frame)) {
      return null;
    }
    const kind = frame.kind;
    const name = frame.name;
    if ((kind !== "food" && kind !== "drink") || typeof name !== "string" || name.trim().length === 0) {
      return null;
    }
    const tags = Array.isArray(frame.tags) ? frame.tags.filter((x): x is string => typeof x === "string") : [];
    const price = typeof frame.price === "number" && Number.isFinite(frame.price) ? frame.price : undefined;
    const notes = typeof frame.notes === "string" ? frame.notes.trim() : undefined;
    out.push({
      kind,
      name: name.trim(),
      price,
      tags,
      notes
    });
  }
  return out;
}

function convertVisionFramesToCatalog(
  frames: VisionFrameInput[]
): { menuItems: CatalogItemInput[]; drinks: CatalogItemInput[] } {
  const menuItems: CatalogItemInput[] = [];
  const drinks: CatalogItemInput[] = [];
  frames.forEach((frame, index) => {
    const baseTags = [...(frame.tags ?? [])];
    if (frame.notes && frame.notes.length > 0) {
      baseTags.push(`vision_note:${frame.notes.slice(0, 40)}`);
    }
    const item: CatalogItemInput = {
      id: buildVisionItemId(frame.kind, frame.name, index),
      name: frame.name,
      price: frame.price ?? (frame.kind === "food" ? 980 : 620),
      tags: [...new Set([...pickMoodTags(frame.name, baseTags), ...(frame.kind === "food" ? deriveFoodSignals(frame.name) : deriveDrinkSignals(frame.name))])]
    };
    if (frame.kind === "food") {
      menuItems.push(item);
    } else {
      drinks.push(item);
    }
  });
  return { menuItems, drinks };
}

function parseVisionImportBody(raw: unknown):
  | {
      storeId: string;
      frames: VisionFrameInput[];
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  if (
    typeof raw.storeId !== "string" ||
    !isValidId(raw.storeId) ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  const frames = normalizeVisionFrames(raw.frames);
  if (!frames || frames.length < 3) {
    return null;
  }
  return {
    storeId: raw.storeId,
    frames,
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

function parsePairingOverridesBody(raw: unknown):
  | {
      storeId: string;
      pairings: Record<string, string[]>;
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  if (
    typeof raw.storeId !== "string" ||
    !isValidId(raw.storeId) ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0 ||
    typeof raw.pairings !== "object" ||
    raw.pairings === null ||
    Array.isArray(raw.pairings)
  ) {
    return null;
  }

  const source = raw.pairings as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [foodId, drinkIds] of Object.entries(source)) {
    if (!isValidId(foodId) || !Array.isArray(drinkIds) || drinkIds.length === 0) {
      return null;
    }
    const normalized = drinkIds
      .filter((id): id is string => typeof id === "string" && isValidId(id))
      .slice(0, 3);
    if (normalized.length === 0) {
      return null;
    }
    out[foodId] = [...new Set(normalized)];
  }

  return {
    storeId: raw.storeId,
    pairings: out,
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

function parseRulesBody(raw: unknown):
  | {
      storeId: string;
      sourceUrl: URL;
      supportsCashless: boolean;
      hasWifi: boolean;
      hasOtoshi: boolean;
      mapUrl?: URL;
      lpHeroImageUrl?: URL;
      lpHeroVideoUrl?: URL;
      liabilityAccepted: {
        allergy: boolean;
        religion: boolean;
      };
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  const sourceUrl = parseSourceUrl(raw.sourceUrl);
  if (
    typeof raw.storeId !== "string" ||
    !isValidId(raw.storeId) ||
    !sourceUrl ||
    typeof raw.supportsCashless !== "boolean" ||
    typeof raw.hasWifi !== "boolean" ||
    typeof raw.hasOtoshi !== "boolean" ||
    raw.liabilityAllergyAccepted !== true ||
    raw.liabilityReligionAccepted !== true ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  return {
    storeId: raw.storeId,
    sourceUrl,
    supportsCashless: raw.supportsCashless,
    hasWifi: raw.hasWifi,
    hasOtoshi: raw.hasOtoshi,
    mapUrl: parseSourceUrl(raw.mapUrl) ?? undefined,
    lpHeroImageUrl: parseSourceUrl(raw.lpHeroImageUrl) ?? undefined,
    lpHeroVideoUrl: parseSourceUrl(raw.lpHeroVideoUrl) ?? undefined,
    liabilityAccepted: {
      allergy: raw.liabilityAllergyAccepted === true,
      religion: raw.liabilityReligionAccepted === true
    },
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

async function recordOwnerCost(storeId: string, action: keyof typeof OWNER_ACTION_COST_YEN): Promise<void> {
  const amount = OWNER_ACTION_COST_YEN[action] ?? 0;
  if (amount <= 0) {
    return;
  }
  await getFirestore()
    .doc(`cost_log/${storeId}`)
    .set(
      {
        totalYen: FieldValue.increment(amount),
        byAction: { [action]: FieldValue.increment(amount) },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
}

function parseMenuImportBody(raw: unknown):
  | {
      storeId: string;
      menuItems: CatalogItemInput[];
      drinks: CatalogItemInput[];
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  if (
    typeof raw.storeId !== "string" ||
    !isValidId(raw.storeId) ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  const menuItems = normalizeCatalogItems(raw.menuItems, "food");
  if (!menuItems || menuItems.length < 3) {
    return null;
  }
  const drinks = normalizeCatalogItems(raw.drinks ?? [], "drink");
  if (!drinks) {
    return null;
  }
  return {
    storeId: raw.storeId,
    menuItems,
    drinks,
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

function parseSoulBody(raw: unknown):
  | {
      storeId: string;
      philosophy: string;
      hungryFast?: string;
      hungryVolume?: string;
      adventureIngredient?: string;
      salesPitchDrink?: string;
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  if (
    typeof raw.storeId !== "string" ||
    !isValidId(raw.storeId) ||
    typeof raw.philosophy !== "string" ||
    raw.philosophy.trim().length === 0 ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  return {
    storeId: raw.storeId,
    philosophy: raw.philosophy.trim(),
    hungryFast: typeof raw.hungryFast === "string" ? raw.hungryFast.trim() : undefined,
    hungryVolume: typeof raw.hungryVolume === "string" ? raw.hungryVolume.trim() : undefined,
    adventureIngredient: typeof raw.adventureIngredient === "string" ? raw.adventureIngredient.trim() : undefined,
    salesPitchDrink: typeof raw.salesPitchDrink === "string" ? raw.salesPitchDrink.trim() : undefined,
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

function parseCardDraftFromText(rawText: string): { name: string; address: string; phone: string; website: string | null } {
  const lines = rawText
    .split(/\r?\n/)
    .map((x: string) => x.trim())
    .filter((x: string) => x.length > 0);
  const name = lines[0] ?? "";
  const phone = lines.find((x: string) => /0\d{1,4}-\d{1,4}-\d{3,4}/.test(x)) ?? "";
  const address =
    lines.find((x: string) => /都|道|府|県|市|区|町|村/.test(x)) ??
    lines.slice(1).join(" ").slice(0, 120);
  const website = extractWebsiteFromText(rawText);
  return { name, address, phone, website };
}

function parseShopCardVisionBody(raw: unknown):
  | {
      storeId: string;
      blocks: string[];
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  if (
    typeof raw.storeId !== "string" ||
    !isValidId(raw.storeId) ||
    !Array.isArray(raw.blocks) ||
    raw.blocks.length === 0 ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  const blocks = raw.blocks.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x.length > 0);
  if (blocks.length === 0) {
    return null;
  }
  return {
    storeId: raw.storeId,
    blocks,
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

async function authorizeOwner(req: any, storeId: string) {
  const auth = await verifyOwnerRequest(req, storeId);
  if (!auth.ok) {
    return { ok: false as const, status: auth.status };
  }
  const clientHash = getOwnerClientHash(req);
  if (isOwnerRateLimited(storeId, clientHash)) {
    return { ok: false as const, status: 429 as const };
  }
  return { ok: true as const };
}

export const ownerStoreStatus = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const storeId = req.query.storeId;
  if (typeof storeId !== "string" || !isValidId(storeId)) {
    res.status(400).json({ error: "invalid_store_id" });
    return;
  }
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const [storeSnap, menuSnap, drinksSnap] = await Promise.all([
    getFirestore().doc(`stores/${storeId}`).get(),
    getFirestore().doc(`menu_items/${storeId}`).get(),
    getFirestore().doc(`drinks/${storeId}`).get()
  ]);
  const store = storeSnap.data() ?? {};
  const menuCount = Array.isArray(menuSnap.data()?.items) ? menuSnap.data()?.items.length : 0;
  const drinksCount = Array.isArray(drinksSnap.data()?.items) ? drinksSnap.data()?.items.length : 0;
  const readinessMissing: string[] = [];
  if (!store.sourceUrl) readinessMissing.push("source_url");
  if (!store.businessRules) readinessMissing.push("business_rules");
  if (!store.soulVoice) readinessMissing.push("soul_voice");
  if (menuCount < 3) readinessMissing.push("menu_items_min3");
  if (store.liabilityAccepted?.allergy !== true || store.liabilityAccepted?.religion !== true) {
    readinessMissing.push("liability_acceptance");
  }
  const readinessTotal = 5;
  const readinessScore = Math.max(0, Math.min(1, (readinessTotal - readinessMissing.length) / readinessTotal));
  const paymentStatus = await readPaymentStatus(storeId);
  res.status(200).json({
    storeId,
    paymentStatus,
    hasBusinessRules: !!store.businessRules,
    hasSoulVoice: !!store.soulVoice,
    dataCollection: {
      readinessScore,
      missing: readinessMissing,
      menuItems: menuCount,
      drinks: drinksCount
    },
    liabilityAccepted: {
      allergy: store.liabilityAccepted?.allergy === true,
      religion: store.liabilityAccepted?.religion === true
    }
  });
});

export const ownerCostStatus = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const storeId = req.query.storeId;
  if (typeof storeId !== "string" || !isValidId(storeId)) {
    res.status(400).json({ error: "invalid_store_id" });
    return;
  }
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }
  const cost = (await getFirestore().doc(`cost_log/${storeId}`).get()).data() ?? {};
  res.status(200).json({
    storeId,
    totalYen: typeof cost.totalYen === "number" ? cost.totalYen : 0,
    byAction: typeof cost.byAction === "object" && cost.byAction !== null ? cost.byAction : {}
  });
});

export const ownerBusinessRules = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parseRulesBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (!isSafeSourceUrl(parsed.sourceUrl)) {
    res.status(400).json({ error: "unsafe_source_url" });
    return;
  }
  if (parsed.mapUrl && !isSafeSourceUrl(parsed.mapUrl)) {
    res.status(400).json({ error: "unsafe_map_url" });
    return;
  }
  if (parsed.lpHeroImageUrl && !isSafeSourceUrl(parsed.lpHeroImageUrl)) {
    res.status(400).json({ error: "unsafe_hero_image_url" });
    return;
  }
  if (parsed.lpHeroVideoUrl && !isSafeSourceUrl(parsed.lpHeroVideoUrl)) {
    res.status(400).json({ error: "unsafe_hero_video_url" });
    return;
  }
  const auth = await authorizeOwner(req, parsed.storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  await getFirestore()
    .doc(`stores/${parsed.storeId}`)
    .set(
      {
        sourceUrl: parsed.sourceUrl.toString(),
        businessRules: {
          supportsCashless: parsed.supportsCashless,
          hasWifi: parsed.hasWifi,
          hasOtoshi: parsed.hasOtoshi
        },
        liabilityAccepted: {
          allergy: parsed.liabilityAccepted.allergy,
          religion: parsed.liabilityAccepted.religion
        },
        mapUrl: parsed.mapUrl?.toString() ?? null,
        lpHeroImageUrl: parsed.lpHeroImageUrl?.toString() ?? null,
        lpHeroVideoUrl: parsed.lpHeroVideoUrl?.toString() ?? null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(parsed.storeId, "foundation_update");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "foundation_update",
    storeId: parsed.storeId,
    reason: "business_rules_updated",
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });
  res.status(200).json({ ok: true, hash: log.hash });
});

export const ownerMenuImport = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parseMenuImportBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const auth = await authorizeOwner(req, parsed.storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const batch = getFirestore().batch();
  batch.set(getFirestore().doc(`menu_items/${parsed.storeId}`), { items: parsed.menuItems }, { merge: true });
  batch.set(getFirestore().doc(`drinks/${parsed.storeId}`), { items: parsed.drinks }, { merge: true });
  batch.set(
    getFirestore().doc(`stores/${parsed.storeId}`),
    { updatedAt: FieldValue.serverTimestamp(), importedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await batch.commit();
  await recordOwnerCost(parsed.storeId, "menu_import");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "menu_import",
    storeId: parsed.storeId,
    reason: `menu:${parsed.menuItems.length},drinks:${parsed.drinks.length}`,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });
  res.status(200).json({ ok: true, hash: log.hash });
});

export const ownerMenuVisionImport = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parseVisionImportBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const auth = await authorizeOwner(req, parsed.storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const catalog = convertVisionFramesToCatalog(parsed.frames);
  if (catalog.menuItems.length < 3) {
    res.status(400).json({ error: "menu_too_small" });
    return;
  }

  const batch = getFirestore().batch();
  batch.set(getFirestore().doc(`menu_items/${parsed.storeId}`), { items: catalog.menuItems }, { merge: true });
  batch.set(getFirestore().doc(`drinks/${parsed.storeId}`), { items: catalog.drinks }, { merge: true });
  batch.set(
    getFirestore().doc(`stores/${parsed.storeId}`),
    {
      visionImport: {
        frameCount: parsed.frames.length,
        importedAtMs: Date.now()
      },
      updatedAt: FieldValue.serverTimestamp(),
      importedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await batch.commit();
  await recordOwnerCost(parsed.storeId, "menu_import");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "menu_import",
    storeId: parsed.storeId,
    reason: `vision_frames:${parsed.frames.length},menu:${catalog.menuItems.length},drinks:${catalog.drinks.length}`,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });
  res.status(200).json({
    ok: true,
    hash: log.hash,
    menuCount: catalog.menuItems.length,
    drinkCount: catalog.drinks.length
  });
});

export const ownerPairingOverrides = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parsePairingOverridesBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const auth = await authorizeOwner(req, parsed.storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const menuDoc = await getFirestore().doc(`menu_items/${parsed.storeId}`).get();
  const drinksDoc = await getFirestore().doc(`drinks/${parsed.storeId}`).get();
  const menuItems = normalizeCatalogItems(menuDoc.data()?.items ?? menuDoc.data()?.menu ?? [], "food") ?? [];
  const drinks = normalizeCatalogItems(drinksDoc.data()?.items ?? drinksDoc.data()?.drinks ?? [], "drink") ?? [];
  const foodIds = new Set(menuItems.map((item) => item.id));
  const drinkIds = new Set(drinks.map((item) => item.id));

  for (const [foodId, targets] of Object.entries(parsed.pairings)) {
    if (!foodIds.has(foodId)) {
      res.status(400).json({ error: "unknown_food_id", foodId });
      return;
    }
    if (!targets.every((id) => drinkIds.has(id))) {
      res.status(400).json({ error: "unknown_drink_id", foodId });
      return;
    }
  }

  await getFirestore()
    .doc(`stores/${parsed.storeId}`)
    .set(
      {
        pairingOverrides: parsed.pairings,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(parsed.storeId, "menu_import");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "menu_import",
    storeId: parsed.storeId,
    reason: `pairing_overrides:${Object.keys(parsed.pairings).length}`,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });

  res.status(200).json({ ok: true, hash: log.hash, pairings: parsed.pairings });
});

export const ownerSoulCapture = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parseSoulBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const auth = await authorizeOwner(req, parsed.storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  await getFirestore()
    .doc(`stores/${parsed.storeId}`)
    .set(
      {
        soulVoice: {
          philosophy: parsed.philosophy,
          hungryFast: parsed.hungryFast ?? null,
          hungryVolume: parsed.hungryVolume ?? null,
          adventureIngredient: parsed.adventureIngredient ?? null,
          salesPitchDrink: parsed.salesPitchDrink ?? null
        },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(parsed.storeId, "soul_capture");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "soul_capture",
    storeId: parsed.storeId,
    reason: "soul_voice_updated",
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });
  res.status(200).json({ ok: true, hash: log.hash });
});

export const ownerCrystallize = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const [storeDoc, menuDoc, drinksDoc] = await Promise.all([
    getFirestore().doc(`stores/${storeId}`).get(),
    getFirestore().doc(`menu_items/${storeId}`).get(),
    getFirestore().doc(`drinks/${storeId}`).get()
  ]);
  const store = storeDoc.data() ?? {};
  const menuItems = (menuDoc.data()?.items as CatalogItemInput[] | undefined) ?? [];
  const drinks = (drinksDoc.data()?.items as CatalogItemInput[] | undefined) ?? [];
  if (menuItems.length < 1) {
    res.status(400).json({ error: "menu_missing" });
    return;
  }
  if (store.liabilityAccepted?.allergy !== true || store.liabilityAccepted?.religion !== true) {
    res.status(400).json({ error: "liability_unaccepted" });
    return;
  }

  const philosophy = typeof store.soulVoice?.philosophy === "string" ? store.soulVoice.philosophy : "季節と火入れを大切にしています。";
  const catchCopy = `${store.name ?? "この店"}の魂を、ひと皿ずつ。`;
  const history = `${philosophy} 看板料理は${menuItems[0]?.name ?? "おすすめ料理"}。`;
  const jitSeed = {
    ja: menuItems.map((x) => x.name),
    en: menuItems.map((x) => x.name),
    fr: menuItems.map((x) => x.name),
    zh: menuItems.map((x) => x.name)
  };

  await getFirestore()
    .doc(`menu_master/${storeId}`)
    .set(
      {
        storeId,
        ready: true,
        catchCopy,
        history,
        jitSeed,
        menuItems,
        drinks,
        costLogYen: 0,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "crystallize");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "crystallize",
    storeId,
    reason: "menu_master_ready",
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({ ok: true, hash: log.hash, catchCopy });
});

export const ownerSalesDiagnosis = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    typeof body.seats !== "number" ||
    typeof body.avgSpendYen !== "number" ||
    typeof body.turnsPerDay !== "number" ||
    typeof body.extraInboundGroupsPerDay !== "number" ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const seats = Math.max(1, Math.floor(body.seats));
  const avgSpendYen = Math.max(1, Math.floor(body.avgSpendYen));
  const turnsPerDay = Math.max(1, Math.floor(body.turnsPerDay));
  const extraInboundGroupsPerDay = Math.max(0, Math.floor(body.extraInboundGroupsPerDay));
  const estimatedDailyBaseYen = seats * avgSpendYen * turnsPerDay;
  const estimatedMonthlyLiftYen = extraInboundGroupsPerDay * avgSpendYen * 30;
  const estimatedAnnualLiftYen = estimatedMonthlyLiftYen * 12;
  await recordOwnerCost(storeId, "sales_diagnosis");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "sales_diagnosis",
    storeId,
    reason: `daily:${estimatedDailyBaseYen},monthlyLift:${estimatedMonthlyLiftYen}`,
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({
    ok: true,
    hash: log.hash,
    estimatedDailyBaseYen,
    estimatedMonthlyLiftYen,
    estimatedAnnualLiftYen
  });
});

export const ownerBusinessModel = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    (body.model !== "CASHBACK" && body.model !== "HOSPITALITY") ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const model = body.model as "CASHBACK" | "HOSPITALITY";
  const billingMode = model === "HOSPITALITY" ? "STORE_PAYS" : "GUEST_PAYS";
  await getFirestore()
    .doc(`stores/${storeId}`)
    .set(
      {
        businessModel: model,
        billingMode,
        cashbackPerUseYen: model === "CASHBACK" ? 11 : 0,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "business_model_select");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "business_model_select",
    storeId,
    reason: `${model}:${billingMode}`,
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({ ok: true, hash: log.hash, billingMode });
});

export const ownerContractAccept = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    body.acceptTerms !== true ||
    body.acceptAntiSocialClause !== true ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  await getFirestore()
    .doc(`stores/${storeId}`)
    .set(
      {
        contract: {
          accepted: true,
          antiSocialClauseAccepted: true,
          acceptedAtMs: Date.now()
        },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "contract_accept");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "contract_accept",
    storeId,
    reason: "terms+antisocial_accepted",
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({ ok: true, hash: log.hash });
});

export const ownerActivateAccount = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  await getFirestore()
    .doc(`stores/${storeId}`)
    .set(
      {
        paymentStatus: "PAID",
        activatedAtMs: Date.now(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "activate_account");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "activate_account",
    storeId,
    reason: "paymentStatus=PAID",
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({ ok: true, hash: log.hash, paymentStatus: "PAID" });
});

export const ownerShopCardImport = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    typeof body.name !== "string" ||
    body.name.trim().length === 0 ||
    typeof body.address !== "string" ||
    body.address.trim().length === 0 ||
    typeof body.phone !== "string" ||
    body.phone.trim().length === 0 ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  await getFirestore()
    .doc(`stores/${storeId}`)
    .set(
      {
        name: body.name.trim(),
        address: body.address.trim(),
        phone: body.phone.trim(),
        logoUrl: typeof body.logoUrl === "string" ? body.logoUrl.trim() : null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "shop_card_import");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "shop_card_import",
    storeId,
    reason: "shop_card_imported",
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({ ok: true, hash: log.hash });
});

export const ownerPublishTrends = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const source = await getFirestore().doc(`telemetry_daily/${storeId}_${ymd}`).get();
  const telemetry = source.data() ?? {};
  await getFirestore()
    .doc(`global_food_trends/${storeId}_${ymd}`)
    .set(
      {
        storeId,
        day: ymd,
        gate_allowed: Number(telemetry.gate_allowed ?? 0),
        consent: Number(telemetry.consent ?? 0),
        tray_add: Number(telemetry.tray_add ?? 0),
        slip: Number(telemetry.slip ?? 0),
        sumimasen: Number(telemetry.sumimasen ?? 0),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "trends_publish");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "trends_publish",
    storeId,
    reason: `trend_day:${ymd}`,
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({ ok: true, hash: log.hash, day: ymd });
});

export const ownerInitialFeeCheckout = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const minuteWindow = Math.floor(Date.now() / 60000);
  const idempotencyKey = createHash("sha256")
    .update(`${storeId}:initialFee:49800:${minuteWindow}`)
    .digest("hex")
    .slice(0, 32);

  await getFirestore()
    .doc(`stores/${storeId}`)
    .set(
      {
        onboarding: {
          initialFeeCheckoutRequestedAtMs: Date.now(),
          initialFeeAmountYen: 49800,
          checkoutStatus: "PENDING"
        },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "initial_fee_checkout");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "initial_fee_checkout",
    storeId,
    reason: `49800:${idempotencyKey}`,
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({
    ok: true,
    hash: log.hash,
    amountYen: 49800,
    idempotencyKey,
    checkoutStatus: "PENDING"
  });
});

export const ownerShopCardParse = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const body = req.body;
  if (
    !isObject(body) ||
    typeof body.storeId !== "string" ||
    !isValidId(body.storeId) ||
    typeof body.rawText !== "string" ||
    body.rawText.trim().length === 0 ||
    typeof body.intent !== "string" ||
    body.intent.trim().length === 0 ||
    typeof body.allowed_use !== "string" ||
    body.allowed_use.trim().length === 0
  ) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const storeId = body.storeId;
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const { name, address, phone, website } = parseCardDraftFromText(body.rawText);

  await getFirestore()
    .doc(`stores/${storeId}`)
    .set(
      {
        cardDraft: {
          name: name || null,
          address: address || null,
          phone: phone || null,
          website: website || null
        },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(storeId, "shop_card_import");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "shop_card_import",
    storeId,
    reason: "shop_card_parsed",
    intent: body.intent.trim(),
    allowed_use: body.allowed_use.trim()
  });
  res.status(200).json({ ok: true, hash: log.hash, name, address, phone, website });
});

export const ownerShopCardVisionParse = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parseShopCardVisionBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const auth = await authorizeOwner(req, parsed.storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const mergedText = parsed.blocks.join("\n");
  const { name, address, phone, website } = parseCardDraftFromText(mergedText);
  await getFirestore()
    .doc(`stores/${parsed.storeId}`)
    .set(
      {
        cardDraft: {
          name: name || null,
          address: address || null,
          phone: phone || null,
          website: website || null,
          visionBlocks: parsed.blocks.slice(0, 20)
        },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await recordOwnerCost(parsed.storeId, "shop_card_import");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "shop_card_import",
    storeId: parsed.storeId,
    reason: `shop_card_vision_blocks:${parsed.blocks.length}`,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });
  res.status(200).json({ ok: true, hash: log.hash, name, address, phone, website });
});

export const ownerStoreQr = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const storeId = req.query.storeId;
  if (typeof storeId !== "string" || !isValidId(storeId)) {
    res.status(400).json({ error: "invalid_store_id" });
    return;
  }
  const auth = await authorizeOwner(req, storeId);
  if (!auth.ok) {
    if (auth.status === 429) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }
  const base = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.length > 0 ? process.env.PUBLIC_BASE_URL : "https://tonosama.app";
  const permanentUrl = `${base.replace(/\/+$/, "")}/s/${storeId}`;
  const qrPayload = `TONOSAMA|${storeId}|${permanentUrl}`;
  res.status(200).json({ storeId, permanentUrl, qrPayload });
});
