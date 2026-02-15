import { createHash } from "node:crypto";

export type ApprovalAction =
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

export type ApprovalChainPayload = {
  actor: "owner";
  action: ApprovalAction;
  storeId: string;
  itemId: string | null;
  reason: string | null;
  sourceHash: string | null;
  intent: string;
  allowed_use: string;
  createdAtMs: number;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(row[key])}`);
  return `{${pairs.join(",")}}`;
}

export function computeApprovalHash(prevHash: string, payload: ApprovalChainPayload): string {
  const message = `${prevHash}${canonicalize(payload)}`;
  return createHash("sha256").update(message).digest("hex");
}
