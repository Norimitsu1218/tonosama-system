#!/usr/bin/env sh
set -eu

echo "[deploy] preflight"
sh ops/ci-preflight.sh

echo "[deploy] checks"
npm run ci:guest:ssr

echo "[deploy] firebase deploy"
firebase deploy --only hosting:guest,functions

if [ "${BASE_URL:-}" != "" ]; then
  echo "[deploy] post-deploy smoke against ${BASE_URL}"
  sh ops/post-deploy-smoke.sh
else
  echo "[deploy] skip post-deploy smoke (BASE_URL not set)"
fi

if [ "${E2E_BASE_URL:-}" != "" ]; then
  echo "[deploy] production-like e2e against ${E2E_BASE_URL}"
  npm run test:e2e:guest
else
  echo "[deploy] skip production-like e2e (E2E_BASE_URL not set)"
fi

echo "[deploy] tip: canary ship command:"
echo "SITE_ID=<hosting-site-id> CHANNEL=preview BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/canary-release.sh ship"
