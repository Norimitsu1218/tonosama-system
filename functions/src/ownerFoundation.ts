import { onRequest } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { genkit, z as genkitZ } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const ai = GEMINI_API_KEY
  ? genkit({
      plugins: [googleAI({ apiKey: GEMINI_API_KEY })],
      model: googleAI.model("gemini-2.5-pro")
    })
  : null;

const SoulVectorSchema = genkitZ.object({
  philosophy: genkitZ.string(),
  hungryFast: genkitZ.string(),
  hungryVolume: genkitZ.string(),
  adventureIngredient: genkitZ.string(),
  salesPitchDrink: genkitZ.string(),
  pairingPitch: genkitZ.string(),
  report18s: genkitZ.string(),
  translationSeeds: genkitZ.object({
    ja: genkitZ.string(),
    en: genkitZ.string(),
    fr: genkitZ.string(),
    zh: genkitZ.string()
  })
});

const VisionCatalogSchema = genkitZ.object({
  frames: genkitZ.array(
    genkitZ.object({
      kind: genkitZ.enum(["food", "drink"]),
      name: genkitZ.string(),
      price: genkitZ.number().optional(),
      tags: genkitZ.array(genkitZ.string()).optional(),
      notes: genkitZ.string().optional()
    })
  )
});

const OWNER_ACTION_COST_YEN: Record<string, number> = {
  foundation_update: 1,
  menu_import: 30,
  soul_capture: 20,
  crystallize: 5,
  sales_diagnosis: 1,
  business_model_select: 1,
  contract_accept: 1,
  activate_account: 1,
  shop_card_import: 1,
  trends_publish: 1,
  initial_fee_checkout: 1,
  partner_closing: 1,
  geo_bootstrap: 1
};

async function generateSoulVector(input: {
  storeId: string;
  philosophyHint: string;
  transcript?: string;
  menuText?: string;
}): Promise<genkitZ.infer<typeof SoulVectorSchema> | null> {
  if (!ai) {
    return null;
  }
  const prompt = [
    "You are TONOSAMA onboarding AI for Japanese restaurants.",
    "Create a high-conviction soul vector for sales demo. Keep Japanese natural.",
    "Need fields: philosophy, hungryFast, hungryVolume, adventureIngredient, salesPitchDrink, pairingPitch, report18s.",
    "Also produce translationSeeds for ja/en/fr/zh in one sentence each.",
    "Input context:",
    JSON.stringify(input)
  ].join("\n");
  try {
    const response = await ai.generate({
      prompt,
      output: { schema: SoulVectorSchema },
      config: { temperature: 0.55, maxOutputTokens: 900 }
    });
    return response.output ?? null;
  } catch {
    return null;
  }
}

async function generateVisionFrames(input: { imageUrls?: string[]; menuText?: string }): Promise<VisionFrameInput[] | null> {
  if (!ai) {
    return null;
  }
  const prompt = [
    "You are TONOSAMA multimodal parser.",
    "From image urls and menu text, infer at least 4 menu/drink frames.",
    "Each frame must include kind, name, optional price, tags, notes.",
    "Tags should include mood hints and serving style hints.",
    "Input:",
    JSON.stringify(input)
  ].join("\n");
  try {
    const response = await ai.generate({
      prompt,
      output: { schema: VisionCatalogSchema },
      config: { temperature: 0.35, maxOutputTokens: 1000 }
    });
    const frames = response.output?.frames ?? [];
    return frames.length > 0 ? frames : null;
  } catch {
    return null;
  }
}

const TranslationSeedSchema = genkitZ.object({
  ja: genkitZ.array(genkitZ.string()),
  en: genkitZ.array(genkitZ.string()),
  fr: genkitZ.array(genkitZ.string()),
  zh: genkitZ.array(genkitZ.string())
});

async function generateTranslationSeed(input: { philosophy: string; menuItems: string[] }): Promise<genkitZ.infer<typeof TranslationSeedSchema> | null> {
  if (!ai) {
    return null;
  }
  const prompt = [
    "Create concise translation seed phrases for restaurant menu onboarding.",
    "Return arrays for ja,en,fr,zh with same length as menuItems.",
    "Focus on appetite and pairing cues, not literal dictionary style.",
    JSON.stringify(input)
  ].join("\n");
  try {
    const response = await ai.generate({
      prompt,
      output: { schema: TranslationSeedSchema },
      config: { temperature: 0.4, maxOutputTokens: 800 }
    });
    return response.output ?? null;
  } catch {
    return null;
  }
}

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

function toFormBody(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    search.append(k, v);
  }
  return search.toString();
}

async function createStripeCloserCheckoutSession(args: {
  secretKey: string;
  successUrl: string;
  cancelUrl: string;
  storeId: string;
  partnerId: string;
  idempotencyKey: string;
}): Promise<{ id: string; url: string } | null> {
  const payload = toFormBody({
    mode: "payment",
    success_url: `${args.successUrl}?session_id={CHECKOUT_SESSION_ID}&store_id=${args.storeId}`,
    cancel_url: `${args.cancelUrl}?store_id=${args.storeId}`,
    "line_items[0][price_data][currency]": "jpy",
    "line_items[0][price_data][unit_amount]": "49800",
    "line_items[0][price_data][product_data][name]": "TONOSAMA System Activation",
    "line_items[0][price_data][product_data][description]": `Store ${args.storeId} activation by partner ${args.partnerId}`,
    "line_items[0][quantity]": "1",
    "metadata[storeId]": args.storeId,
    "metadata[partnerId]": args.partnerId,
    "metadata[flow]": "partner_closer",
    "metadata[checkoutKind]": "partner_closer"
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": args.idempotencyKey
    },
    body: payload
  });
  if (!response.ok) {
    return null;
  }
  const json = (await response.json()) as { id?: string; url?: string };
  if (typeof json.id !== "string" || typeof json.url !== "string") {
    return null;
  }
  return { id: json.id, url: json.url };
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
      frames?: VisionFrameInput[];
      imageUrls?: string[];
      menuText?: string;
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
  const imageUrls = Array.isArray(raw.imageUrls)
    ? raw.imageUrls.filter((x): x is string => typeof x === "string" && x.startsWith("https://")).slice(0, 12)
    : [];
  const menuText = typeof raw.menuText === "string" ? raw.menuText.trim() : undefined;
  if ((!frames || frames.length < 3) && imageUrls.length === 0 && !menuText) {
    return null;
  }
  return {
    storeId: raw.storeId,
    frames: frames ?? undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    menuText,
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
      philosophy?: string;
      autoInterview?: {
        transcript?: string;
        menuText?: string;
      };
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
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  const philosophy = typeof raw.philosophy === "string" ? raw.philosophy.trim() : "";
  const transcript = typeof raw.ownerInterviewTranscript === "string" ? raw.ownerInterviewTranscript.trim() : "";
  const menuText = typeof raw.menuText === "string" ? raw.menuText.trim() : "";
  const hasAutoInterview = transcript.length > 0 || menuText.length > 0 || raw.autoInterview === true;
  if (philosophy.length === 0 && !hasAutoInterview) {
    return null;
  }
  return {
    storeId: raw.storeId,
    philosophy: philosophy.length > 0 ? philosophy : undefined,
    autoInterview: hasAutoInterview ? { transcript: transcript || undefined, menuText: menuText || undefined } : undefined,
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

function parsePartnerClosingBody(raw: unknown):
  | {
      partnerId: string;
      storeName: string;
      sourceUrl?: URL;
      address?: string;
      phone?: string;
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  if (
    typeof raw.partnerId !== "string" ||
    !isValidId(raw.partnerId) ||
    typeof raw.storeName !== "string" ||
    raw.storeName.trim().length < 2 ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  return {
    partnerId: raw.partnerId.trim(),
    storeName: raw.storeName.trim(),
    sourceUrl: parseSourceUrl(raw.sourceUrl) ?? undefined,
    address: typeof raw.address === "string" ? raw.address.trim() : undefined,
    phone: typeof raw.phone === "string" ? raw.phone.trim() : undefined,
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

function parseGeoBootstrapBody(raw: unknown):
  | {
      partnerId: string;
      latitude: number;
      longitude: number;
      storeName?: string;
      intent: string;
      allowed_use: string;
    }
  | null {
  if (!isObject(raw)) {
    return null;
  }
  if (
    typeof raw.partnerId !== "string" ||
    !isValidId(raw.partnerId) ||
    typeof raw.latitude !== "number" ||
    !Number.isFinite(raw.latitude) ||
    typeof raw.longitude !== "number" ||
    !Number.isFinite(raw.longitude) ||
    typeof raw.intent !== "string" ||
    raw.intent.trim().length === 0 ||
    typeof raw.allowed_use !== "string" ||
    raw.allowed_use.trim().length === 0
  ) {
    return null;
  }
  return {
    partnerId: raw.partnerId.trim(),
    latitude: raw.latitude,
    longitude: raw.longitude,
    storeName: typeof raw.storeName === "string" && raw.storeName.trim().length > 0 ? raw.storeName.trim() : undefined,
    intent: raw.intent.trim(),
    allowed_use: raw.allowed_use.trim()
  };
}

function fallbackVisionFramesFromGeo(args: { latitude: number; longitude: number }): VisionFrameInput[] {
  const latTag = args.latitude >= 35 ? "north" : "south";
  const lngTag = args.longitude >= 135 ? "east" : "west";
  return [
    { kind: "food", name: "旬魚の刺身盛り", price: 1380, tags: ["RELAX", `geo:${latTag}_${lngTag}`], notes: "fresh fish plate" },
    { kind: "food", name: "炭火焼き鶏", price: 880, tags: ["HUNGRY"], notes: "charcoal grilled chicken" },
    { kind: "food", name: "季節野菜のおひたし", price: 620, tags: ["RELAX"], notes: "light starter" },
    { kind: "food", name: "珍味三点盛り", price: 980, tags: ["ADVENTURE"], notes: "adventure plate" },
    { kind: "drink", name: "地酒 辛口", price: 780, tags: ["RELAX"], notes: "dry sake" },
    { kind: "drink", name: "ハイボール メガ", price: 690, tags: ["HUNGRY"], notes: "highball mega" }
  ];
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
  const readinessTotal = 4;
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

  const inferredFrames = parsed.frames ?? (await generateVisionFrames({ imageUrls: parsed.imageUrls, menuText: parsed.menuText }));
  if (!inferredFrames || inferredFrames.length < 3) {
    res.status(400).json({ error: "vision_frames_missing" });
    return;
  }
  const catalog = convertVisionFramesToCatalog(inferredFrames);
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
          frameCount: inferredFrames.length,
          sourceImageCount: parsed.imageUrls?.length ?? 0,
          importedAtMs: Date.now()
        },
        semanticCore: {
          languageSeedReady: true,
          generatedBy: "gemini"
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
    reason: `vision_frames:${inferredFrames.length},menu:${catalog.menuItems.length},drinks:${catalog.drinks.length}`,
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

  const aiSoul = await generateSoulVector({
    storeId: parsed.storeId,
    philosophyHint: parsed.philosophy ?? "店主のこだわりを強調してください。",
    transcript: parsed.autoInterview?.transcript,
    menuText: parsed.autoInterview?.menuText
  });

  const soulVoice = {
    philosophy: parsed.philosophy ?? aiSoul?.philosophy ?? "季節と火入れを大切にしています。",
    hungryFast: parsed.hungryFast ?? aiSoul?.hungryFast ?? null,
    hungryVolume: parsed.hungryVolume ?? aiSoul?.hungryVolume ?? null,
    adventureIngredient: parsed.adventureIngredient ?? aiSoul?.adventureIngredient ?? null,
    salesPitchDrink: parsed.salesPitchDrink ?? aiSoul?.salesPitchDrink ?? null,
    pairingPitch: aiSoul?.pairingPitch ?? null,
    report18s: aiSoul?.report18s ?? null,
    translationSeeds: aiSoul?.translationSeeds ?? null
  };

  await getFirestore()
    .doc(`stores/${parsed.storeId}`)
    .set(
      {
        soulVoice,
        soulVector: {
          generatedAtMs: Date.now(),
          mode: aiSoul ? "AI_ASSISTED" : "MANUAL",
          source: parsed.autoInterview ? "LIVE_INTERVIEW" : "FORM"
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

  const philosophy = typeof store.soulVoice?.philosophy === "string" ? store.soulVoice.philosophy : "季節と火入れを大切にしています。";
  const catchCopy = `${store.name ?? "この店"}の魂を、ひと皿ずつ。`;
  const history = `${philosophy} 看板料理は${menuItems[0]?.name ?? "おすすめ料理"}。`;
  const generatedSeed = await generateTranslationSeed({ philosophy, menuItems: menuItems.map((x) => x.name) });
  const jitSeed = generatedSeed ?? {
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
        soulVector: store.soulVoice ?? null,
        menuItems,
        drinks,
        costLogYen: 0,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  await getFirestore()
    .doc(`stores/${storeId}`)
    .set(
      {
        status: "REVIEWING",
        isPublic: false,
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

export const ownerPartnerClosing = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parsePartnerClosingBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const token = req.header("x-owner-token") ?? "";
  const expectedToken = process.env.PARTNER_API_TOKEN ?? process.env.OWNER_API_TOKEN ?? "";
  if (!expectedToken || token !== expectedToken) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const partnerScope = `partner_${parsed.partnerId}`;
  const clientHash = getOwnerClientHash(req);
  if (isOwnerRateLimited(partnerScope, clientHash)) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const storeRef = getFirestore().collection("stores").doc();
  await storeRef.set(
    {
      name: parsed.storeName,
      address: parsed.address ?? null,
      phone: parsed.phone ?? null,
      sourceUrl: parsed.sourceUrl?.toString() ?? null,
      partnerId: parsed.partnerId,
      status: "REVIEWING",
      isPublic: false,
      paymentStatus: "NG",
      onboarding: {
        flow: "partner_closer",
        createdByPartner: parsed.partnerId,
        checkoutStatus: "PENDING"
      },
      createdAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    res.status(503).json({ error: "stripe_not_ready" });
    return;
  }
  const publicBase = (process.env.PUBLIC_BASE_URL ?? "https://apicius-owner.web.app").replace(/\/+$/, "");
  const successUrl = process.env.OWNER_CLOSER_SUCCESS_URL ?? `${publicBase}/activate/success`;
  const cancelUrl = process.env.OWNER_CLOSER_CANCEL_URL ?? `${publicBase}/activate/cancel`;
  const idempotencyKey = createHash("sha256")
    .update(`${storeRef.id}:${parsed.partnerId}:closer:${Math.floor(Date.now() / 60000)}`)
    .digest("hex")
    .slice(0, 32);

  const checkout = await createStripeCloserCheckoutSession({
    secretKey: stripeSecret,
    successUrl,
    cancelUrl,
    storeId: storeRef.id,
    partnerId: parsed.partnerId,
    idempotencyKey
  });
  if (!checkout) {
    res.status(503).json({ error: "stripe_checkout_failed", storeId: storeRef.id });
    return;
  }

  await storeRef.set(
    {
      onboarding: {
        flow: "partner_closer",
        checkoutStatus: "PENDING",
        checkoutSessionId: checkout.id,
        checkoutRequestedAtMs: Date.now()
      },
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await recordOwnerCost(storeRef.id, "partner_closing");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "initial_fee_checkout",
    storeId: storeRef.id,
    reason: `partner_closer:${parsed.partnerId}:${idempotencyKey}`,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });
  res.status(200).json({
    ok: true,
    hash: log.hash,
    storeId: storeRef.id,
    status: "REVIEWING",
    checkoutUrl: checkout.url,
    checkoutSessionId: checkout.id
  });
});

export const ownerGeoBootstrap = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parseGeoBootstrapBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const token = req.header("x-owner-token") ?? "";
  const expectedToken = process.env.PARTNER_API_TOKEN ?? process.env.OWNER_API_TOKEN ?? "";
  if (!expectedToken || token !== expectedToken) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const partnerScope = `partner_${parsed.partnerId}`;
  const clientHash = getOwnerClientHash(req);
  if (isOwnerRateLimited(partnerScope, clientHash)) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const startedAt = Date.now();
  const storeRef = getFirestore().collection("stores").doc();
  const storeId = storeRef.id;
  const storeName = parsed.storeName ?? `TONOSAMA-${storeId.slice(0, 6)}`;
  const geoHint = `lat:${parsed.latitude.toFixed(5)},lng:${parsed.longitude.toFixed(5)}`;

  const soulPromise = generateSoulVector({
    storeId,
    philosophyHint: `${storeName} の看板体験を作る。${geoHint}`,
    transcript: `${storeName} の店頭デモ。最速提供と高単価ペアリングを重視。`,
    menuText: "刺身、焼き鳥、珍味、日本酒、ハイボール"
  });
  const visionPromise = generateVisionFrames({
    menuText: `${storeName} ${geoHint} 店頭デモ用メニュー`
  });
  const [aiSoul, aiVision] = await Promise.all([soulPromise, visionPromise]);

  const frames = aiVision && aiVision.length >= 4 ? aiVision : fallbackVisionFramesFromGeo(parsed);
  const catalog = convertVisionFramesToCatalog(frames);
  const translationSeed = await generateTranslationSeed({
    philosophy: aiSoul?.philosophy ?? `${storeName} の魂を最大化する`,
    menuItems: catalog.menuItems.map((x) => x.name)
  });

  const base = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.length > 0 ? process.env.PUBLIC_BASE_URL : "https://apicius-6bcae.web.app";
  const guestUrl = `${base.replace(/\/+$/, "")}/s/${storeId}?lang=ja`;

  const batch = getFirestore().batch();
  batch.set(
    storeRef,
    {
      name: storeName,
      partnerId: parsed.partnerId,
      status: "REVIEWING",
      isPublic: false,
      paymentStatus: "TRIAL",
      coordinates: { lat: parsed.latitude, lng: parsed.longitude },
      sourceUrl: null,
      businessRules: {
        supportsCashless: true,
        hasWifi: true,
        hasOtoshi: false
      },
      soulVoice: {
        philosophy: aiSoul?.philosophy ?? `${storeName} の魂を一皿に込める`,
        hungryFast: aiSoul?.hungryFast ?? "枝豆と炙りしめ鯖",
        hungryVolume: aiSoul?.hungryVolume ?? "炭火焼き鶏盛り",
        adventureIngredient: aiSoul?.adventureIngredient ?? "珍味三点盛り",
        salesPitchDrink: aiSoul?.salesPitchDrink ?? "地酒 辛口",
        pairingPitch: aiSoul?.pairingPitch ?? null,
        report18s: aiSoul?.report18s ?? null,
        translationSeeds: aiSoul?.translationSeeds ?? null
      },
      onboarding: {
        flow: "geo_bootstrap",
        generatedAtMs: Date.now()
      },
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  batch.set(getFirestore().doc(`menu_items/${storeId}`), { items: catalog.menuItems }, { merge: true });
  batch.set(getFirestore().doc(`drinks/${storeId}`), { items: catalog.drinks }, { merge: true });
  batch.set(
    getFirestore().doc(`menu_master/${storeId}`),
    {
      storeId,
      ready: true,
      catchCopy: `${storeName} の魂を、ひと皿ずつ。`,
      history: aiSoul?.philosophy ?? `${storeName} の看板体験を10秒で起動。`,
      jitSeed: translationSeed ?? {
        ja: catalog.menuItems.map((x) => x.name),
        en: catalog.menuItems.map((x) => x.name),
        fr: catalog.menuItems.map((x) => x.name),
        zh: catalog.menuItems.map((x) => x.name)
      },
      soulVector: aiSoul ?? null,
      menuItems: catalog.menuItems,
      drinks: catalog.drinks,
      costLogYen: 0,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  await batch.commit();
  await recordOwnerCost(storeId, "geo_bootstrap");

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: "foundation_update",
    storeId,
    reason: `geo_bootstrap:${parsed.partnerId}:${geoHint}`,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });
  res.status(200).json({
    ok: true,
    hash: log.hash,
    storeId,
    guestUrl,
    elapsedMs: Date.now() - startedAt,
    mode: "GEO_10S_BOOTSTRAP"
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
