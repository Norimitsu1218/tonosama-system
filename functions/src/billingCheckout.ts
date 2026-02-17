import { onRequest } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import { evaluateKillSwitch } from "./killSwitch";
import { readBillingMode } from "./storeData";
import { verifyGateToken } from "./token";

type Mood = "HUNGRY" | "RELAX" | "ADVENTURE";
type BillingMode = "STORE_PAYS" | "GUEST_PAYS";

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
    .update(`${storeId}:${mood}:${minuteWindow}:guest_checkout`)
    .digest("hex")
    .slice(0, 32);
}

function toFormBody(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    search.append(k, v);
  }
  return search.toString();
}

export function withCheckoutResultParams(baseUrl: string, result: "success" | "cancel"): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("checkout", result);
    if (result === "success" && !url.searchParams.get("session_id")) {
      url.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    }
    return url.toString();
  } catch {
    return baseUrl;
  }
}

async function createStripeCheckoutSession(args: {
  secretKey: string;
  successUrl: string;
  cancelUrl: string;
  storeId: string;
  mood: Mood;
  idempotencyKey: string;
  amountYen: number;
}): Promise<{ id: string; url: string } | null> {
  const payload = toFormBody({
    mode: "payment",
    success_url: withCheckoutResultParams(args.successUrl, "success"),
    cancel_url: withCheckoutResultParams(args.cancelUrl, "cancel"),
    "line_items[0][price_data][currency]": "jpy",
    "line_items[0][price_data][unit_amount]": String(args.amountYen),
    "line_items[0][price_data][product_data][name]": "TONOSAMA Guest Unlock",
    "line_items[0][quantity]": "1",
    "metadata[storeId]": args.storeId,
    "metadata[mood]": args.mood,
    "metadata[idempotencyKey]": args.idempotencyKey,
    "metadata[checkoutKind]": "guest_unlock"
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": args.idempotencyKey
    },
    body: payload
  });
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as { id?: string; url?: string };
  if (typeof json.id !== "string" || typeof json.url !== "string") {
    return null;
  }
  return { id: json.id, url: json.url };
}

export const billingCheckout = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const gateSecret = process.env.GATE_TOKEN_SECRET;
  if (!gateSecret) {
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
  const payload = verifyGateToken(bearer, gateSecret, undefined, nowSec);
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

  let mode: BillingMode;
  try {
    mode = await readBillingMode(storeId);
  } catch {
    res.status(503).json({ error: "billing_unavailable" });
    return;
  }

  const amountYen = mode === "STORE_PAYS" ? 187 : 198;
  const minuteWindow = Math.floor(Date.now() / 60000);
  const idempotencyKey = createIdempotencyKey(storeId, mood, minuteWindow);

  if (mode === "STORE_PAYS") {
    res.status(200).json({
      accepted: true,
      mode,
      amountYen,
      checkoutRequired: false,
      idempotencyKey
    });
    return;
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const successUrl = process.env.BILLING_SUCCESS_URL;
  const cancelUrl = process.env.BILLING_CANCEL_URL;
  if (!stripeSecret || !successUrl || !cancelUrl) {
    res.status(503).json({ error: "stripe_not_ready" });
    return;
  }

  try {
    const session = await createStripeCheckoutSession({
      secretKey: stripeSecret,
      successUrl,
      cancelUrl,
      storeId,
      mood,
      idempotencyKey,
      amountYen
    });
    if (!session) {
      res.status(503).json({ error: "stripe_checkout_failed" });
      return;
    }
    res.status(200).json({
      accepted: true,
      mode,
      amountYen,
      checkoutRequired: true,
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      idempotencyKey
    });
  } catch {
    res.status(503).json({ error: "stripe_checkout_failed" });
  }
});
