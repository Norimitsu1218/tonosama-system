#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  scripts/apply-secret-on-1.sh SECRET_NAME [--gh-only|--firebase-only] [--firebase-apphosting|--firebase-functions]

Flow:
  1) Copy secret value to clipboard
  2) Press "1" then Enter to apply
  3) Any other input cancels

Examples:
  scripts/apply-secret-on-1.sh STRIPE_WEBHOOK_SECRET
  scripts/apply-secret-on-1.sh STRIPE_SECRET_KEY --firebase-only --firebase-functions
USAGE
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

secret_name="$1"
if [ "${secret_name}" = "--help" ] || [ "${secret_name}" = "-h" ]; then
  usage
  exit 0
fi
shift

echo "[secret-apply] target: ${secret_name}"
echo "[secret-apply] Copy secret to clipboard, then press 1 + Enter."
printf "> "
read -r input

if [ "${input}" != "1" ]; then
  echo "[secret-apply] canceled"
  exit 0
fi

sh scripts/set-secret-from-clipboard.sh "$@" "${secret_name}"
