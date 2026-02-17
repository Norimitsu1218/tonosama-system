#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  sh ops/bootstrap.sh

Description:
  One-command bootstrap for repeated project setup:
  - GitHub repository variables/secrets
  - Firebase Functions secrets
  - Stripe secret presence check

Inputs:
  GLOBAL_ENV_FILE  (default: $HOME/.tonosama/bootstrap.env)
  PROJECT_ENV_FILE (default: .env.bootstrap)
  DRY_RUN          (default: 1; set DRY_RUN=0 to apply)

Required env keys (in env file):
  PROJECT_ID
  BASE_URL
  STORE_ID
  GCP_WIF_PROVIDER
  GCP_DEPLOY_SA
  GATE_TOKEN_SECRET
  OWNER_API_TOKEN
  TELEMETRY_SALT_SECRET
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  GEMINI_API_KEY

Optional:
  BILLING_SUCCESS_URL (default: ${BASE_URL}/shops/menu/${STORE_ID}?lang=en)
  BILLING_CANCEL_URL  (default: ${BASE_URL}/shops/info/${STORE_ID}?lang=en)
  GEMINI_MODEL_FLASH  (default: gemini-2.5-flash)
  GEMINI_MODEL_PRO    (default: gemini-2.5-pro)
  OKAMI_ENGINE        (default: gemini)
USAGE
}

log() {
  printf '%s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

load_env_if_exists() {
  file_path="$1"
  if [ -f "$file_path" ]; then
    # shellcheck disable=SC1090
    set -a; . "$file_path"; set +a
    log "[bootstrap] loaded ${file_path}"
  fi
}

require_env() {
  key="$1"
  eval "val=\${$key:-}"
  [ -n "$val" ] || fail "missing env: ${key}"
}

run_cmd() {
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] $*"
    return 0
  fi
  "$@"
}

set_gh_variable() {
  name="$1"
  value="$2"
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] gh variable set ${name} --body <redacted>"
    return 0
  fi
  gh variable set "$name" --body "$value"
}

set_gh_secret() {
  name="$1"
  value="$2"
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] gh secret set ${name} --body <redacted>"
    return 0
  fi
  gh secret set "$name" --body "$value"
}

set_firebase_secret() {
  name="$1"
  value="$2"
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] firebase functions:secrets:set ${name} --project ${PROJECT_ID} --force --data-file=- < <redacted>"
    return 0
  fi
  printf "%s" "$value" | firebase functions:secrets:set "$name" --project "$PROJECT_ID" --force --data-file=- >/dev/null
  log "[ok] firebase secret ${name}"
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

GLOBAL_ENV_FILE="${GLOBAL_ENV_FILE:-$HOME/.tonosama/bootstrap.env}"
PROJECT_ENV_FILE="${PROJECT_ENV_FILE:-.env.bootstrap}"
DRY_RUN="${DRY_RUN:-1}"

load_env_if_exists "$GLOBAL_ENV_FILE"
load_env_if_exists "$PROJECT_ENV_FILE"

require_cmd gh
require_cmd firebase
require_cmd gcloud

gh auth status >/dev/null 2>&1 || fail "gh auth required (run: gh auth login)"

require_env PROJECT_ID
require_env BASE_URL
require_env STORE_ID
require_env GCP_WIF_PROVIDER
require_env GCP_DEPLOY_SA
require_env GATE_TOKEN_SECRET
require_env OWNER_API_TOKEN
require_env TELEMETRY_SALT_SECRET
require_env STRIPE_SECRET_KEY
require_env STRIPE_WEBHOOK_SECRET
require_env GEMINI_API_KEY

GEMINI_MODEL_FLASH="${GEMINI_MODEL_FLASH:-gemini-2.5-flash}"
GEMINI_MODEL_PRO="${GEMINI_MODEL_PRO:-gemini-2.5-pro}"
OKAMI_ENGINE="${OKAMI_ENGINE:-gemini}"
BILLING_SUCCESS_URL="${BILLING_SUCCESS_URL:-${BASE_URL%/}/shops/menu/${STORE_ID}?lang=en}"
BILLING_CANCEL_URL="${BILLING_CANCEL_URL:-${BASE_URL%/}/shops/info/${STORE_ID}?lang=en}"

log "[bootstrap] start (dry_run=${DRY_RUN})"

log "[bootstrap] github variables"
set_gh_variable BASE_URL "$BASE_URL"
set_gh_variable STORE_ID "$STORE_ID"

log "[bootstrap] github secrets for deploy workflow"
set_gh_secret GCP_WIF_PROVIDER "$GCP_WIF_PROVIDER"
set_gh_secret GCP_DEPLOY_SA "$GCP_DEPLOY_SA"

log "[bootstrap] firebase function secrets"
set_firebase_secret GATE_TOKEN_SECRET "$GATE_TOKEN_SECRET"
set_firebase_secret OWNER_API_TOKEN "$OWNER_API_TOKEN"
set_firebase_secret TELEMETRY_SALT_SECRET "$TELEMETRY_SALT_SECRET"
set_firebase_secret STRIPE_SECRET_KEY "$STRIPE_SECRET_KEY"
set_firebase_secret STRIPE_WEBHOOK_SECRET "$STRIPE_WEBHOOK_SECRET"
set_firebase_secret BILLING_SUCCESS_URL "$BILLING_SUCCESS_URL"
set_firebase_secret BILLING_CANCEL_URL "$BILLING_CANCEL_URL"
set_firebase_secret GEMINI_API_KEY "$GEMINI_API_KEY"
set_firebase_secret GEMINI_MODEL_FLASH "$GEMINI_MODEL_FLASH"
set_firebase_secret GEMINI_MODEL_PRO "$GEMINI_MODEL_PRO"
set_firebase_secret OKAMI_ENGINE "$OKAMI_ENGINE"

if [ "$DRY_RUN" = "1" ]; then
  log "[bootstrap] dry-run complete. Apply with: DRY_RUN=0 sh ops/bootstrap.sh"
  exit 0
fi

log "[bootstrap] verifying stripe secrets"
PROJECT_ID="$PROJECT_ID" sh ops/stripe-secrets-check.sh

log "[bootstrap] done"
