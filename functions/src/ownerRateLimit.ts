import { createHash } from "node:crypto";

type HeaderRequest = {
  ip?: string;
  headers: Record<string, unknown>;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const ownerRateMap = new Map<string, { count: number; resetAt: number }>();

function readClientId(req: HeaderRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? "unknown";
}

export function getOwnerClientHash(req: HeaderRequest): string {
  return createHash("sha256").update(readClientId(req)).digest("hex");
}

export function isOwnerRateLimited(storeId: string, clientHash: string): boolean {
  const now = Date.now();
  const key = `${storeId}:${clientHash}`;
  const state = ownerRateMap.get(key);
  if (!state || now > state.resetAt) {
    ownerRateMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (state.count >= RATE_LIMIT_MAX) {
    return true;
  }
  state.count += 1;
  ownerRateMap.set(key, state);
  return false;
}
