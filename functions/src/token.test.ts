import assert from "node:assert/strict";
import test from "node:test";
import { issueGateToken, verifyGateToken, type GatePayload } from "./token";

const secret = "token-secret";

function makePayload(partial?: Partial<GatePayload>): GatePayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    aud: "guest",
    storeId: "test123",
    paymentStatus: "PAID",
    iat: now - 1,
    exp: now + 600,
    ...partial
  };
}

test("verifyGateToken accepts valid token without expected storeId", () => {
  const payload = makePayload();
  const token = issueGateToken(payload, secret);
  const verified = verifyGateToken(token, secret, undefined, Math.floor(Date.now() / 1000));
  assert.ok(verified);
  assert.equal(verified.storeId, payload.storeId);
});

test("verifyGateToken enforces expected storeId when provided", () => {
  const payload = makePayload();
  const token = issueGateToken(payload, secret);
  const verified = verifyGateToken(token, secret, "wrong-store", Math.floor(Date.now() / 1000));
  assert.equal(verified, null);
});
