#!/usr/bin/env sh
set -eu

ACTION="${1:-}"
CHANNEL="${CHANNEL:-preview}"
SITE_ID="${SITE_ID:-}"

if [ "${ACTION}" = "" ]; then
  echo "Usage: sh ops/canary.sh <deploy|promote|abort>" >&2
  exit 1
fi

case "${ACTION}" in
  deploy)
    sh ops/ci-preflight.sh
    npm run ci:guest:ssr
    firebase hosting:channel:deploy "${CHANNEL}" --only hosting:guest
    ;;
  promote)
    if [ "${SITE_ID}" = "" ]; then
      echo "ERROR: SITE_ID is required for promote." >&2
      exit 1
    fi
    firebase hosting:clone "${SITE_ID}:${CHANNEL}" "${SITE_ID}:live"
    ;;
  abort)
    firebase hosting:channel:delete "${CHANNEL}" --force
    ;;
  *)
    echo "ERROR: unknown action '${ACTION}'" >&2
    exit 1
    ;;
esac
