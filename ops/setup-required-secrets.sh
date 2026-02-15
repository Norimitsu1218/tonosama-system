#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  PROJECT_ID=<gcp-project-id> sh ops/setup-required-secrets.sh

Flow:
  1) Script prompts required secret names one by one.
  2) Copy each value to clipboard.
  3) Press Enter to apply current secret (or q to abort).

Notes:
  - Secret values are never printed.
  - Target is Firebase Functions secrets.
USAGE
}

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

PROJECT_ID="${PROJECT_ID:-}"
[ -n "$PROJECT_ID" ] || {
  usage
  fail "PROJECT_ID is required."
}

command -v firebase >/dev/null 2>&1 || fail "firebase CLI is required."

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

set_secret() {
  secret_name="$1"
  value="$(read_clipboard 2>/dev/null || true)"
  [ -n "$value" ] || fail "Clipboard is empty for ${secret_name}."
  printf "%s" "$value" | firebase functions:secrets:set "$secret_name" --project "$PROJECT_ID" --data-file=- >/dev/null
  echo "[ok] ${secret_name}"
}

SECRETS="
GATE_TOKEN_SECRET
OWNER_API_TOKEN
TELEMETRY_SALT_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
BILLING_SUCCESS_URL
BILLING_CANCEL_URL
"

echo "[start] project=${PROJECT_ID}"
for secret_name in $SECRETS; do
  echo ""
  echo "Set ${secret_name}"
  echo "Copy value to clipboard, then press Enter. (q + Enter to abort)"
  printf "> "
  read -r input
  if [ "$input" = "q" ]; then
    fail "Canceled."
  fi
  set_secret "$secret_name"
done

echo ""
echo "[verify] Stripe secret existence check"
PROJECT_ID="$PROJECT_ID" sh ops/stripe-secrets-check.sh
echo "[done] All required secrets were applied."
