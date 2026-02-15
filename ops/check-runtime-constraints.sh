#!/usr/bin/env sh
set -eu

node <<'NODE'
const fs = require("node:fs");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync("ops/runtime-constraints.json", "utf8");
} catch {
  fail("ops/runtime-constraints.json is missing.", "Add ops/runtime-constraints.json with required hard constraints.");
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  fail("ops/runtime-constraints.json is not valid JSON.", "Fix JSON syntax in ops/runtime-constraints.json.");
}

if (parsed.schemaVersion !== 1) {
  fail("runtime constraints schemaVersion must be 1.", "Set schemaVersion to 1 in ops/runtime-constraints.json.");
}

const constraints = parsed.constraints ?? {};
const required = [
  "gate_allowlist_paid_trial_only",
  "explicit_clickwrap_required",
  "functions_only_guest_data_path",
  "aggregate_analytics_only",
  "sensitive_inference_prohibited",
  "fail_closed_default"
];

for (const key of required) {
  if (constraints[key] !== true) {
    fail(
      `runtime constraint '${key}' must be true.`,
      `Set constraints.${key}=true in ops/runtime-constraints.json.`
    );
  }
}

process.stdout.write("CI preflight: runtime hard constraints confirmed.\n");
NODE
