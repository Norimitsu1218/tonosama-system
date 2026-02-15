import assert from "node:assert/strict";
import test from "node:test";
import { computeApprovalHash } from "./auditHashCore";

test("approval hash chain continues with previous hash", () => {
  const payload1 = {
    actor: "owner" as const,
    action: "approve" as const,
    storeId: "store123",
    itemId: "item-a",
    reason: null,
    sourceHash: null,
    intent: "owner_item_review",
    allowed_use: "owner_runtime",
    createdAtMs: 1000
  };
  const hash1 = computeApprovalHash("GENESIS", payload1);

  const payload2 = {
    ...payload1,
    action: "soldout_toggle" as const,
    createdAtMs: 2000
  };
  const hash2 = computeApprovalHash(hash1, payload2);

  assert.notEqual(hash1, hash2);
  assert.equal(hash2, computeApprovalHash(hash1, payload2));
});
