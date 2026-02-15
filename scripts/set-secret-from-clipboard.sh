#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  scripts/set-secret-from-clipboard.sh [--gh-only|--firebase-only|--both] [--firebase-apphosting|--firebase-functions] SECRET_NAME

Examples:
  scripts/set-secret-from-clipboard.sh STRIPE_WEBHOOK_SECRET
  scripts/set-secret-from-clipboard.sh --gh-only OPS_AUTOMATION_TOKEN
  scripts/set-secret-from-clipboard.sh --firebase-only --firebase-functions STRIPE_SECRET_KEY

Notes:
  - Value is read from clipboard only.
  - Script never prints secret values.
  - Default target is Firebase Functions only (safe default for this repo).
  - App Hosting secret mode is optional and must be explicitly requested.
USAGE
}

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

mode="firebase"
firebase_mode="functions"
secret_name=""

while [ $# -gt 0 ]; do
  case "$1" in
    --gh-only)
      mode="gh"
      ;;
    --firebase-only)
      mode="firebase"
      ;;
    --both)
      mode="both"
      ;;
    --firebase-apphosting)
      firebase_mode="apphosting"
      ;;
    --firebase-functions)
      firebase_mode="functions"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [ -n "${secret_name}" ]; then
        fail "Unexpected extra argument: $1"
      fi
      secret_name="$1"
      ;;
  esac
  shift
done

[ -n "${secret_name}" ] || {
  usage
  exit 1
}

read_clipboard() {
  if command -v pbpaste >/dev/null 2>&1; then
    pbpaste
    return 0
  fi
  if command -v wl-paste >/dev/null 2>&1; then
    wl-paste
    return 0
  fi
  if command -v xclip >/dev/null 2>&1; then
    xclip -selection clipboard -o
    return 0
  fi
  if command -v xsel >/dev/null 2>&1; then
    xsel --clipboard --output
    return 0
  fi
  return 1
}

clipboard_value="$(read_clipboard 2>/dev/null || true)"
[ -n "${clipboard_value}" ] || fail "Clipboard is empty or clipboard command is unavailable."

if [ "${mode}" = "both" ] || [ "${mode}" = "gh" ]; then
  command -v gh >/dev/null 2>&1 || fail "gh CLI is required for GitHub secret set."
  printf "%s" "${clipboard_value}" | gh secret set "${secret_name}" >/dev/null
  echo "[ok] GitHub secret updated: ${secret_name}"
fi

set_firebase_secret_functions() {
  command -v firebase >/dev/null 2>&1 || fail "firebase CLI is required for Firebase secret set."
  printf "%s" "${clipboard_value}" | firebase functions:secrets:set "${secret_name}" --data-file=- >/dev/null
  echo "[ok] Firebase Functions secret updated: ${secret_name}"
}

set_firebase_secret_apphosting() {
  command -v firebase >/dev/null 2>&1 || fail "firebase CLI is required for Firebase secret set."
  printf "%s" "${clipboard_value}" | firebase apphosting:secrets:set "${secret_name}" --data-file=- >/dev/null
  echo "[ok] Firebase App Hosting secret updated: ${secret_name}"
}

if [ "${mode}" = "both" ] || [ "${mode}" = "firebase" ]; then
  case "${firebase_mode}" in
    functions)
      set_firebase_secret_functions
      ;;
    apphosting)
      set_firebase_secret_apphosting
      ;;
    auto)
      set_firebase_secret_functions
      ;;
    *)
      fail "Unknown firebase mode: ${firebase_mode}"
      ;;
  esac
fi

echo "[done] Secret registration completed for: ${secret_name}"
