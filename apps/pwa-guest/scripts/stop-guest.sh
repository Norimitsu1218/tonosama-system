#!/usr/bin/env sh
set -eu

PORT="${1:-3010}"
PIDS="$(lsof -ti "tcp:${PORT}" 2>/dev/null || true)"

if [ -z "${PIDS}" ]; then
  echo "No guest process is listening on port ${PORT}."
  exit 0
fi

echo "${PIDS}" | xargs kill
echo "Stopped guest process on port ${PORT}."
