import assert from "node:assert/strict";
import test from "node:test";
import { withCheckoutResultParams } from "./billingCheckout";

test("withCheckoutResultParams appends success params", () => {
  const out = withCheckoutResultParams("https://example.com/s/test123", "success");
  const url = new URL(out);
  assert.equal(url.searchParams.get("checkout"), "success");
  assert.equal(url.searchParams.get("session_id"), "{CHECKOUT_SESSION_ID}");
});

test("withCheckoutResultParams appends cancel param only", () => {
  const out = withCheckoutResultParams("https://example.com/s/test123?lang=ja", "cancel");
  const url = new URL(out);
  assert.equal(url.searchParams.get("checkout"), "cancel");
  assert.equal(url.searchParams.get("lang"), "ja");
  assert.equal(url.searchParams.get("session_id"), null);
});

test("withCheckoutResultParams keeps invalid URL untouched", () => {
  const input = "/s/test123";
  assert.equal(withCheckoutResultParams(input, "success"), input);
});
