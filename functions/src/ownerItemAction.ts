import { onRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { appendApprovalLogEntry } from "./auditHash";
import { verifyOwnerRequest } from "./ownerAuth";
import { getOwnerClientHash, isOwnerRateLimited } from "./ownerRateLimit";

type ItemAction = "approve" | "reject" | "soldout_toggle";

type ItemActionBody = {
  action: ItemAction;
  storeId: string;
  itemId: string;
  reason?: string;
  intent: string;
  allowed_use: string;
};

const ALLOWED_KEYS = new Set(["action", "storeId", "itemId", "reason", "intent", "allowed_use"]);

if (getApps().length === 0) {
  initializeApp();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(value);
}

function parseBody(input: unknown): ItemActionBody | null {
  if (!isObject(input)) {
    return null;
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      return null;
    }
  }
  if (
    (input.action !== "approve" && input.action !== "reject" && input.action !== "soldout_toggle") ||
    typeof input.storeId !== "string" ||
    !isValidId(input.storeId) ||
    typeof input.itemId !== "string" ||
    !isValidId(input.itemId) ||
    typeof input.intent !== "string" ||
    input.intent.trim().length === 0 ||
    typeof input.allowed_use !== "string" ||
    input.allowed_use.trim().length === 0
  ) {
    return null;
  }
  const out: ItemActionBody = {
    action: input.action,
    storeId: input.storeId,
    itemId: input.itemId,
    intent: input.intent.trim(),
    allowed_use: input.allowed_use.trim()
  };
  if (typeof input.reason === "string" && input.reason.trim().length > 0) {
    out.reason = input.reason.trim();
  }
  return out;
}

export const ownerItemAction = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const parsed = parseBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const auth = await verifyOwnerRequest(req, parsed.storeId);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.status === 409 ? "conflict" : "forbidden" });
    return;
  }

  const clientHash = getOwnerClientHash(req);
  if (isOwnerRateLimited(parsed.storeId, clientHash)) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const itemRef = getFirestore().doc(`stores/${parsed.storeId}/items/${parsed.itemId}`);
  const itemSnapshot = await itemRef.get();
  if (!itemSnapshot.exists) {
    res.status(404).json({ error: "item_not_found" });
    return;
  }

  if (parsed.action === "approve") {
    await itemRef.set(
      {
        approvalState: "approved",
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } else if (parsed.action === "reject") {
    await itemRef.set(
      {
        approvalState: "rejected",
        rejectReason: parsed.reason ?? null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  } else {
    const currentSoldOut = itemSnapshot.get("soldOut");
    await itemRef.set(
      {
        soldOut: currentSoldOut === true ? false : true,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: parsed.action,
    storeId: parsed.storeId,
    itemId: parsed.itemId,
    reason: parsed.reason,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });

  res.status(200).json({ ok: true, id: log.id, hash: log.hash });
});
