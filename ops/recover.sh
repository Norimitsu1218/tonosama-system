#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-test123}"
ISSUE="${ISSUE:-auto}"
HOSTING_SOURCE="${HOSTING_SOURCE:-}"
SITE_ID="${SITE_ID:-}"
FUNCTIONS_REVERT_COMMIT="${FUNCTIONS_REVERT_COMMIT:-}"

if [ "${BASE_URL}" = "" ]; then
  echo "ERROR: BASE_URL is required. Example: BASE_URL=https://example.web.app ISSUE=gate sh ops/recover.sh" >&2
  exit 1
fi

echo "[recover] Step 1: run incident guidance"
BASE_URL="${BASE_URL}" STORE_ID="${STORE_ID}" sh ops/incident.sh

if [ "${ISSUE}" = "ssr" ] || [ "${ISSUE}" = "auto" ]; then
  if [ "${HOSTING_SOURCE}" != "" ] && [ "${SITE_ID}" != "" ]; then
    echo "[recover] Step 2: hosting rollback"
    HOSTING_SOURCE="${HOSTING_SOURCE}" SITE_ID="${SITE_ID}" sh ops/rollback.sh
  else
    echo "[recover] Step 2: hosting rollback skipped (set HOSTING_SOURCE and SITE_ID to execute)."
    echo "Next step: HOSTING_SOURCE=<channel-or-version> SITE_ID=<hosting-site-id> sh ops/rollback.sh"
  fi
fi

if [ "${FUNCTIONS_REVERT_COMMIT}" != "" ]; then
  echo "[recover] Step 3: functions rollback"
  FUNCTIONS_REVERT_COMMIT="${FUNCTIONS_REVERT_COMMIT}" sh ops/rollback.sh
else
  echo "[recover] Step 3: functions rollback skipped (set FUNCTIONS_REVERT_COMMIT to execute)."
  echo "Next step: FUNCTIONS_REVERT_COMMIT=<bad_commit_sha> sh ops/rollback.sh"
fi

echo "[recover] complete"
echo "[recover] verify command: BASE_URL=${BASE_URL} STORE_ID=${STORE_ID} sh ops/canary-release.sh verify"
