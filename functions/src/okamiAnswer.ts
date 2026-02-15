import { createHash } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { evaluateKillSwitch } from "./killSwitch";
import {
  applyContextDeterministic,
  buildResponseDeterministic,
  classifyPromptDeterministic,
  type OkamiKind,
  type OkamiResponse
} from "./okamiEngine";
import { readStoreBundle } from "./storeData";
import { verifyGateToken } from "./token";

type RateState = {
  count: number;
  resetAt: number;
};

type CacheState = {
  response: OkamiResponse;
  expiresAt: number;
};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateState = new Map<string, RateState>();
const CACHE_TTL_MS = 5 * 60_000;
const answerCache = new Map<string, CacheState>();

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

export function classifyOkamiPrompt(input: string): OkamiKind {
  return classifyPromptDeterministic(input);
}

export function isPromptInjectionLike(input: string): boolean {
  const q = input.toLowerCase();
  return /(ignore (all|any|previous) instructions|system prompt|developer message|tool call|jailbreak|bypass policy)/.test(q);
}

export function buildOkamiResponse(kind: OkamiKind): OkamiResponse {
  return buildResponseDeterministic(kind);
}

function readForwardedIp(req: { headers: Record<string, unknown>; ip?: string }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? "";
}

function ipPrefix(ip: string): string {
  if (!ip) {
    return "";
  }
  if (ip.includes(".")) {
    return ip.split(".").slice(0, 3).join(".");
  }
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":");
  }
  return "";
}

function getClientHash(req: { headers: Record<string, unknown>; ip?: string }): string {
  const ip = ipPrefix(readForwardedIp(req));
  const ua = (typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "").slice(0, 64);
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex");
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

function getCacheKey(storeId: string, prompt: string): string {
  return `${storeId}:${prompt.toLowerCase().trim()}`;
}

function getCachedAnswer(storeId: string, prompt: string): OkamiResponse | null {
  const key = getCacheKey(storeId, prompt);
  const hit = answerCache.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() > hit.expiresAt) {
    answerCache.delete(key);
    return null;
  }
  return hit.response;
}

function setCachedAnswer(storeId: string, prompt: string, response: OkamiResponse): void {
  const key = getCacheKey(storeId, prompt);
  answerCache.set(key, { response, expiresAt: Date.now() + CACHE_TTL_MS });
}

function applyStoreContext(base: OkamiResponse, store: {
  name: string | null;
  address: string | null;
  mapUrl: string | null;
  businessRules: {
    supportsCashless: boolean;
    hasWifi: boolean;
    hasOtoshi: boolean;
  } | null;
}): OkamiResponse {
  return applyContextDeterministic(base, {
    storeName: store.name,
    address: store.address,
    mapUrl: store.mapUrl,
    businessRules: store.businessRules
  });
}

export const okamiAnswer = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const gateSecret = process.env.GATE_TOKEN_SECRET;
  if (!gateSecret) {
    res.status(503).json({ error: "okami_not_ready" });
    return;
  }
  const bearer = parseBearerToken(req.header("authorization"));
  if (!bearer) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = verifyGateToken(bearer, gateSecret, undefined, nowSec);
  if (!payload) {
    res.status(403).json({ error: "invalid_token" });
    return;
  }
  const killSwitch = await evaluateKillSwitch(payload.storeId);
  if (killSwitch.blocked) {
    res.status(403).json({ error: "kill_switch_blocked" });
    return;
  }
  const clientHash = getClientHash(req);
  if (isRateLimited(payload.storeId, clientHash)) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const prompt = req.body?.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.trim().length > 400) {
    res.status(400).json({ error: "invalid_prompt" });
    return;
  }

  const normalizedPrompt = prompt.trim();
  if (isPromptInjectionLike(normalizedPrompt)) {
    res.status(200).json({
      kind: "SECURITY",
      text: "Unsafe instruction pattern detected. Please ask menu, rule, place, or story questions only.",
      blocked: true
    });
    return;
  }

  const cached = getCachedAnswer(payload.storeId, normalizedPrompt);
  if (cached) {
    res.status(200).json(cached);
    return;
  }

  const kind = classifyOkamiPrompt(normalizedPrompt);
  let out = buildOkamiResponse(kind);
  try {
    const bundle = await readStoreBundle(payload.storeId);
    out = applyStoreContext(out, bundle.store);
  } catch {
    // keep base answer when store context is unavailable
  }
  setCachedAnswer(payload.storeId, normalizedPrompt, out);
  res.status(200).json(out);
});
