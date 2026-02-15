#!/usr/bin/env sh
set -eu

ACTION="${1:-}"
CHANNEL="${CHANNEL:-preview}"
SITE_ID="${SITE_ID:-}"
BASE_URL="${BASE_URL:-}"
STORE_ID="${STORE_ID:-}"

if [ "${ACTION}" = "" ]; then
  echo "Usage: sh ops/canary-release.sh <ship|verify|abort>" >&2
  echo "  ship   : deploy preview -> optional health -> promote live" >&2
  echo "  verify : health check only (requires BASE_URL/STORE_ID)" >&2
  echo "  abort  : delete preview channel" >&2
  exit 1
fi

run_health() {
  if [ "${BASE_URL}" = "" ] || [ "${STORE_ID}" = "" ]; then
    echo "SKIP: BASE_URL or STORE_ID is not set, health check skipped." >&2
    return 0
  fi
  BASE_URL="${BASE_URL}" STORE_ID="${STORE_ID}" sh ops/health.sh
}

case "${ACTION}" in
  ship)
    if [ "${SITE_ID}" = "" ]; then
      echo "ERROR: SITE_ID is required for ship." >&2
      exit 1
    fi
    CHANNEL="${CHANNEL}" sh ops/canary.sh deploy
    run_health
    SITE_ID="${SITE_ID}" CHANNEL="${CHANNEL}" sh ops/canary.sh promote
    ;;
  verify)
    run_health
    ;;
  abort)
    CHANNEL="${CHANNEL}" sh ops/canary.sh abort
    ;;
  *)
    echo "ERROR: unknown action '${ACTION}'" >&2
    exit 1
    ;;
esac
