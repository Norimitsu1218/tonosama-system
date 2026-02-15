#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-test123}"
GATE_TOKEN="${GATE_TOKEN:-}"

if [ "${BASE_URL}" = "" ]; then
  echo "ERROR: BASE_URL is required. Example: BASE_URL=https://<host> sh ops/post-deploy-smoke.sh" >&2
  exit 1
fi

echo "[smoke] gate check"
GATE_CODE="$(curl -s -o /tmp/smoke_gate_body.txt -w "%{http_code}" "${BASE_URL}/api/gate?storeId=${STORE_ID}")"
echo "[smoke] gate status=${GATE_CODE}"
if [ "${GATE_CODE}" != "200" ] && [ "${GATE_CODE}" != "403" ] && [ "${GATE_CODE}" != "429" ]; then
  echo "ERROR: unexpected /api/gate status ${GATE_CODE}" >&2
  exit 1
fi

echo "[smoke] bundle check (no token)"
BUNDLE_CODE="$(curl -s -o /tmp/smoke_bundle_body.txt -w "%{http_code}" "${BASE_URL}/api/storeBundle?storeId=${STORE_ID}")"
echo "[smoke] bundle(no token) status=${BUNDLE_CODE}"
if [ "${BUNDLE_CODE}" != "401" ] && [ "${BUNDLE_CODE}" != "403" ]; then
  echo "ERROR: unexpected /api/storeBundle no-token status ${BUNDLE_CODE}" >&2
  exit 1
fi

if [ "${GATE_TOKEN}" != "" ]; then
  echo "[smoke] bundle check (with token)"
  BUNDLE_AUTH_CODE="$(curl -s -o /tmp/smoke_bundle_auth_body.txt -w "%{http_code}" -H "Authorization: Bearer ${GATE_TOKEN}" "${BASE_URL}/api/storeBundle?storeId=${STORE_ID}")"
  echo "[smoke] bundle(with token) status=${BUNDLE_AUTH_CODE}"
  if [ "${BUNDLE_AUTH_CODE}" != "200" ] && [ "${BUNDLE_AUTH_CODE}" != "403" ]; then
    echo "ERROR: unexpected /api/storeBundle token status ${BUNDLE_AUTH_CODE}" >&2
    exit 1
  fi
fi

echo "[smoke] completed"
