#!/usr/bin/env sh
set -eu

STORE_ID="${STORE_ID:-}"
BASE_URL="${BASE_URL:-https://<your-host>}"

if [ "${STORE_ID}" = "" ]; then
  echo "ERROR: STORE_ID is required. Example: STORE_ID=test123 sh ops/new-store.sh" >&2
  exit 1
fi

if ! printf "%s" "${STORE_ID}" | rg -q "^[a-zA-Z0-9_-]{3,64}$"; then
  echo "ERROR: STORE_ID must match ^[a-zA-Z0-9_-]{3,64}$" >&2
  exit 1
fi

cat <<EOF
=== New Store Checklist (manual, no write automation) ===

[1/3] Firestore document: stores/${STORE_ID}
Required minimal fields:
{
  "paymentStatus": "TRIAL",
  "name": "<store name>",
  "currency": "JPY"
}

[2/3] Firestore document: menu_items/${STORE_ID}
At least 3 items:
{
  "items": [
    { "id": "item1", "name": "<name1>", "price": 1000, "tags": ["HUNGRY"] },
    { "id": "item2", "name": "<name2>", "price": 900, "tags": ["RELAX"] },
    { "id": "item3", "name": "<name3>", "price": 1100, "tags": ["ADVENTURE"] }
  ]
}

Optional Firestore document: drinks/${STORE_ID}
{
  "items": [
    { "id": "drink1", "name": "<drink name>", "price": 700, "tags": ["RELAX"] }
  ]
}

[3/3] Firestore document: control/killSwitch
Ensure:
- global = false
- stores.${STORE_ID} = false

=== Smoke Commands ===

# Gate check (expect 200 for PAID/TRIAL, else 403)
curl -i "${BASE_URL}/api/gate?storeId=${STORE_ID}"

# Store bundle without token (expect 401 or 403)
curl -i "${BASE_URL}/api/storeBundle?storeId=${STORE_ID}"

# Owner telemetry check (requires owner headers)
curl -i -X GET "${BASE_URL}/api/owner/telemetry?storeId=${STORE_ID}&range=today" \\
  -H "X-OWNER-TOKEN: <owner-token>" \\
  -H "X-REQ-TS: \$(date +%s%3N)" \\
  -H "X-REQ-NONCE: nonce-\$(date +%s)-\$RANDOM"

Next step:
BASE_URL=${BASE_URL} STORE_ID=${STORE_ID} sh ops/health.sh
EOF
