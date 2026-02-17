#!/usr/bin/env sh
set -eu

PROJECT_ID="${PROJECT_ID:-}"
GH_ORG="${GH_ORG:-}"
GH_REPO="${GH_REPO:-tonosama-system}"
POOL_ID="${POOL_ID:-gh-pool-tonosama}"
PROVIDER_ID="${PROVIDER_ID:-gh-provider-tonosama}"
SA_NAME="${SA_NAME:-gh-deploy-tonosama}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main-v2}"

if [ "$PROJECT_ID" = "" ] || [ "$GH_ORG" = "" ]; then
  echo "Usage: PROJECT_ID=<gcp-project-id> GH_ORG=<github-org> [GH_REPO=tonosama-system] sh ops/oidc-apply.sh" >&2
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
PROVIDER_RES="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

cat <<EOF
# Runbook: OIDC apply (owner one-time)
gcloud config set project "$PROJECT_ID"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com

gcloud iam workload-identity-pools create "$POOL_ID" --location=global --display-name="GitHub Actions pool (tonosama)" || true
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \\
  --location=global \\
  --workload-identity-pool="$POOL_ID" \\
  --display-name="GitHub Actions provider (tonosama)" \\
  --issuer-uri="https://token.actions.githubusercontent.com" \\
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \\
  --attribute-condition="attribute.repository=='${GH_ORG}/${GH_REPO}' && attribute.ref=='refs/heads/${DEPLOY_BRANCH}'" || true

gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub deploy SA (tonosama)" || true
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \\
  --role="roles/iam.workloadIdentityUser" \\
  --member="principalSet://iam.googleapis.com/${PROVIDER_RES}/attribute.repository/${GH_ORG}/${GH_REPO}"

gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" --role="roles/firebasehosting.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" --role="roles/cloudfunctions.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" --role="roles/iam.serviceAccountUser"

# Set these in GitHub repository secrets:
# GCP_WIF_PROVIDER=${PROVIDER_RES}
# GCP_DEPLOY_SA=${SA_EMAIL}
EOF
