#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $1" >&2
  echo "Next step: $2" >&2
  exit 1
}

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOOTSTRAP_ENV="${BOOTSTRAP_ENV:-$HOME/.tonosama/bootstrap.env}"
PROJECT_ID="${PROJECT_ID:-}"
BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-test123}"

if [ -z "${PROJECT_ID}" ] && [ -f "${BOOTSTRAP_ENV}" ]; then
  PROJECT_ID="$(awk -F= '$1=="PROJECT_ID"{print substr($0,index($0,"=")+1)}' "${BOOTSTRAP_ENV}" | tail -n1)"
fi
[ -n "${PROJECT_ID}" ] || fail "PROJECT_ID is required." "Set PROJECT_ID or put PROJECT_ID in ${BOOTSTRAP_ENV}."

if [ -z "${BASE_URL}" ]; then
  BASE_URL="https://${PROJECT_ID}.web.app"
fi

echo "[autopilot] project=${PROJECT_ID}"
echo "[autopilot] base_url=${BASE_URL}"
echo "[autopilot] store_id=${STORE_ID}"

echo "[autopilot] preflight"
(
  cd "${ROOT_DIR}"
  PROJECT_ID="${PROJECT_ID}" sh ops/preflight-local.sh
)

echo "[autopilot] stripe secrets check"
(
  cd "${ROOT_DIR}"
  PROJECT_ID="${PROJECT_ID}" sh ops/stripe-secrets-check.sh
)

echo "[autopilot] deploy billing functions"
(
  cd "${ROOT_DIR}"
  firebase deploy \
    --project "${PROJECT_ID}" \
    --only functions:billingFlip,functions:billingCheckout,functions:billingWebhook \
    --non-interactive
)

echo "[autopilot] runtime health"
(
  cd "${ROOT_DIR}"
  BASE_URL="${BASE_URL}" STORE_ID="${STORE_ID}" sh ops/health.sh
)

echo "[autopilot] signed webhook smoke"
secret="$(gcloud secrets versions access latest --secret=STRIPE_WEBHOOK_SECRET --project="${PROJECT_ID}")"
[ -n "${secret}" ] || fail "STRIPE_WEBHOOK_SECRET is empty." "Set secret then rerun."
event_id="evt_autopilot_$(date +%s)"
session_id="cs_autopilot_$(date +%s)"
payload="$(cat <<JSON
{"id":"${event_id}","type":"checkout.session.completed","data":{"object":{"id":"${session_id}","metadata":{"storeId":"${STORE_ID}","checkoutKind":"guest_unlock","flow":"guest_unlock"},"amount_total":198,"currency":"jpy"}}}
JSON
)"
ts="$(date +%s)"
sig="$(printf "%s.%s" "${ts}" "${payload}" | openssl dgst -sha256 -hmac "${secret}" -binary | xxd -p -c 256)"
resp_file="$(mktemp)"
code="$(curl -sS -o "${resp_file}" -w "%{http_code}" -X POST "${BASE_URL}/api/billing/webhook" \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=${ts},v1=${sig}" \
  --data-binary "${payload}")"
body="$(cat "${resp_file}")"
rm -f "${resp_file}"
if [ "${code}" != "200" ] || [ "${body}" != "ok" ]; then
  fail "webhook smoke failed: http=${code} body=${body}" "Check Stripe secret binding and function logs."
fi

echo "[autopilot] webhook smoke OK (http=${code}, body=${body})"
echo "[autopilot] PASS"
