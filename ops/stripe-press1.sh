#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  PROJECT_ID=<gcp-project-id> sh ops/stripe-press1.sh <SECRET_NAME>

Supported secret names:
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  BILLING_SUCCESS_URL
  BILLING_CANCEL_URL

Flow:
  1) Copy value to clipboard
  2) Press 1 + Enter to apply secret
  3) Auto deploy Stripe-related Functions
USAGE
}

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

PROJECT_ID="${PROJECT_ID:-}"
SECRET_NAME="${1:-}"

if [ "${SECRET_NAME}" = "--help" ] || [ "${SECRET_NAME}" = "-h" ]; then
  usage
  exit 0
fi

[ -n "${PROJECT_ID}" ] || fail "PROJECT_ID is required."
[ -n "${SECRET_NAME}" ] || {
  usage
  exit 1
}

case "${SECRET_NAME}" in
  STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|BILLING_SUCCESS_URL|BILLING_CANCEL_URL) ;;
  *)
    usage
    fail "unsupported secret name: ${SECRET_NAME}"
    ;;
esac

echo "[stripe-press1] project=${PROJECT_ID} secret=${SECRET_NAME}"
PROJECT_ID="${PROJECT_ID}" sh scripts/apply-secret-on-1.sh "${SECRET_NAME}" --firebase-only --firebase-functions

echo "[stripe-press1] deploy Stripe-related functions"
firebase deploy \
  --project "${PROJECT_ID}" \
  --only functions:billingFlip,functions:billingCheckout,functions:billingWebhook \
  --non-interactive

echo "[stripe-press1] verify secret presence"
PROJECT_ID="${PROJECT_ID}" sh ops/stripe-secrets-check.sh

echo "[stripe-press1] done"
