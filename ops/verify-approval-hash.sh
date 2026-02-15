#!/usr/bin/env sh
set -eu

STORE_ID="${STORE_ID:-}"

if [ "$STORE_ID" = "" ]; then
  echo "ERROR: STORE_ID is required. Example: STORE_ID=test123 sh ops/verify-approval-hash.sh" >&2
  exit 1
fi

echo "[audit] verifying approval hash chain for storeId=${STORE_ID}"
npm run verify:hash --workspace @tonosama/functions -- --storeId="${STORE_ID}"
