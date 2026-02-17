#!/usr/bin/env sh
set -eu

# ROYAL ONBOARDING launcher:
# 1) geo bootstrap (10s site generation)
# 2) gate health check on generated store
# 3) outputs next manual actions for owner approval + checkout

BASE_URL="${BASE_URL:-https://apicius-owner.web.app}"
OWNER_API_TOKEN="${OWNER_API_TOKEN:-${PARTNER_API_TOKEN:-}}"
PARTNER_ID="${PARTNER_ID:-partner-demo}"
LAT="${LAT:-}"
LNG="${LNG:-}"
STORE_NAME="${STORE_NAME:-}"
SOURCE_URL="${SOURCE_URL:-}"
OPEN="${OPEN:-0}"

if [ "${LAT}" = "" ] || [ "${LNG}" = "" ]; then
  echo "ERROR: LAT and LNG are required." >&2
  echo "Next step: OWNER_API_TOKEN=<token> LAT=35.6764 LNG=139.6500 sh ops/royal-onboarding.sh" >&2
  exit 1
fi

if [ "${OWNER_API_TOKEN}" = "" ]; then
  echo "ERROR: OWNER_API_TOKEN (or PARTNER_API_TOKEN) is required." >&2
  echo "Next step: OWNER_API_TOKEN=<token> LAT=35.6764 LNG=139.6500 sh ops/royal-onboarding.sh" >&2
  exit 1
fi

TMP_LOG="/tmp/royal_onboarding_$$.log"

OWNER_API_TOKEN="${OWNER_API_TOKEN}" \
PARTNER_ID="${PARTNER_ID}" \
LAT="${LAT}" \
LNG="${LNG}" \
BASE_URL="${BASE_URL}" \
STORE_NAME="${STORE_NAME}" \
SOURCE_URL="${SOURCE_URL}" \
OPEN="${OPEN}" \
sh ops/geo-launch.sh | tee "${TMP_LOG}"

STORE_ID="$(sed -n 's/^storeId=\(.*\)$/\1/p' "${TMP_LOG}" | tail -n 1)"
GUEST_URL="$(sed -n 's/^guestUrl=\(.*\)$/\1/p' "${TMP_LOG}" | tail -n 1)"

if [ "${STORE_ID}" = "" ] || [ "${GUEST_URL}" = "" ]; then
  echo "ERROR: failed to parse geo bootstrap result" >&2
  exit 1
fi

echo "[royal-onboarding] gate smoke"
GATE_CODE="$(curl -sS -o /tmp/royal_gate_$$.txt -w "%{http_code}" "${BASE_URL%/}/api/gate?storeId=${STORE_ID}" || true)"
echo "gateStatus=${GATE_CODE}"

if [ "${GATE_CODE}" != "200" ]; then
  echo "WARN: gate is not 200. Check /tmp/royal_gate_$$.txt"
fi

echo ""
echo "=== ROYAL ONBOARDING RESULT ==="
echo "storeId=${STORE_ID}"
echo "guestUrl=${GUEST_URL}"
echo ""
echo "Next manual actions:"
echo "1) Open owner console and review generated cards."
echo "2) Approve cards (bulk allowed) and run publish."
echo "3) Execute initial-fee checkout (partner_closer) to move REVIEWING -> LIVE."
