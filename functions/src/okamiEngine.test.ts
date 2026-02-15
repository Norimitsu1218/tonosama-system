import test from "node:test";
import assert from "node:assert/strict";
import {
  applyContextDeterministic,
  buildResponseDeterministic,
  classifyPromptDeterministic
} from "./okamiEngine";

test("classifyPromptDeterministic classifies security prompts", () => {
  assert.equal(classifyPromptDeterministic("allergy check please"), "SECURITY");
});

test("buildResponseDeterministic marks security as blocked", () => {
  const out = buildResponseDeterministic("SECURITY");
  assert.equal(out.blocked, true);
});

test("applyContextDeterministic appends rule context", () => {
  const out = applyContextDeterministic(buildResponseDeterministic("RULE"), {
    storeName: "Store",
    address: "Addr",
    mapUrl: null,
    businessRules: { supportsCashless: true, hasWifi: false, hasOtoshi: true }
  });
  assert.match(out.text, /cashless:yes/);
  assert.match(out.text, /wifi:no/);
  assert.match(out.text, /otoshi:yes/);
});
