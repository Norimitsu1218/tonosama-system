#!/usr/bin/env sh
set -eu

HOSTING_SOURCE="${HOSTING_SOURCE:-}"
FUNCTIONS_REVERT_COMMIT="${FUNCTIONS_REVERT_COMMIT:-}"
SITE_ID="${SITE_ID:-}"

usage() {
  cat <<'EOF'
Usage:
  HOSTING_SOURCE=<channel-or-version> SITE_ID=<hosting-site-id> sh ops/rollback.sh
  FUNCTIONS_REVERT_COMMIT=<bad_commit_sha> sh ops/rollback.sh
  HOSTING_SOURCE=<...> SITE_ID=<...> FUNCTIONS_REVERT_COMMIT=<...> sh ops/rollback.sh
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "${HOSTING_SOURCE}" != "" ]; then
  if [ "${SITE_ID}" = "" ]; then
    echo "ERROR: SITE_ID is required when HOSTING_SOURCE is set." >&2
    exit 1
  fi
  echo "[rollback] hosting source=${SITE_ID}:${HOSTING_SOURCE} -> ${SITE_ID}:live"
  firebase hosting:clone "${SITE_ID}:${HOSTING_SOURCE}" "${SITE_ID}:live"
else
  echo "[rollback] skip hosting rollback (HOSTING_SOURCE not set)"
fi

if [ "${FUNCTIONS_REVERT_COMMIT}" != "" ]; then
  echo "[rollback] functions revert commit=${FUNCTIONS_REVERT_COMMIT}"
  git revert --no-edit "${FUNCTIONS_REVERT_COMMIT}"
  firebase deploy --only functions
else
  echo "[rollback] skip functions rollback (FUNCTIONS_REVERT_COMMIT not set)"
fi
