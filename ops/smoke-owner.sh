#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-}"
OWNER_API_TOKEN="${OWNER_API_TOKEN:-}"

if [ "${BASE_URL}" = "" ] || [ "${STORE_ID}" = "" ]; then
  echo "ERROR: BASE_URL and STORE_ID are required." >&2
  echo "Next step: BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/smoke-owner.sh" >&2
  exit 1
fi

echo "[smoke-owner] check unauthorized owner telemetry request"
UNAUTH_CODE="$(curl -s -o /tmp/smoke_owner_unauth.txt -w "%{http_code}" "${BASE_URL}/api/owner/telemetry?storeId=${STORE_ID}&range=today" || true)"
if [ "${UNAUTH_CODE}" != "403" ]; then
  echo "ERROR: expected 403 for missing owner headers, got ${UNAUTH_CODE}" >&2
  echo "Next step: verify owner auth guard in /api/owner/telemetry" >&2
  exit 1
fi

echo "[smoke-owner] check unauthorized owner billing status request"
UNAUTH_BILLING_CODE="$(curl -s -o /tmp/smoke_owner_unauth_billing.txt -w "%{http_code}" "${BASE_URL}/api/owner/billingStatus?storeId=${STORE_ID}&range=today" || true)"
if [ "${UNAUTH_BILLING_CODE}" != "403" ]; then
  echo "ERROR: expected 403 for missing owner headers on billing status, got ${UNAUTH_BILLING_CODE}" >&2
  echo "Next step: verify owner auth guard in /api/owner/billingStatus" >&2
  exit 1
fi

if [ "${OWNER_API_TOKEN}" = "" ]; then
  echo "ERROR: OWNER_API_TOKEN is required for authorized owner telemetry check." >&2
  echo "Next step: OWNER_API_TOKEN=<token> BASE_URL=${BASE_URL} STORE_ID=${STORE_ID} sh ops/smoke-owner.sh" >&2
  exit 1
fi

REQ_TS="$(date +%s%3N)"
REQ_NONCE="nonce-$(date +%s)-$$"

echo "[smoke-owner] check authorized owner telemetry request"
AUTH_CODE="$(curl -s -o /tmp/smoke_owner_auth.txt -w "%{http_code}" \
  -H "X-OWNER-TOKEN: ${OWNER_API_TOKEN}" \
  -H "X-REQ-TS: ${REQ_TS}" \
  -H "X-REQ-NONCE: ${REQ_NONCE}" \
  "${BASE_URL}/api/owner/telemetry?storeId=${STORE_ID}&range=today" || true)"

if [ "${AUTH_CODE}" != "200" ]; then
  echo "ERROR: expected 200 for authorized owner telemetry request, got ${AUTH_CODE}" >&2
  echo "Next step: check OWNER_API_TOKEN / nonce freshness / owner rate limit and retry." >&2
  exit 1
fi

REQ_TS_BILLING="$(date +%s%3N)"
REQ_NONCE_BILLING="nonce-$(date +%s)-$$_billing"

echo "[smoke-owner] check authorized owner billing status request"
BILLING_CODE="$(curl -s -o /tmp/smoke_owner_billing.txt -w "%{http_code}" \
  -H "X-OWNER-TOKEN: ${OWNER_API_TOKEN}" \
  -H "X-REQ-TS: ${REQ_TS_BILLING}" \
  -H "X-REQ-NONCE: ${REQ_NONCE_BILLING}" \
  "${BASE_URL}/api/owner/billingStatus?storeId=${STORE_ID}&range=today" || true)"

if [ "${BILLING_CODE}" != "200" ]; then
  echo "ERROR: expected 200 for authorized owner billing status request, got ${BILLING_CODE}" >&2
  echo "Next step: check OWNER_API_TOKEN / nonce freshness / owner rate limit and retry." >&2
  exit 1
fi

REQ_TS_2="$(date +%s%3N)"
REQ_NONCE_2="nonce-$(date +%s)-$$_2"

echo "[smoke-owner] check authorized owner store status request"
STATUS_CODE="$(curl -s -o /tmp/smoke_owner_status.txt -w "%{http_code}" \
  -H "X-OWNER-TOKEN: ${OWNER_API_TOKEN}" \
  -H "X-REQ-TS: ${REQ_TS_2}" \
  -H "X-REQ-NONCE: ${REQ_NONCE_2}" \
  "${BASE_URL}/api/owner/storeStatus?storeId=${STORE_ID}" || true)"

if [ "${STATUS_CODE}" != "200" ]; then
  echo "ERROR: expected 200 for authorized owner store status request, got ${STATUS_CODE}" >&2
  echo "Next step: check OWNER_API_TOKEN / nonce freshness / owner rate limit and retry." >&2
  exit 1
fi

echo "[smoke-owner] PASS"
