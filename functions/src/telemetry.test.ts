import assert from "node:assert/strict";
import test from "node:test";
import { formatTelemetryDocId, mapCounterKey, parseTelemetryBody } from "./telemetry";

test("parseTelemetryBody validates allowlist and schema", () => {
  const ok = parseTelemetryBody({
    event: "mood",
    mood: "Hungry",
    ts: Date.now(),
    schema: 1
  });
  assert.ok(ok);

  const withExtra = parseTelemetryBody({
    event: "consent",
    ts: Date.now(),
    schema: 1,
    extra: "blocked"
  });
  assert.equal(withExtra, null);

  const badMood = parseTelemetryBody({
    event: "mood",
    mood: "BAD",
    ts: Date.now(),
    schema: 1
  });
  assert.equal(badMood, null);

  const okamiAsk = parseTelemetryBody({
    event: "okami_ask",
    ts: Date.now(),
    schema: 1
  });
  assert.ok(okamiAsk);

  const okamiBlocked = parseTelemetryBody({
    event: "okami_blocked",
    ts: Date.now(),
    schema: 1
  });
  assert.ok(okamiBlocked);

  const okamiFallback = parseTelemetryBody({
    event: "okami_fallback",
    ts: Date.now(),
    schema: 1
  });
  assert.ok(okamiFallback);

  const okamiApi = parseTelemetryBody({
    event: "okami_api",
    ts: Date.now(),
    schema: 1
  });
  assert.ok(okamiApi);

  const okamiRateLimited = parseTelemetryBody({
    event: "okami_rate_limited",
    ts: Date.now(),
    schema: 1
  });
  assert.ok(okamiRateLimited);
});

test("mapCounterKey maps mood and non-mood events", () => {
  assert.equal(mapCounterKey("gate_allowed"), "gate_allowed");
  assert.equal(mapCounterKey("okami_ask"), "okami_ask");
  assert.equal(mapCounterKey("okami_api"), "okami_api");
  assert.equal(mapCounterKey("okami_blocked"), "okami_blocked");
  assert.equal(mapCounterKey("okami_fallback"), "okami_fallback");
  assert.equal(mapCounterKey("okami_rate_limited"), "okami_rate_limited");
  assert.equal(mapCounterKey("mood", "Hungry"), "mood_hungry");
  assert.equal(mapCounterKey("mood", "Relax"), "mood_relax");
  assert.equal(mapCounterKey("mood", "Adventure"), "mood_adventure");
});

test("formatTelemetryDocId creates daily doc id", () => {
  const ts = Date.UTC(2026, 1, 14, 8, 30, 0);
  assert.equal(formatTelemetryDocId("test123", ts), "test123_20260214");
});
