import { onRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { appendApprovalLogEntry } from "./auditHash";
import { verifyOwnerRequest } from "./ownerAuth";
import { getOwnerClientHash, isOwnerRateLimited } from "./ownerRateLimit";

type ApprovalAction =
  | "approve"
  | "reject"
  | "soldout_toggle"
  | "manifest_publish"
  | "foundation_update"
  | "menu_import"
  | "soul_capture"
  | "crystallize"
  | "sales_diagnosis"
  | "business_model_select"
  | "contract_accept"
  | "activate_account"
  | "shop_card_import"
  | "trends_publish"
  | "initial_fee_checkout";

type ApprovalLogBody = {
  action: ApprovalAction;
  storeId: string;
  itemId?: string;
  reason?: string;
  hash?: string;
  intent: string;
  allowed_use: string;
};

const ALLOWED_KEYS = new Set(["action", "storeId", "itemId", "reason", "hash", "intent", "allowed_use"]);

if (getApps().length === 0) {
  initializeApp();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidStoreId(storeId: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(storeId);
}

function parseBody(input: unknown): ApprovalLogBody | null {
  if (!isObject(input)) {
    return null;
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      return null;
    }
  }
  if (
    (input.action !== "approve" &&
      input.action !== "reject" &&
      input.action !== "soldout_toggle" &&
      input.action !== "manifest_publish" &&
      input.action !== "foundation_update" &&
      input.action !== "menu_import" &&
      input.action !== "soul_capture" &&
      input.action !== "crystallize" &&
      input.action !== "sales_diagnosis" &&
      input.action !== "business_model_select" &&
      input.action !== "contract_accept" &&
      input.action !== "activate_account" &&
      input.action !== "shop_card_import" &&
      input.action !== "trends_publish" &&
      input.action !== "initial_fee_checkout") ||
    typeof input.storeId !== "string" ||
    !isValidStoreId(input.storeId) ||
    typeof input.intent !== "string" ||
    input.intent.trim().length === 0 ||
    typeof input.allowed_use !== "string" ||
    input.allowed_use.trim().length === 0
  ) {
    return null;
  }
  const out: ApprovalLogBody = {
    action: input.action,
    storeId: input.storeId,
    intent: input.intent.trim(),
    allowed_use: input.allowed_use.trim()
  };
  if (typeof input.itemId === "string" && input.itemId.trim().length > 0) {
    out.itemId = input.itemId.trim();
  }
  if (typeof input.reason === "string" && input.reason.trim().length > 0) {
    out.reason = input.reason.trim();
  }
  if (typeof input.hash === "string" && input.hash.trim().length > 0) {
    out.hash = input.hash.trim();
  }
  return out;
}

export const approvalLog = onRequest({ cors: true }, async (req, res) => {
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

  const log = await appendApprovalLogEntry({
    actor: "owner",
    action: parsed.action,
    storeId: parsed.storeId,
    itemId: parsed.itemId,
    reason: parsed.reason,
    sourceHash: parsed.hash,
    intent: parsed.intent,
    allowed_use: parsed.allowed_use
  });

  res.status(200).json({ ok: true, id: log.id, hash: log.hash });
});
