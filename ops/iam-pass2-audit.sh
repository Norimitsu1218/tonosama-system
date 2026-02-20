#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-apicius-6bcae}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-ssrapicius6bcae}"
WIF_PRINCIPAL="${WIF_PRINCIPAL:-principal://iam.googleapis.com/projects/771707382900/locations/global/workloadIdentityPools/tonosama-gh-pool/subject/repo:Norimitsu1218/tonosama-system:ref:refs/heads/main-v2}"

OUT="artifacts/ops-guard/$(date +%Y%m%d-%H%M%S)-iam-pass2"
mkdir -p "$OUT"

echo "[INFO] project=$PROJECT_ID region=$REGION service=$SERVICE"
echo "[INFO] out=$OUT"

gcloud projects get-iam-policy "$PROJECT_ID" --format=json > "$OUT/project-iam.json"
gcloud run services get-iam-policy "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format=json > "$OUT/run-service-iam.json"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format=json > "$OUT/run-service.json"

jq -r '.bindings[] | select(.role=="roles/editor" or .role=="roles/owner") | .role + " => " + (.members|join(", "))' \
  "$OUT/project-iam.json" > "$OUT/editor-owner.txt"

jq -r --arg p "$WIF_PRINCIPAL" '
  .bindings[] | select((.members // []) | index($p)) | .role
' "$OUT/project-iam.json" | sort -u > "$OUT/wif-principal-roles.txt"

jq -r '
  .bindings[] as $b
  | ($b.members // [])[]
  | select($b.role=="roles/editor" or $b.role=="roles/owner")
  | [
      $b.role,
      .,
      (
        if .=="serviceAccount:771707382900-compute@developer.gserviceaccount.com" and $b.role=="roles/editor" then "REMOVE_CANDIDATE"
        elif .=="serviceAccount:771707382900@cloudservices.gserviceaccount.com" then "HOLD_PLATFORM_MANAGED"
        elif .=="serviceAccount:apicius-6bcae@appspot.gserviceaccount.com" then "HOLD_PLATFORM_MANAGED"
        elif startswith("user:") and $b.role=="roles/owner" then "HOLD_HUMAN_OWNER_POLICY"
        else "REVIEW"
        end
      )
    ] | @tsv
' "$OUT/project-iam.json" | sort > "$OUT/editor-owner-classified.tsv"

jq -r '.bindings[] | select(.role=="roles/secretmanager.secretAccessor") | .members[]' \
  "$OUT/project-iam.json" | sort -u > "$OUT/project-secret-accessor-members.txt"

{
  echo "# IAM Pass2 Summary"
  echo
  echo "- Project: $PROJECT_ID"
  echo "- Region: $REGION"
  echo "- Service: $SERVICE"
  echo "- Runtime SA: $(jq -r '.spec.template.spec.serviceAccountName // empty' "$OUT/run-service.json")"
  echo
  echo "## WIF Principal Roles"
  if [ -s "$OUT/wif-principal-roles.txt" ]; then
    sed 's/^/- /' "$OUT/wif-principal-roles.txt"
  else
    echo "- (none)"
  fi
  echo
  echo "## Editor/Owner Classification"
  echo "- Format: role<TAB>member<TAB>bucket"
  sed 's/^/- /' "$OUT/editor-owner-classified.tsv"
  echo
  echo "## Next CLI"
  echo "1. cat $OUT/editor-owner-classified.tsv"
  echo "2. cat $OUT/wif-principal-roles.txt"
  echo "3. jq -r '.bindings[] | select(.role==\"roles/editor\" or .role==\"roles/owner\") | .role + \" => \" + (.members|join(\", \"))' $OUT/project-iam.json"
} > "$OUT/SUMMARY.md"

echo "[OK] wrote $OUT"
