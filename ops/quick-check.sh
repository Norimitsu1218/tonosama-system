#!/usr/bin/env bash
set -euo pipefail

REF="${1:-main-v2}"

npm --prefix functions run build
npm run test:functions
gh workflow run ops-autopilot-observe.yml --ref "$REF"

echo "[OK] quick-check done (ref=$REF)"
