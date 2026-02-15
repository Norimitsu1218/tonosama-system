import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { issueGateToken, type GatePayload } from "./token";
import { readPaymentStatus } from "./storeData";
import { evaluateKillSwitch } from "./killSwitch";

const TOKEN_TTL_SECONDS = 10 * 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isValidStoreId(storeId: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(storeId);
}

function isAllowed(status: "PAID" | "TRIAL" | "NG"): boolean {
  return status === "PAID" || status === "TRIAL";
}

function getClientAddress(req: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? "unknown";
}

function isRateLimited(clientId: string): boolean {
  const now = Date.now();
  const state = rateLimitMap.get(clientId);
  if (!state || now > state.resetAt) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (state.count >= RATE_LIMIT_MAX) {
    return true;
  }
  state.count += 1;
  rateLimitMap.set(clientId, state);
  return false;
}

export const gate = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const storeId = req.query.storeId;
  if (typeof storeId !== "string" || !isValidStoreId(storeId)) {
    res.status(400).json({ error: "invalid_store_id" });
    return;
  }

  const killSwitch = await evaluateKillSwitch(storeId);
  if (killSwitch.blocked) {
    logger.warn("gate_kill_switch_blocked", { storeId, reason: killSwitch.reason });
    res.status(403).json({ error: "kill_switch_blocked" });
    return;
  }

  const clientId = getClientAddress(req);
  if (isRateLimited(clientId)) {
    logger.warn("gate_rate_limited", { storeId });
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const secret = process.env.GATE_TOKEN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "gate_not_ready" });
    return;
  }

  try {
    const paymentStatus = await readPaymentStatus(storeId);
    if (!isAllowed(paymentStatus)) {
      logger.info("gate_blocked", { storeId });
      res.status(403).json({ error: "payment_blocked" });
      return;
    }

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + TOKEN_TTL_SECONDS;
    const payload: GatePayload = {
      aud: "guest",
      storeId,
      paymentStatus,
      iat,
      exp
    };
    const token = issueGateToken(payload, secret);

    logger.info("gate_allowed", { storeId });

    res.status(200).json({
      allowed: true,
      token,
      exp,
      paymentStatus
    });
  } catch {
    res.status(503).json({ error: "gate_unavailable" });
  }
});
