#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $1" >&2
  echo "Next step: $2" >&2
  exit 1
}

WORKFLOW_FILE=".github/workflows/firebase-deploy.yml"

if [ ! -f "${WORKFLOW_FILE}" ]; then
  fail "workflow file is missing." "Restore ${WORKFLOW_FILE}."
fi

echo "[owner-setup] checking OIDC workflow guards"
if ! rg -n "id-token:\\s*write" "${WORKFLOW_FILE}" >/dev/null 2>&1; then
  fail "workflow is missing id-token: write permission." "Add id-token: write to ${WORKFLOW_FILE}."
fi
if rg -n "FIREBASE_TOKEN" "${WORKFLOW_FILE}" >/dev/null 2>&1; then
  fail "legacy FIREBASE_TOKEN reference found in workflow." "Remove FIREBASE_TOKEN references from ${WORKFLOW_FILE}."
fi

echo "[owner-setup] checking .firebaserc placeholders"
if rg -n "REPLACE_WITH_" .firebaserc >/dev/null 2>&1; then
  fail ".firebaserc still contains placeholder values." "Edit .firebaserc and replace REPLACE_WITH_* values."
fi

echo "[owner-setup] checking hosting target mapping"
node <<'NODE'
const fs = require("node:fs");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(".firebaserc", "utf8");
} catch {
  fail(".firebaserc is missing.", "Restore .firebaserc and rerun.");
}

let conf;
try {
  conf = JSON.parse(raw);
} catch {
  fail(".firebaserc is invalid JSON.", "Fix .firebaserc JSON syntax.");
}

const project = conf?.projects?.default;
if (typeof project !== "string" || project.length === 0) {
  fail(".firebaserc projects.default is missing.", "Set projects.default in .firebaserc.");
}
const guest = conf?.targets?.[project]?.hosting?.guest;
if (!Array.isArray(guest) || guest.length === 0 || typeof guest[0] !== "string") {
  fail(
    "hosting target guest is missing in .firebaserc.",
    "Run: firebase target:apply hosting guest <hosting-site-id>"
  );
}
NODE

echo "[owner-setup] checking repository variables via gh CLI"
if ! command -v gh >/dev/null 2>&1; then
  fail "gh CLI is not installed." "Install gh CLI, login, then run: gh variable set BASE_URL --body 'https://<host>' && gh variable set STORE_ID --body '<storeId>'"
fi
if ! gh auth status >/dev/null 2>&1; then
  fail "gh CLI is not authenticated." "Run: gh auth login"
fi

vars_json="$(gh variable list --json name 2>/dev/null || true)"
if [ "${vars_json}" = "" ]; then
  fail "failed to read repository variables." "Run: gh variable set BASE_URL --body 'https://<host>' && gh variable set STORE_ID --body '<storeId>'"
fi

VARS_JSON="${vars_json}" node <<'NODE'
const input = process.env.VARS_JSON ?? "";

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

let rows;
try {
  rows = JSON.parse(input);
} catch {
  fail("repository variable output is not valid JSON.", "Run: gh variable list --json name");
}
const names = new Set(Array.isArray(rows) ? rows.map((row) => row?.name) : []);
if (!names.has("BASE_URL")) {
  fail("repository variable BASE_URL is missing.", "Run: gh variable set BASE_URL --body 'https://<host>'");
}
if (!names.has("STORE_ID")) {
  fail("repository variable STORE_ID is missing.", "Run: gh variable set STORE_ID --body '<storeId>'");
}
NODE

echo "[owner-setup] PASS"
echo "Next step: PROJECT_ID=<gcp-project-id> sh ops/stripe-secrets-check.sh"
