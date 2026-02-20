#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-apicius-6bcae}"
RUNTIME_SA_EMAIL="${RUNTIME_SA_EMAIL:-sa-ssr-runtime@apicius-6bcae.iam.gserviceaccount.com}"

OUT="artifacts/ops-guard/$(date +%Y%m%d-%H%M%S)-secret-iam-pass2"
mkdir -p "$OUT"

cat > "$OUT/required-secrets.txt" <<'EOF'
GATE_TOKEN_SECRET
OWNER_API_TOKEN
TELEMETRY_SALT_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
BILLING_SUCCESS_URL
BILLING_CANCEL_URL
EOF

sort -u "$OUT/required-secrets.txt" -o "$OUT/required-secrets.txt"

gcloud secrets list --project "$PROJECT_ID" --format='value(name)' | sort -u > "$OUT/project-secrets.txt"

: > "$OUT/runtime-sa-secret-accessor.txt"
while IFS= read -r secret_name; do
  [ -z "$secret_name" ] && continue
  gcloud secrets get-iam-policy "$secret_name" --project "$PROJECT_ID" --format=json > "$OUT/secret-${secret_name}.json"
  jq -r --arg m "serviceAccount:${RUNTIME_SA_EMAIL}" --arg s "$secret_name" '
    .bindings[]? | select(.role=="roles/secretmanager.secretAccessor")
    | select(any(.members[]?; . == $m))
    | $s
  ' "$OUT/secret-${secret_name}.json" >> "$OUT/runtime-sa-secret-accessor.txt" || true
done < "$OUT/project-secrets.txt"

sort -u "$OUT/runtime-sa-secret-accessor.txt" -o "$OUT/runtime-sa-secret-accessor.txt"

comm -23 "$OUT/required-secrets.txt" "$OUT/runtime-sa-secret-accessor.txt" > "$OUT/missing-required-secret-accessor.txt" || true
comm -13 "$OUT/required-secrets.txt" "$OUT/runtime-sa-secret-accessor.txt" > "$OUT/extra-runtime-secret-accessor.txt" || true

status="OK"
if [ -s "$OUT/missing-required-secret-accessor.txt" ] || [ -s "$OUT/extra-runtime-secret-accessor.txt" ]; then
  status="WARN"
fi

{
  echo "# Secret IAM Audit Summary"
  echo
  echo "- Project: $PROJECT_ID"
  echo "- Runtime SA: $RUNTIME_SA_EMAIL"
  echo "- Status: $status"
  echo
  echo "## Missing Required Secret Accessor"
  if [ -s "$OUT/missing-required-secret-accessor.txt" ]; then
    sed 's/^/- /' "$OUT/missing-required-secret-accessor.txt"
  else
    echo "- (none)"
  fi
  echo
  echo "## Extra Runtime Secret Accessor"
  if [ -s "$OUT/extra-runtime-secret-accessor.txt" ]; then
    sed 's/^/- /' "$OUT/extra-runtime-secret-accessor.txt"
  else
    echo "- (none)"
  fi
} > "$OUT/SUMMARY.md"

echo "[OK] wrote $OUT"
