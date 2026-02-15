import assert from "node:assert/strict";
import test from "node:test";
import { computeRates, expandRangeDates } from "./telemetryRead";

test("expandRangeDates returns correct length for each range", () => {
  const now = new Date(Date.UTC(2026, 1, 14, 10, 0, 0));
  assert.equal(expandRangeDates("today", now).length, 1);
  assert.equal(expandRangeDates("yesterday", now).length, 1);
  const seven = expandRangeDates("7d", now);
  assert.equal(seven.length, 7);
  assert.equal(seven[0].toISOString().slice(0, 10), "2026-02-08");
  assert.equal(seven[6].toISOString().slice(0, 10), "2026-02-14");
  const month = expandRangeDates("30d", now);
  assert.equal(month.length, 30);
  assert.equal(month[0].toISOString().slice(0, 10), "2026-01-16");
  assert.equal(month[29].toISOString().slice(0, 10), "2026-02-14");
});

test("computeRates derives funnel values", () => {
  const rates = computeRates({
    gate_allowed: 100,
    consent: 50,
    okami_ask: 12,
    okami_api: 10,
    okami_blocked: 2,
    okami_fallback: 3,
    okami_rate_limited: 1,
    tray_add: 20,
    slip: 10,
    sumimasen: 5,
    mood_hungry: 4,
    mood_relax: 3,
    mood_adventure: 3
  });
  assert.equal(rates.consent_rate, 0.5);
  assert.equal(rates.order_intent_rate, 0.2);
  assert.equal(rates.call_staff_rate, 0.5);
});
