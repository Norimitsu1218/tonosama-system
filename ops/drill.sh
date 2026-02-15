#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-}"

echo "[drill] step 1: audit baseline"
sh ops/check-audit.sh

echo "[drill] step 2: ci preflight"
sh ops/ci-preflight.sh

if [ "${BASE_URL}" = "" ] || [ "${STORE_ID}" = "" ]; then
  echo "ERROR: BASE_URL and STORE_ID are required for runtime drill." >&2
  echo "Next step: BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/drill.sh" >&2
  exit 1
fi

echo "[drill] step 3: runtime health"
BASE_URL="${BASE_URL}" STORE_ID="${STORE_ID}" sh ops/health.sh

if [ -d approved ]; then
  echo "[drill] step 4: approval hash verify"
  STORE_ID="${STORE_ID}" sh ops/verify-approval-hash.sh
else
  echo "[drill] step 4: skip approval hash verify (approved/ not found)"
fi

echo "[drill] PASS"
