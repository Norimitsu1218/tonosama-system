#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-test123}"

if [ "${BASE_URL}" = "" ]; then
  echo "ERROR: BASE_URL is required. Example: BASE_URL=https://example.web.app STORE_ID=test123 sh ops/health.sh" >&2
  echo "Next step: set BASE_URL and rerun." >&2
  exit 1
fi

fail=0

echo "[health] checking gate endpoint"
GATE_URL="${BASE_URL}/api/gate?storeId=${STORE_ID}"
GATE_CODE="$(curl -s -o /tmp/health_gate_body.txt -w "%{http_code}" "${GATE_URL}" || true)"
if [ "${GATE_CODE}" = "200" ] || [ "${GATE_CODE}" = "403" ] || [ "${GATE_CODE}" = "429" ]; then
  echo "[health] gate OK status=${GATE_CODE}"
else
  echo "[health] gate FAIL status=${GATE_CODE}"
  echo "Next step: BASE_URL=${BASE_URL} STORE_ID=${STORE_ID} sh ops/incident.sh"
  fail=1
fi

echo "[health] checking SSR path"
SSR_URL="${BASE_URL}/s/${STORE_ID}"
SSR_CODE="$(curl -s -o /tmp/health_ssr_body.txt -w "%{http_code}" "${SSR_URL}" || true)"
if [ "${SSR_CODE}" = "200" ]; then
  echo "[health] SSR OK status=${SSR_CODE}"
else
  echo "[health] SSR FAIL status=${SSR_CODE}"
  echo "Next step: HOSTING_SOURCE=<channel-or-version> SITE_ID=<hosting-site-id> sh ops/rollback.sh"
  fail=1
fi

echo "[health] checking storeBundle endpoint (unauthorized probe)"
STORE_BUNDLE_URL="${BASE_URL}/api/storeBundle?storeId=${STORE_ID}"
STORE_BUNDLE_CODE="$(curl -s -o /tmp/health_bundle_body.txt -w "%{http_code}" "${STORE_BUNDLE_URL}" || true)"
if [ "${STORE_BUNDLE_CODE}" = "401" ] || [ "${STORE_BUNDLE_CODE}" = "403" ] || [ "${STORE_BUNDLE_CODE}" = "429" ]; then
  echo "[health] storeBundle OK status=${STORE_BUNDLE_CODE}"
else
  echo "[health] storeBundle FAIL status=${STORE_BUNDLE_CODE}"
  echo "Next step: verify rewrite /api/storeBundle and auth path, then rerun BASE_URL=${BASE_URL} STORE_ID=${STORE_ID} sh ops/health.sh"
  fail=1
fi

echo "[health] checking okami endpoint (unauthorized probe)"
OKAMI_URL="${BASE_URL}/api/okami/answer"
OKAMI_CODE="$(curl -s -o /tmp/health_okami_body.txt -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"prompt":"wifi"}' "${OKAMI_URL}" || true)"
if [ "${OKAMI_CODE}" = "401" ] || [ "${OKAMI_CODE}" = "403" ] || [ "${OKAMI_CODE}" = "429" ] || [ "${OKAMI_CODE}" = "503" ]; then
  echo "[health] okami OK status=${OKAMI_CODE}"
else
  echo "[health] okami FAIL status=${OKAMI_CODE}"
  echo "Next step: verify rewrite /api/okami/answer and function health, then rerun BASE_URL=${BASE_URL} STORE_ID=${STORE_ID} sh ops/health.sh"
  fail=1
fi

echo "[health] checking billing checkout endpoint (unauthorized probe)"
BILLING_CHECKOUT_URL="${BASE_URL}/api/billing/checkout"
BILLING_CHECKOUT_CODE="$(curl -s -o /tmp/health_billing_checkout_body.txt -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"mood":"HUNGRY"}' "${BILLING_CHECKOUT_URL}" || true)"
if [ "${BILLING_CHECKOUT_CODE}" = "401" ] || [ "${BILLING_CHECKOUT_CODE}" = "403" ] || [ "${BILLING_CHECKOUT_CODE}" = "429" ] || [ "${BILLING_CHECKOUT_CODE}" = "503" ]; then
  echo "[health] billingCheckout OK status=${BILLING_CHECKOUT_CODE}"
else
  echo "[health] billingCheckout FAIL status=${BILLING_CHECKOUT_CODE}"
  echo "Next step: verify rewrite /api/billing/checkout and function health, then rerun BASE_URL=${BASE_URL} STORE_ID=${STORE_ID} sh ops/health.sh"
  fail=1
fi

if [ "${fail}" -ne 0 ]; then
  exit 1
fi

echo "[health] PASS"
