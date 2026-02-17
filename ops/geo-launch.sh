#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-https://apicius-owner.web.app}"
PARTNER_ID="${PARTNER_ID:-partner-demo}"
LAT="${LAT:-}"
LNG="${LNG:-}"
OWNER_TOKEN="${OWNER_API_TOKEN:-${PARTNER_API_TOKEN:-}}"
STORE_NAME="${STORE_NAME:-}"
SOURCE_URL="${SOURCE_URL:-}"
OPEN="${OPEN:-0}"

if [ "${LAT}" = "" ] || [ "${LNG}" = "" ]; then
  echo "ERROR: LAT and LNG are required." >&2
  echo "Next step: OWNER_API_TOKEN=<token> LAT=35.6764 LNG=139.6500 sh ops/geo-launch.sh" >&2
  exit 1
fi

if [ "${OWNER_TOKEN}" = "" ]; then
  echo "ERROR: OWNER_API_TOKEN (or PARTNER_API_TOKEN) is required." >&2
  echo "Next step: OWNER_API_TOKEN=<token> LAT=35.6764 LNG=139.6500 sh ops/geo-launch.sh" >&2
  exit 1
fi

REQ_TS="$(date +%s%3N)"
REQ_NONCE="geo-$(date +%s)-$$"
TMP_BODY="/tmp/geo_launch_body_$$.json"
TMP_OUT="/tmp/geo_launch_out_$$.json"

cat >"${TMP_BODY}" <<EOF
{
  "partnerId": "${PARTNER_ID}",
  "latitude": ${LAT},
  "longitude": ${LNG},
  "storeName": "${STORE_NAME}",
  "sourceUrl": "${SOURCE_URL}",
  "intent": "bootstrap guest site from coordinates in one shot",
  "allowed_use": "owner approved"
}
EOF

HTTP_CODE="$(curl -sS -o "${TMP_OUT}" -w "%{http_code}" \
  -X POST "${BASE_URL}/api/owner/geoBootstrap" \
  -H "Content-Type: application/json" \
  -H "X-OWNER-TOKEN: ${OWNER_TOKEN}" \
  -H "X-REQ-TS: ${REQ_TS}" \
  -H "X-REQ-NONCE: ${REQ_NONCE}" \
  --data-binary "@${TMP_BODY}" || true)"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "ERROR: geo bootstrap failed (HTTP ${HTTP_CODE})" >&2
  cat "${TMP_OUT}" >&2 || true
  exit 1
fi

STORE_ID="$(sed -n 's/.*"storeId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${TMP_OUT}" | head -n 1)"
GUEST_URL="$(sed -n 's/.*"guestUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${TMP_OUT}" | head -n 1)"
ELAPSED_MS="$(sed -n 's/.*"elapsedMs"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "${TMP_OUT}" | head -n 1)"

if [ "${STORE_ID}" = "" ] || [ "${GUEST_URL}" = "" ]; then
  echo "ERROR: invalid response payload" >&2
  cat "${TMP_OUT}" >&2 || true
  exit 1
fi

echo "[geo-launch] PASS"
echo "storeId=${STORE_ID}"
echo "guestUrl=${GUEST_URL}"
echo "elapsedMs=${ELAPSED_MS:-unknown}"

if [ "${OPEN}" = "1" ]; then
  if command -v open >/dev/null 2>&1; then
    open "${GUEST_URL}" >/dev/null 2>&1 || true
  fi
fi
