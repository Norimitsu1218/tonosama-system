import assert from "node:assert/strict";
import test from "node:test";
import { computeAvgAmount, computeCheckoutPerGateRate, expandBillingRangeDates } from "./billingStatusRead";

test("expandBillingRangeDates returns expected span", () => {
  const now = new Date(Date.UTC(2026, 1, 20, 10, 0, 0));
  assert.equal(expandBillingRangeDates("today", now).length, 1);
  assert.equal(expandBillingRangeDates("yesterday", now).length, 1);
  const seven = expandBillingRangeDates("7d", now);
  assert.equal(seven.length, 7);
  assert.equal(seven[0].toISOString().slice(0, 10), "2026-02-14");
  assert.equal(seven[6].toISOString().slice(0, 10), "2026-02-20");
  const month = expandBillingRangeDates("30d", now);
  assert.equal(month.length, 30);
  assert.equal(month[0].toISOString().slice(0, 10), "2026-01-22");
  assert.equal(month[29].toISOString().slice(0, 10), "2026-02-20");
});

test("computeAvgAmount handles zero division and valid avg", () => {
  assert.equal(computeAvgAmount({ checkout_completed_count: 0, checkout_completed_amount: 1000, gate_allowed: 0 }), 0);
  assert.equal(computeAvgAmount({ checkout_completed_count: 4, checkout_completed_amount: 792, gate_allowed: 10 }), 198);
});

test("computeCheckoutPerGateRate handles zero and valid ratio", () => {
  assert.equal(computeCheckoutPerGateRate({ checkout_completed_count: 0, checkout_completed_amount: 0, gate_allowed: 0 }), 0);
  assert.equal(
    computeCheckoutPerGateRate({ checkout_completed_count: 8, checkout_completed_amount: 1584, gate_allowed: 40 }),
    0.2
  );
});
