#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $1" >&2
  echo "Usage: PROJECT_ID=<id> ORG=<org> REPO=<repo> HOST=<host> [OPEN=1] sh ops/open-stripe-setup-links.sh" >&2
  exit 1
}

PROJECT_ID="${PROJECT_ID:-}"
ORG="${ORG:-}"
REPO="${REPO:-}"
HOST="${HOST:-}"
OPEN="${OPEN:-0}"

[ -n "${PROJECT_ID}" ] || fail "PROJECT_ID is required."
[ -n "${ORG}" ] || fail "ORG is required."
[ -n "${REPO}" ] || fail "REPO is required."
[ -n "${HOST}" ] || fail "HOST is required."

stripe_keys="https://dashboard.stripe.com/apikeys"
stripe_webhooks="https://dashboard.stripe.com/webhooks"
firebase_hosting="https://console.firebase.google.com/project/${PROJECT_ID}/hosting/sites"
gcp_secrets="https://console.cloud.google.com/security/secret-manager?project=${PROJECT_ID}"
gcp_secret_create="https://console.cloud.google.com/security/secret-manager/create?project=${PROJECT_ID}"
gh_actions_secrets="https://github.com/${ORG}/${REPO}/settings/secrets/actions"
gh_actions_vars="https://github.com/${ORG}/${REPO}/settings/variables/actions"
webhook_url="https://${HOST}/api/billing/webhook"
success_url="https://${HOST}/s/<STORE_ID>?checkout=success"
cancel_url="https://${HOST}/s/<STORE_ID>?checkout=cancel"

echo "[stripe-setup-links]"
echo "1) ${stripe_keys}"
echo "2) ${stripe_webhooks}"
echo "3) ${firebase_hosting}"
echo "4) ${gcp_secrets}"
echo "5) ${gcp_secret_create}"
echo "6) ${gh_actions_secrets}"
echo "7) ${gh_actions_vars}"
echo
echo "[stripe-endpoints]"
echo "Webhook: ${webhook_url}"
echo "Success: ${success_url}"
echo "Cancel : ${cancel_url}"

if [ "${OPEN}" != "1" ]; then
  echo
  echo "Next step: set OPEN=1 to launch all links in browser."
  exit 0
fi

open_cmd=""
if command -v open >/dev/null 2>&1; then
  open_cmd="open"
elif command -v xdg-open >/dev/null 2>&1; then
  open_cmd="xdg-open"
else
  fail "No browser opener found (open/xdg-open)."
fi

"${open_cmd}" "${stripe_keys}" >/dev/null 2>&1 || true
"${open_cmd}" "${stripe_webhooks}" >/dev/null 2>&1 || true
"${open_cmd}" "${firebase_hosting}" >/dev/null 2>&1 || true
"${open_cmd}" "${gcp_secrets}" >/dev/null 2>&1 || true
"${open_cmd}" "${gcp_secret_create}" >/dev/null 2>&1 || true
"${open_cmd}" "${gh_actions_secrets}" >/dev/null 2>&1 || true
"${open_cmd}" "${gh_actions_vars}" >/dev/null 2>&1 || true

echo "Opened setup links."
