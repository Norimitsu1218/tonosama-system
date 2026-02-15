#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $1" >&2
  echo "Next step: $2" >&2
  exit 1
}

echo "[preflight-local] checking placeholders"
if rg -n "REPLACE_WITH_" .firebaserc >/dev/null 2>&1; then
  fail ".firebaserc still has placeholders." "Replace REPLACE_WITH_* values in .firebaserc."
fi

echo "[preflight-local] checking hosting target mapping"
node <<'NODE'
const fs = require("node:fs");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

const firebaserc = JSON.parse(fs.readFileSync(".firebaserc", "utf8"));
const defaultProject = firebaserc?.projects?.default;
const targetGuest = firebaserc?.targets?.[defaultProject]?.hosting?.guest;
if (!Array.isArray(targetGuest) || targetGuest.length === 0) {
  fail(".firebaserc guest hosting target is missing.", "Run: firebase target:apply hosting guest <hosting-site-id>");
}

const firebaseJson = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
const guest = (firebaseJson.hosting || []).find((entry) => entry && entry.target === "guest");
if (!guest || !guest.frameworksBackend || typeof guest.frameworksBackend.region !== "string") {
  fail("firebase.json guest region is missing.", "Set hosting.frameworksBackend.region for target guest.");
}
process.stdout.write(`[preflight-local] region=${guest.frameworksBackend.region}\n`);
NODE

echo "[preflight-local] checking workflow secret hygiene"
if rg -n "FIREBASE_TOKEN" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "legacy FIREBASE_TOKEN reference found in workflow." "Remove FIREBASE_TOKEN from workflow and use OIDC only."
fi

echo "[preflight-local] completed"

if [ "${PROJECT_ID:-}" != "" ]; then
  echo "[preflight-local] checking Stripe billing secrets"
  PROJECT_ID="${PROJECT_ID}" sh ops/stripe-secrets-check.sh
fi
