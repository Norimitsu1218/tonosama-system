import assert from "node:assert/strict";
import test from "node:test";
import { resolveGemPrompt } from "./okamiGems";
import { parseExecutionMode, selectGeminiModel } from "./okamiRuntimePolicy";

test("parseExecutionMode defaults to speed", () => {
  assert.equal(parseExecutionMode(undefined), "speed");
  assert.equal(parseExecutionMode("invalid"), "speed");
});

test("parseExecutionMode accepts explicit modes", () => {
  assert.equal(parseExecutionMode("speed"), "speed");
  assert.equal(parseExecutionMode("robustness"), "robustness");
  assert.equal(parseExecutionMode("scalability"), "scalability");
});

test("selectGeminiModel promotes security to pro", () => {
  assert.equal(selectGeminiModel("SECURITY", "speed"), "gemini-2.5-pro");
});

test("selectGeminiModel uses flash for scalable rule calls", () => {
  assert.equal(selectGeminiModel("RULE", "scalability"), "gemini-2.5-flash");
});

test("resolveGemPrompt returns class guidance", () => {
  assert.match(resolveGemPrompt("SOUL"), /chef philosophy/i);
  assert.match(resolveGemPrompt("RULE"), /store rules/i);
});

