#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $1" >&2
  echo "Next step: $2" >&2
  exit 1
}

echo "CI preflight: checking placeholder values"
if rg -n "REPLACE_WITH_" .firebaserc >/dev/null 2>&1; then
  fail ".firebaserc still contains placeholder values." "Edit .firebaserc and replace REPLACE_WITH_* values."
fi

echo "CI preflight: checking lockfile policy"
if [ ! -f package-lock.json ]; then
  fail "package-lock.json is missing." "Generate and commit package-lock.json, then run npm ci."
fi

echo "CI preflight: checking ops canary helper"
if [ ! -x ops/canary-release.sh ]; then
  fail "ops/canary-release.sh is missing or not executable." "Run: chmod +x ops/canary-release.sh and commit."
fi
if ! git diff --name-only --exit-code package-lock.json >/dev/null 2>&1; then
  fail "package-lock.json has uncommitted changes." "Run: npm i && git add package-lock.json && git commit -m 'chore: sync lockfile'"
fi

echo "CI preflight: checking OIDC deploy secret wiring"
if [ "${GCP_WIF_PROVIDER:-}" = "" ]; then
  fail "GCP_WIF_PROVIDER is not set." "Add GitHub Actions secret GCP_WIF_PROVIDER and map it into the deploy job env."
fi
if [ "${GCP_DEPLOY_SA:-}" = "" ]; then
  fail "GCP_DEPLOY_SA is not set." "Add GitHub Actions secret GCP_DEPLOY_SA and map it into the deploy job env."
fi

echo "CI preflight: checking firebase hosting config"
node <<'NODE'
const fs = require("node:fs");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync("firebase.json", "utf8");
} catch {
  fail("firebase.json is missing.", "Restore firebase.json and commit it.");
}

let config;
try {
  config = JSON.parse(raw);
} catch {
  fail("firebase.json is not valid JSON.", "Fix JSON syntax in firebase.json.");
}

if (!Array.isArray(config.hosting) || config.hosting.length === 0) {
  fail("firebase.json hosting array is missing.", "Define hosting target array in firebase.json.");
}

const guest = config.hosting.find((entry) => entry && entry.target === "guest");
if (!guest) {
  fail("hosting target 'guest' is not defined.", "Add hosting target 'guest' to firebase.json.");
}
if (guest.source !== "apps/pwa-guest") {
  fail(
    "hosting target 'guest' must use source 'apps/pwa-guest'.",
    "Set hosting.source to 'apps/pwa-guest' for target 'guest'."
  );
}
if (!guest.frameworksBackend || typeof guest.frameworksBackend.region !== "string") {
  fail(
    "hosting target 'guest' requires frameworksBackend.region.",
    "Set hosting.frameworksBackend.region in firebase.json."
  );
}
if (!Array.isArray(guest.rewrites)) {
  fail("hosting target 'guest' rewrites are missing.", "Add /api rewrites under hosting target 'guest'.");
}

const rewriteMap = new Map(guest.rewrites.map((item) => [item.source, item.function]));
if (rewriteMap.get("/api/gate") !== "gate") {
  fail("rewrite '/api/gate' -> function 'gate' is required.", "Set rewrite /api/gate to function 'gate'.");
}
if (rewriteMap.get("/api/storeBundle") !== "storeBundle") {
  fail(
    "rewrite '/api/storeBundle' -> function 'storeBundle' is required.",
    "Set rewrite /api/storeBundle to function 'storeBundle'."
  );
}
if (rewriteMap.get("/api/billing/flip") !== "billingFlip") {
  fail(
    "rewrite '/api/billing/flip' -> function 'billingFlip' is required.",
    "Set rewrite /api/billing/flip to function 'billingFlip'."
  );
}
if (rewriteMap.get("/api/billing/checkout") !== "billingCheckout") {
  fail(
    "rewrite '/api/billing/checkout' -> function 'billingCheckout' is required.",
    "Set rewrite /api/billing/checkout to function 'billingCheckout'."
  );
}
if (rewriteMap.get("/api/billing/webhook") !== "billingWebhook") {
  fail(
    "rewrite '/api/billing/webhook' -> function 'billingWebhook' is required.",
    "Set rewrite /api/billing/webhook to function 'billingWebhook'."
  );
}
if (rewriteMap.get("/api/approvalLog") !== "approvalLog") {
  fail(
    "rewrite '/api/approvalLog' -> function 'approvalLog' is required.",
    "Set rewrite /api/approvalLog to function 'approvalLog'."
  );
}
if (rewriteMap.get("/api/owner/itemAction") !== "ownerItemAction") {
  fail(
    "rewrite '/api/owner/itemAction' -> function 'ownerItemAction' is required.",
    "Set rewrite /api/owner/itemAction to function 'ownerItemAction'."
  );
}
if (rewriteMap.get("/api/owner/telemetry") !== "ownerTelemetry") {
  fail(
    "rewrite '/api/owner/telemetry' -> function 'ownerTelemetry' is required.",
    "Set rewrite /api/owner/telemetry to function 'ownerTelemetry'."
  );
}
if (rewriteMap.get("/api/owner/billingStatus") !== "ownerBillingStatus") {
  fail(
    "rewrite '/api/owner/billingStatus' -> function 'ownerBillingStatus' is required.",
    "Set rewrite /api/owner/billingStatus to function 'ownerBillingStatus'."
  );
}
if (rewriteMap.get("/api/owner/storeStatus") !== "ownerStoreStatus") {
  fail(
    "rewrite '/api/owner/storeStatus' -> function 'ownerStoreStatus' is required.",
    "Set rewrite /api/owner/storeStatus to function 'ownerStoreStatus'."
  );
}
if (rewriteMap.get("/api/owner/costStatus") !== "ownerCostStatus") {
  fail(
    "rewrite '/api/owner/costStatus' -> function 'ownerCostStatus' is required.",
    "Set rewrite /api/owner/costStatus to function 'ownerCostStatus'."
  );
}
if (rewriteMap.get("/api/owner/businessRules") !== "ownerBusinessRules") {
  fail(
    "rewrite '/api/owner/businessRules' -> function 'ownerBusinessRules' is required.",
    "Set rewrite /api/owner/businessRules to function 'ownerBusinessRules'."
  );
}
if (rewriteMap.get("/api/owner/menuImport") !== "ownerMenuImport") {
  fail(
    "rewrite '/api/owner/menuImport' -> function 'ownerMenuImport' is required.",
    "Set rewrite /api/owner/menuImport to function 'ownerMenuImport'."
  );
}
if (rewriteMap.get("/api/owner/menuVisionImport") !== "ownerMenuVisionImport") {
  fail(
    "rewrite '/api/owner/menuVisionImport' -> function 'ownerMenuVisionImport' is required.",
    "Set rewrite /api/owner/menuVisionImport to function 'ownerMenuVisionImport'."
  );
}
if (rewriteMap.get("/api/owner/pairingOverrides") !== "ownerPairingOverrides") {
  fail(
    "rewrite '/api/owner/pairingOverrides' -> function 'ownerPairingOverrides' is required.",
    "Set rewrite /api/owner/pairingOverrides to function 'ownerPairingOverrides'."
  );
}
if (rewriteMap.get("/api/owner/soulCapture") !== "ownerSoulCapture") {
  fail(
    "rewrite '/api/owner/soulCapture' -> function 'ownerSoulCapture' is required.",
    "Set rewrite /api/owner/soulCapture to function 'ownerSoulCapture'."
  );
}
if (rewriteMap.get("/api/owner/crystallize") !== "ownerCrystallize") {
  fail(
    "rewrite '/api/owner/crystallize' -> function 'ownerCrystallize' is required.",
    "Set rewrite /api/owner/crystallize to function 'ownerCrystallize'."
  );
}
if (rewriteMap.get("/api/owner/salesDiagnosis") !== "ownerSalesDiagnosis") {
  fail(
    "rewrite '/api/owner/salesDiagnosis' -> function 'ownerSalesDiagnosis' is required.",
    "Set rewrite /api/owner/salesDiagnosis to function 'ownerSalesDiagnosis'."
  );
}
if (rewriteMap.get("/api/owner/businessModel") !== "ownerBusinessModel") {
  fail(
    "rewrite '/api/owner/businessModel' -> function 'ownerBusinessModel' is required.",
    "Set rewrite /api/owner/businessModel to function 'ownerBusinessModel'."
  );
}
if (rewriteMap.get("/api/owner/contractAccept") !== "ownerContractAccept") {
  fail(
    "rewrite '/api/owner/contractAccept' -> function 'ownerContractAccept' is required.",
    "Set rewrite /api/owner/contractAccept to function 'ownerContractAccept'."
  );
}
if (rewriteMap.get("/api/owner/activateAccount") !== "ownerActivateAccount") {
  fail(
    "rewrite '/api/owner/activateAccount' -> function 'ownerActivateAccount' is required.",
    "Set rewrite /api/owner/activateAccount to function 'ownerActivateAccount'."
  );
}
if (rewriteMap.get("/api/owner/shopCardImport") !== "ownerShopCardImport") {
  fail(
    "rewrite '/api/owner/shopCardImport' -> function 'ownerShopCardImport' is required.",
    "Set rewrite /api/owner/shopCardImport to function 'ownerShopCardImport'."
  );
}
if (rewriteMap.get("/api/owner/publishTrends") !== "ownerPublishTrends") {
  fail(
    "rewrite '/api/owner/publishTrends' -> function 'ownerPublishTrends' is required.",
    "Set rewrite /api/owner/publishTrends to function 'ownerPublishTrends'."
  );
}
if (rewriteMap.get("/api/owner/initialFeeCheckout") !== "ownerInitialFeeCheckout") {
  fail(
    "rewrite '/api/owner/initialFeeCheckout' -> function 'ownerInitialFeeCheckout' is required.",
    "Set rewrite /api/owner/initialFeeCheckout to function 'ownerInitialFeeCheckout'."
  );
}
if (rewriteMap.get("/api/owner/shopCardParse") !== "ownerShopCardParse") {
  fail(
    "rewrite '/api/owner/shopCardParse' -> function 'ownerShopCardParse' is required.",
    "Set rewrite /api/owner/shopCardParse to function 'ownerShopCardParse'."
  );
}
if (rewriteMap.get("/api/owner/shopCardVisionParse") !== "ownerShopCardVisionParse") {
  fail(
    "rewrite '/api/owner/shopCardVisionParse' -> function 'ownerShopCardVisionParse' is required.",
    "Set rewrite /api/owner/shopCardVisionParse to function 'ownerShopCardVisionParse'."
  );
}
if (rewriteMap.get("/api/owner/storeQr") !== "ownerStoreQr") {
  fail(
    "rewrite '/api/owner/storeQr' -> function 'ownerStoreQr' is required.",
    "Set rewrite /api/owner/storeQr to function 'ownerStoreQr'."
  );
}
if (rewriteMap.get("/api/telemetry") !== "telemetry") {
  fail(
    "rewrite '/api/telemetry' -> function 'telemetry' is required.",
    "Set rewrite /api/telemetry to function 'telemetry'."
  );
}
if (rewriteMap.get("/api/okami/answer") !== "okamiAnswer") {
  fail(
    "rewrite '/api/okami/answer' -> function 'okamiAnswer' is required.",
    "Set rewrite /api/okami/answer to function 'okamiAnswer'."
  );
}

let firebasercRaw;
try {
  firebasercRaw = fs.readFileSync(".firebaserc", "utf8");
} catch {
  fail(".firebaserc is missing.", "Restore .firebaserc with default project and hosting target.");
}
let firebaserc;
try {
  firebaserc = JSON.parse(firebasercRaw);
} catch {
  fail(".firebaserc is not valid JSON.", "Fix JSON syntax in .firebaserc.");
}
const defaultProject = firebaserc?.projects?.default;
if (typeof defaultProject !== "string" || defaultProject.length === 0) {
  fail(".firebaserc projects.default is missing.", "Set .firebaserc projects.default to your Firebase project id.");
}
const targetGuest = firebaserc?.targets?.[defaultProject]?.hosting?.guest;
if (!Array.isArray(targetGuest) || targetGuest.length === 0 || typeof targetGuest[0] !== "string") {
  fail(
    ".firebaserc hosting target 'guest' is missing for projects.default.",
    "Run: firebase target:apply hosting guest <hosting-site-id>"
  );
}

process.stdout.write("CI preflight: firebase config looks valid.\n");
NODE

echo "CI preflight: checking Firestore deny-all policy"
node <<'NODE'
const fs = require("node:fs");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync("firestore.rules", "utf8");
} catch {
  fail("firestore.rules is missing.", "Restore firestore.rules with deny-all policy.");
}

const compact = raw.replace(/\s+/g, " ");
if (!compact.includes("allow read, write: if false;")) {
  fail(
    "firestore.rules is not deny-all.",
    "Set Guest-facing rules to deny-all and keep data access via Functions Admin SDK only."
  );
}

process.stdout.write("CI preflight: firestore rules deny-all confirmed.\n");
NODE

echo "CI preflight: checking deploy workflow trigger safety"
if rg -n "pull_request" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow must not run on pull_request." "Restrict trigger to push on main-v2 only."
fi
if ! rg -n 'branches:\s*\["main-v2"\]' .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is not pinned to main-v2 branch push." "Set on.push.branches to [\"main-v2\"]."
fi
if ! rg -n "google-github-actions/auth@v2" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is missing OIDC auth step." "Add google-github-actions/auth@v2 before deploy step."
fi
if rg -n "FIREBASE_TOKEN" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow still references FIREBASE_TOKEN." "Remove FIREBASE_TOKEN usage and keep OIDC deploy only."
fi
if ! rg -n "id-token:\\s*write" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is missing id-token: write permission." "Set workflow permissions to include id-token: write."
fi
if ! rg -n "contents:\\s*read" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is missing contents: read permission." "Set workflow permissions to include contents: read."
fi
if rg -n "actions:\\s*write|contents:\\s*write|id-token:\\s*read|packages:\\s*write" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow has over-privileged permissions." "Reduce workflow permissions to id-token: write and contents: read."
fi
if ! rg -n "paths:" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is missing push path filters." "Add on.push.paths to avoid deploy on unrelated changes."
fi
if ! rg -n "BASE_URL:\\s*\\$\\{\\{ vars\\.BASE_URL \\}\\}" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is missing BASE_URL repository variable wiring." "Set job env BASE_URL from vars.BASE_URL."
fi
if ! rg -n "STORE_ID:\\s*\\$\\{\\{ vars\\.STORE_ID \\}\\}" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is missing STORE_ID repository variable wiring." "Set job env STORE_ID from vars.STORE_ID."
fi
if ! rg -n "sh ops/health.sh" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
  fail "firebase-deploy workflow is missing post-deploy health check step." "Add BASE_URL/STORE_ID health check step using ops/health.sh."
fi
if [ -d approved ]; then
  if ! rg -n "sh ops/verify-approval-hash.sh" .github/workflows/firebase-deploy.yml >/dev/null 2>&1; then
    fail "firebase-deploy workflow is missing approval hash verification step." "Add STORE_ID hash verification step using ops/verify-approval-hash.sh."
  fi
fi

echo "CI preflight: checking scripts gate"
node <<'NODE'
const fs = require("node:fs");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

let rootPkg;
try {
  rootPkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
} catch {
  fail("package.json is missing or invalid.", "Restore package.json with workspace scripts.");
}

if (typeof rootPkg?.scripts?.["test:functions"] !== "string") {
  fail("script 'test:functions' is missing.", "Add test:functions script at repository root.");
}
NODE

echo "CI preflight: checking npm audit baseline"
sh ops/check-audit.sh

echo "CI preflight: checking approved output governance"
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function fail(message, next) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.stderr.write(`Next step: ${next}\n`);
  process.exit(1);
}

const approvedDir = "approved";
if (!fs.existsSync(approvedDir)) {
  process.stdout.write("CI preflight: approved/ not found, governance output check skipped.\n");
  process.exit(0);
}

const allFiles = fs
  .readdirSync(approvedDir)
  .filter((name) => !name.startsWith("."))
  .map((name) => path.join(approvedDir, name))
  .filter((entry) => fs.statSync(entry).isFile());

const publishFiles = allFiles.filter((entry) => path.basename(entry) !== "approval_log.ndjson");
if (publishFiles.length === 0) {
  process.stdout.write("CI preflight: approved/ has no publish artifacts, governance output check skipped.\n");
  process.exit(0);
}

const manifestSchemaPath = "ops/manifest.schema.json";
const manifestPath = "ops/os-manifest.json";
const approvalLogPath = path.join(approvedDir, "approval_log.ndjson");

if (!fs.existsSync(manifestSchemaPath)) {
  fail("ops/manifest.schema.json is missing.", "Add ops/manifest.schema.json before publishing to approved/.");
}
if (!fs.existsSync(manifestPath)) {
  fail("ops/os-manifest.json is missing.", "Create ops/os-manifest.json with required fields.");
}
if (!fs.existsSync(approvalLogPath)) {
  fail("approved/approval_log.ndjson is missing.", "Write approval log entries before publishing approved artifacts.");
}

const approvalLog = fs.readFileSync(approvalLogPath, "utf8").trim();
if (!approvalLog) {
  fail("approved/approval_log.ndjson is empty.", "Append at least one approval log entry.");
}

let schema;
let manifest;
try {
  schema = JSON.parse(fs.readFileSync(manifestSchemaPath, "utf8"));
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch {
  fail("manifest schema or manifest is not valid JSON.", "Fix JSON syntax in ops/manifest.schema.json and ops/os-manifest.json.");
}

const required = Array.isArray(schema.required) ? schema.required : [];
if (required.length === 0) {
  fail("manifest schema has no required fields.", "Set required fields in ops/manifest.schema.json.");
}

for (const key of required) {
  const value = manifest[key];
  if (typeof value === "string" && value.trim().length > 0) {
    continue;
  }
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0)) {
    continue;
  }
  fail(`manifest field '${key}' is missing or invalid.`, `Set '${key}' in ops/os-manifest.json.`);
}

process.stdout.write("CI preflight: approved output manifest + approval log checks passed.\n");
NODE

echo "CI preflight: checking runtime hard constraints"
sh ops/check-runtime-constraints.sh

echo "CI preflight completed."
