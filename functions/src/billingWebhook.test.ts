import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createStoreActivationPatch, formatDailyDocId, parseSignatureHeader, verifyStripeSignature } from "./billingWebhook";

test("parseSignatureHeader extracts timestamp and v1", () => {
  const parsed = parseSignatureHeader("t=1700000000,v1=abcdef,v1=123456,v0=legacy");
  assert.deepEqual(parsed, { timestamp: "1700000000", v1: ["abcdef", "123456"] });
});

test("verifyStripeSignature validates HMAC payload", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const timestamp = "1700000000";
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const ok = verifyStripeSignature({
    payload,
    signatureHeader: `t=${timestamp},v1=${v1}`,
    secret,
    nowEpochSec: 1700000000
  });
  assert.equal(ok, true);
});

test("verifyStripeSignature rejects wrong signature", () => {
  const ok = verifyStripeSignature({
    payload: "{\"id\":\"evt_1\"}",
    signatureHeader: "t=1700000000,v1=deadbeef",
    secret: "whsec_test_secret",
    nowEpochSec: 1700000000
  });
  assert.equal(ok, false);
});

test("verifyStripeSignature rejects stale timestamp", () => {
  const secret = "whsec_test_secret";
  const payload = "{\"id\":\"evt_1\"}";
  const signedPayload = `1700000000.${payload}`;
  const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const ok = verifyStripeSignature({
    payload,
    signatureHeader: `t=1700000000,v1=${v1}`,
    secret,
    nowEpochSec: 1700000900,
    toleranceSec: 300
  });
  assert.equal(ok, false);
});

test("formatDailyDocId returns YYYYMMDD by UTC", () => {
  const id = formatDailyDocId("storeA", new Date("2026-02-15T03:00:00.000Z"));
  assert.equal(id, "storeA_20260215");
});

test("createStoreActivationPatch returns paid activation payload", () => {
  const nowMs = 1700000000000;
  const patch = createStoreActivationPatch(49800, nowMs);
  assert.equal(patch.paymentStatus, "PAID");
  assert.equal(patch.activatedAtMs, nowMs);
  assert.equal(patch.onboarding.checkoutStatus, "COMPLETED");
  assert.equal(patch.onboarding.initialFeePaidYen, 49800);
  assert.equal(patch.onboarding.initialFeePaidAtMs, nowMs);
  assert.ok(patch.updatedAt);
});
