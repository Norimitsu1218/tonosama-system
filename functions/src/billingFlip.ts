import { onRequest } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { verifyGateToken } from "./token";
import { evaluateKillSwitch } from "./killSwitch";
import { readBillingMode } from "./storeData";

type BillingMode = "STORE_PAYS" | "GUEST_PAYS";
type Mood = "HUNGRY" | "RELAX" | "ADVENTURE";

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

function isMood(value: unknown): value is Mood {
  return value === "HUNGRY" || value === "RELAX" || value === "ADVENTURE";
}

function createIdempotencyKey(storeId: string, mood: Mood, minuteWindow: number): string {
  return createHash("sha256")
    .update(`${storeId}:${mood}:${minuteWindow}`)
    .digest("hex")
    .slice(0, 32);
}

export const billingFlip = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const secret = process.env.GATE_TOKEN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "billing_not_ready" });
    return;
  }

  const bearer = parseBearerToken(req.header("authorization"));
  if (!bearer) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  const mood = req.body?.mood;
  if (!isMood(mood)) {
    res.status(400).json({ error: "invalid_mood" });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = verifyGateToken(bearer, secret, undefined, nowSec);
  if (!payload) {
    res.status(403).json({ error: "invalid_token" });
    return;
  }

  const storeId = payload.storeId;
  const killSwitch = await evaluateKillSwitch(storeId);
  if (killSwitch.blocked) {
    res.status(403).json({ error: "kill_switch_blocked" });
    return;
  }

  try {
    const mode: BillingMode = await readBillingMode(storeId);
    const amountYen = mode === "STORE_PAYS" ? 187 : 198;
    const minuteWindow = Math.floor(Date.now() / 60000);
    const idempotencyKey = createIdempotencyKey(storeId, mood, minuteWindow);

    res.set("Cache-Control", "no-store");
    res.status(200).json({
      accepted: true,
      mode,
      amountYen,
      mood,
      idempotencyKey
    });
  } catch {
    res.status(503).json({ error: "billing_unavailable" });
  }
});

