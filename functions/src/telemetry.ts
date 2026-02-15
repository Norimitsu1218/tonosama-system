import { createHash, createHmac } from "node:crypto";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { verifyGateToken } from "./token";

type TelemetryEvent =
  | "gate_allowed"
  | "consent"
  | "mood"
  | "tray_add"
  | "slip"
  | "sumimasen"
  | "okami_ask"
  | "okami_api"
  | "okami_blocked"
  | "okami_fallback"
  | "okami_rate_limited";
type TelemetryMood = "Hungry" | "Relax" | "Adventure";

type TelemetryBody = {
  event: TelemetryEvent;
  mood?: TelemetryMood;
  ts: number;
  schema: number;
};

type RateState = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateState = new Map<string, RateState>();

const ALLOWED_BODY_KEYS = new Set(["event", "mood", "ts", "schema"]);
const ALLOWED_EVENTS = new Set<TelemetryEvent>([
  "gate_allowed",
  "consent",
  "mood",
  "tray_add",
  "slip",
  "sumimasen",
  "okami_ask",
  "okami_api",
  "okami_blocked",
  "okami_fallback",
  "okami_rate_limited"
]);
const ALLOWED_MOODS = new Set<TelemetryMood>(["Hungry", "Relax", "Adventure"]);

function parseBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

function parseStoreIdFromToken(token: string): string | null {
  const [encoded] = token.split(".");
  if (!encoded) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      storeId?: unknown;
    };
    if (typeof decoded.storeId !== "string" || !/^[a-zA-Z0-9_-]{3,64}$/.test(decoded.storeId)) {
      return null;
    }
    return decoded.storeId;
  } catch {
    return null;
  }
}

function formatDay(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function pickBucketTs(clientTs: number): number {
  const now = Date.now();
  const delta = Math.abs(now - clientTs);
  if (!Number.isFinite(clientTs) || delta > 86_400_000) {
    return now;
  }
  return clientTs;
}

function deriveDailySalt(secret: string, yyyymmdd: string): string {
  return createHmac("sha256", secret).update(yyyymmdd).digest("hex");
}

function buildClientHash(storeId: string, dailySalt: string): string {
  return createHash("sha256")
    .update(`${storeId}|${dailySalt}|telemetry-rate-v1`)
    .digest("hex");
}

function isRateLimited(storeId: string, clientHash: string): boolean {
  const now = Date.now();
  const key = `${storeId}:${clientHash}`;
  const state = rateState.get(key);
  if (!state || now > state.resetAt) {
    rateState.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (state.count >= RATE_LIMIT_MAX) {
    return true;
  }
  state.count += 1;
  rateState.set(key, state);
  return false;
}

export function mapCounterKey(event: TelemetryEvent, mood?: TelemetryMood): string {
  if (event === "mood") {
    if (mood === "Hungry") return "mood_hungry";
    if (mood === "Relax") return "mood_relax";
    return "mood_adventure";
  }
  return event;
}

export function formatTelemetryDocId(storeId: string, tsMs: number): string {
  return `${storeId}_${formatDay(tsMs)}`;
}

export function parseTelemetryBody(raw: unknown): TelemetryBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) {
      return null;
    }
  }
  if (!ALLOWED_EVENTS.has(body.event as TelemetryEvent)) {
    return null;
  }
  if (typeof body.ts !== "number" || !Number.isFinite(body.ts)) {
    return null;
  }
  if (body.schema !== 1) {
    return null;
  }
  if (body.event === "mood") {
    if (!ALLOWED_MOODS.has(body.mood as TelemetryMood)) {
      return null;
    }
  } else if (typeof body.mood !== "undefined") {
    return null;
  }

  return {
    event: body.event as TelemetryEvent,
    mood: body.mood as TelemetryMood | undefined,
    ts: body.ts,
    schema: 1
  };
}

export const telemetry = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const secret = process.env.GATE_TOKEN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "telemetry_not_ready" });
    return;
  }

  const bearer = parseBearerToken(req.header("authorization"));
  if (!bearer) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  const tokenStoreId = parseStoreIdFromToken(bearer);
  if (!tokenStoreId) {
    res.status(403).json({ error: "invalid_token" });
    return;
  }

  const verified = verifyGateToken(bearer, secret, tokenStoreId, Math.floor(Date.now() / 1000));
  if (!verified) {
    res.status(403).json({ error: "invalid_token" });
    return;
  }

  const payload = parseTelemetryBody(req.body);
  if (!payload) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }

  const telemetrySecret = process.env.TELEMETRY_SALT_SECRET;
  if (!telemetrySecret) {
    res.status(204).send();
    return;
  }

  const bucketTs = pickBucketTs(payload.ts);
  const day = formatDay(bucketTs);
  const dailySalt = deriveDailySalt(telemetrySecret, day);
  const clientHash = buildClientHash(verified.storeId, dailySalt);

  if (isRateLimited(verified.storeId, clientHash)) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const docId = formatTelemetryDocId(verified.storeId, bucketTs);
  const counterKey = mapCounterKey(payload.event, payload.mood);

  try {
    await getFirestore()
      .collection("telemetry_daily")
      .doc(docId)
      .set(
        {
          [counterKey]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    res.status(204).send();
  } catch {
    res.status(204).send();
  }
});
