#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "" ]; then
  echo "Usage: sh ops/init-owner.sh <GCP_PROJECT_ID>"
  exit 1
fi

PROJECT_ID="$1"

echo "Enabling required APIs for project: ${PROJECT_ID}"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudfunctions.googleapis.com \
  firebasehosting.googleapis.com \
  --project "${PROJECT_ID}"

echo "Verifying enabled APIs"
gcloud services list --enabled --project "${PROJECT_ID}" \
  | rg "artifactregistry.googleapis.com|cloudbuild.googleapis.com|cloudfunctions.googleapis.com|firebasehosting.googleapis.com"

echo "Checking Firebase target placeholders"
if rg -n "REPLACE_WITH_" .firebaserc >/dev/null 2>&1; then
  echo "ERROR: .firebaserc still has placeholder values. Replace them before deploy."
  exit 1
fi

echo "Owner initialization completed."
