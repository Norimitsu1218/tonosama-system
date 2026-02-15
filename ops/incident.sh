#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-test123}"
HEALTH_PATH="${HEALTH_PATH:-/api/gate?storeId=${STORE_ID}}"
ROLLBACK_HOSTING_SOURCE="${ROLLBACK_HOSTING_SOURCE:-}"
ROLLBACK_SITE_ID="${ROLLBACK_SITE_ID:-}"
ROLLBACK_FUNCTIONS_COMMIT="${ROLLBACK_FUNCTIONS_COMMIT:-}"

if [ "${BASE_URL}" = "" ]; then
  echo "ERROR: BASE_URL is required. Example: BASE_URL=https://example.web.app sh ops/incident.sh" >&2
  exit 1
fi

echo "[incident] Step 1/4: kill switch ON (manual)"
echo "Manual action required: set control/killSwitch.global=true in Firestore."
echo "Manual action required (optional): set control/killSwitch.stores.${STORE_ID}=true."

echo "[incident] Step 2/4: health check"
set +e
HTTP_CODE="$(curl -s -o /tmp/incident_gate_body.txt -w "%{http_code}" "${BASE_URL}${HEALTH_PATH}")"
set -e
echo "gate status code=${HTTP_CODE}"

if [ "${HTTP_CODE}" != "403" ] && [ "${HTTP_CODE}" != "429" ]; then
  echo "[incident] Step 3/4: rollback"
  HOSTING_SOURCE="${ROLLBACK_HOSTING_SOURCE}" SITE_ID="${ROLLBACK_SITE_ID}" FUNCTIONS_REVERT_COMMIT="${ROLLBACK_FUNCTIONS_COMMIT}" sh ops/rollback.sh
else
  echo "[incident] Skip rollback: system already fail-closed (${HTTP_CODE})."
fi

echo "[incident] Step 4/4: kill switch OFF (manual recovery)"
echo "Manual action required: set control/killSwitch.global=false after recovery validation."
echo "Postmortem template: incident time / trigger / blast radius / rollback command / fix commit / recurrence guard."
