import { createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import type { StoreStatus } from "./storeStatus";

type StripeEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      metadata?: {
        storeId?: string;
        checkoutKind?: string;
        flow?: string;
      };
      amount_total?: number;
      currency?: string;
    };
  };
};

type StoreActivationPatch = {
  paymentStatus: "PAID";
  status: StoreStatus;
  isPublic: boolean;
  publishedAtMs: number;
  activatedAtMs: number;
  onboarding: {
    checkoutStatus: "COMPLETED";
    initialFeePaidYen: number;
    initialFeePaidAtMs: number;
  };
  updatedAt: FieldValue;
};

type StoreGuestCheckoutPatch = {
  onboarding: {
    guestCheckoutStatus: "COMPLETED";
    guestCheckoutAmountYen: number;
    guestCheckoutAtMs: number;
  };
  updatedAt: FieldValue;
};

const STRIPE_TOLERANCE_SEC = 300;

function parseSignatureHeader(header: string | undefined): { timestamp: string; v1: string[] } | null {
  if (!header) {
    return null;
  }
  const pairs = header.split(",").map((entry) => entry.trim());
  let timestamp = "";
  const v1: string[] = [];
  for (const pair of pairs) {
    const [k, v] = pair.split("=");
    if (k === "t" && v) {
      timestamp = v;
    } else if (k === "v1" && v) {
      v1.push(v);
    }
  }
  if (!timestamp || v1.length === 0) {
    return null;
  }
  return { timestamp, v1 };
}

function verifyStripeSignature(args: {
  payload: string;
  signatureHeader: string | undefined;
  secret: string;
  nowEpochSec?: number;
  toleranceSec?: number;
}): boolean {
  const parsed = parseSignatureHeader(args.signatureHeader);
  if (!parsed) {
    return false;
  }
  const nowEpochSec = typeof args.nowEpochSec === "number" ? args.nowEpochSec : Math.floor(Date.now() / 1000);
  const toleranceSec = typeof args.toleranceSec === "number" ? args.toleranceSec : STRIPE_TOLERANCE_SEC;
  const timestamp = Number(parsed.timestamp);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  if (Math.abs(nowEpochSec - timestamp) > toleranceSec) {
    return false;
  }
  const signedPayload = `${parsed.timestamp}.${args.payload}`;
  const expected = createHmac("sha256", args.secret).update(signedPayload).digest("hex");
  const lhs = Buffer.from(expected, "hex");
  for (const candidate of parsed.v1) {
    const rhs = Buffer.from(candidate, "hex");
    if (lhs.length === rhs.length && timingSafeEqual(lhs, rhs)) {
      return true;
    }
  }
  return false;
}

function formatDailyDocId(storeId: string, now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${storeId}_${yyyy}${mm}${dd}`;
}

async function persistCheckoutAggregate(event: StripeEvent): Promise<void> {
  const eventId = typeof event.id === "string" ? event.id : null;
  if (!eventId) {
    return;
  }
  const storeId = event.data?.object?.metadata?.storeId;
  if (!storeId || typeof storeId !== "string") {
    return;
  }

  const db = getFirestore();
  const eventRef = db.collection("billing_events").doc(eventId);
  const eventSnap = await eventRef.get();
  if (eventSnap.exists) {
    return;
  }

  const amountTotal = typeof event.data?.object?.amount_total === "number" ? event.data.object.amount_total : 0;
  const currency = typeof event.data?.object?.currency === "string" ? event.data.object.currency : "jpy";
  const checkoutSessionId = typeof event.data?.object?.id === "string" ? event.data.object.id : "";
  const metadata = event.data?.object?.metadata ?? {};
  const checkoutKind = typeof metadata.checkoutKind === "string" ? metadata.checkoutKind : "";
  const flow = typeof metadata.flow === "string" ? metadata.flow : "";
  const activateStoreIntent = checkoutKind === "partner_closer" || flow === "partner_closer";
  const aggregateRef = db.collection("billing_daily").doc(formatDailyDocId(storeId));
  const auditRef = db.collection("billing_audit").doc(eventId);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      return;
    }
    const storeRef = db.doc(`stores/${storeId}`);
    const storeSnap = await tx.get(storeRef);
    const store = storeSnap.data() ?? {};
    const storeStatus = typeof store.status === "string" ? store.status : "";
    const expectedCheckoutSessionId =
      typeof store.onboarding?.checkoutSessionId === "string" ? store.onboarding.checkoutSessionId : "";
    const canActivateStore =
      activateStoreIntent &&
      checkoutSessionId.length > 0 &&
      expectedCheckoutSessionId.length > 0 &&
      checkoutSessionId === expectedCheckoutSessionId &&
      storeStatus === "REVIEWING";

    tx.create(eventRef, {
      eventId,
      storeId,
      eventType: event.type ?? "unknown",
      receivedAt: Date.now()
    });
    tx.set(
      aggregateRef,
      {
        storeId,
        updatedAt: Date.now(),
        currency,
        checkout_completed_count: FieldValue.increment(1),
        checkout_completed_amount: FieldValue.increment(amountTotal)
      },
      { merge: true }
    );
    tx.set(
      auditRef,
      {
        eventId,
        storeId,
        checkoutKind,
        flow,
        checkoutSessionId,
        expectedCheckoutSessionId,
        storeStatus,
        canActivateStore,
        receivedAt: Date.now()
      },
      { merge: true }
    );
    tx.set(
      storeRef,
      canActivateStore ? createStoreActivationPatch(amountTotal) : createGuestCheckoutPatch(amountTotal),
      { merge: true }
    );
  });
}

export function createStoreActivationPatch(amountYen: number, nowMs = Date.now()): StoreActivationPatch {
  return {
    paymentStatus: "PAID",
    status: "LIVE",
    isPublic: true,
    publishedAtMs: nowMs,
    activatedAtMs: nowMs,
    onboarding: {
      checkoutStatus: "COMPLETED",
      initialFeePaidYen: amountYen,
      initialFeePaidAtMs: nowMs
    },
    updatedAt: FieldValue.serverTimestamp()
  };
}

function createGuestCheckoutPatch(amountYen: number, nowMs = Date.now()): StoreGuestCheckoutPatch {
  return {
    onboarding: {
      guestCheckoutStatus: "COMPLETED",
      guestCheckoutAmountYen: amountYen,
      guestCheckoutAtMs: nowMs
    },
    updatedAt: FieldValue.serverTimestamp()
  };
}

export const billingWebhook = onRequest({ cors: false, secrets: ["STRIPE_WEBHOOK_SECRET"] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("method_not_allowed");
    return;
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).send("webhook_not_ready");
    return;
  }

  const payloadText = typeof req.rawBody === "string" ? req.rawBody : Buffer.from(req.rawBody ?? "").toString("utf8");
  if (!verifyStripeSignature({ payload: payloadText, signatureHeader: req.header("stripe-signature"), secret })) {
    res.status(400).send("invalid_signature");
    return;
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payloadText) as StripeEvent;
  } catch {
    res.status(400).send("invalid_json");
    return;
  }

  if (event.type === "checkout.session.completed") {
    try {
      await persistCheckoutAggregate(event);
    } catch {
      res.status(500).send("persist_failed");
      return;
    }
  }

  res.status(200).send("ok");
});

export { formatDailyDocId, parseSignatureHeader, verifyStripeSignature };
