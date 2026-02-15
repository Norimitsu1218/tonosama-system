#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $1" >&2
  echo "Next step: $2" >&2
  exit 1
}

if [ "${PROJECT_ID:-}" = "" ]; then
  fail "PROJECT_ID is missing." "Run: PROJECT_ID=<gcp-project-id> sh ops/stripe-secrets-check.sh"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  fail "gcloud is not installed." "Install gcloud CLI and rerun."
fi

REQUIRED_SECRETS="STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET BILLING_SUCCESS_URL BILLING_CANCEL_URL"
MISSING=""

for secret_name in ${REQUIRED_SECRETS}; do
  if ! gcloud secrets describe "${secret_name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    MISSING="${MISSING} ${secret_name}"
  fi
done

if [ "${MISSING}" != "" ]; then
  echo "ERROR: missing Stripe billing secrets:${MISSING}" >&2
  echo "Next step: set each secret value (without committing) and rerun this check." >&2
  echo "Command template:" >&2
  echo "firebase functions:secrets:set STRIPE_SECRET_KEY --project ${PROJECT_ID}" >&2
  echo "firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project ${PROJECT_ID}" >&2
  echo "firebase functions:secrets:set BILLING_SUCCESS_URL --project ${PROJECT_ID}" >&2
  echo "firebase functions:secrets:set BILLING_CANCEL_URL --project ${PROJECT_ID}" >&2
  exit 1
fi

echo "[stripe-secrets-check] PASS (${PROJECT_ID})"
