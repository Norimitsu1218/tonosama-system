#!/usr/bin/env bash
set -euo pipefail

# ===== 固定出口 =====
REPO_FIX="Norimitsu1218/tonosama-system"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BRANCH="sprint/p0-menu-upload-owner-work-$(date +%Y%m%d-%H%M)"
CF_PROJECT_NAME="${CF_PROJECT_NAME:-tonosama-system}"

# ===== 0) token check =====
: "${GH_TOKEN:?set GH_TOKEN (fine-grained PAT)}"
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
export GH_TOKEN CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

echo "=== 0) tools check ==="
command -v gh >/dev/null || { echo "[NG] gh CLI not found"; exit 1; }
command -v git >/dev/null || { echo "[NG] git not found"; exit 1; }
npx --yes wrangler --version >/dev/null || { echo "[NG] wrangler not available"; exit 1; }

gh auth status -h github.com >/dev/null
echo "[OK] gh authenticated"

cd "$ROOT"

# ===== 1) ensure remote points to fixed repo =====
echo
echo "=== 1) ensure origin ==="
if git remote get-url origin >/dev/null 2>&1; then
  CUR=$(git remote get-url origin)
  if [[ "$CUR" != *"${REPO_FIX}"* ]]; then
    echo "[patch] origin -> ${REPO_FIX}"
    git remote set-url origin "https://github.com/${REPO_FIX}.git"
  fi
else
  git remote add origin "https://github.com/${REPO_FIX}.git"
fi
git fetch origin

# ===== 2) sync main =====
echo
echo "=== 2) sync main ==="
git switch main || git switch master
git pull --ff-only || true

# ===== 3) generate issue bodies =====
echo
echo "=== 3) generate issue bodies ==="

cat > /tmp/issue-menu-upload.md <<'MD'
# [Page Spec] メニューアップロード（店主）
（本文は前回の完成版をそのまま貼ってOK。ここは短縮表示）
MD

cat > /tmp/issue-owner-work.md <<'MD'
# [Page Spec] 店主用実務ページ
（本文は前回の完成版をそのまま貼ってOK。ここは短縮表示）
MD

# ===== 4) create issues =====
echo
echo "=== 4) create issues ==="
ISSUE1_URL=$(gh issue create -R "$REPO_FIX" \
  -t "[Page] メニューアップロード（店主）" \
  -F /tmp/issue-menu-upload.md \
  -l "page,spec,P0,lane-abc" | tail -n 1)

ISSUE2_URL=$(gh issue create -R "$REPO_FIX" \
  -t "[Page] 店主用実務ページ" \
  -F /tmp/issue-owner-work.md \
  -l "page,spec,P0,lane-abc" | tail -n 1)

echo "[OK] issues:"
echo "  $ISSUE1_URL"
echo "  $ISSUE2_URL"

# ===== 5) branch + mock placeholders =====
echo
echo "=== 5) branch & mock ==="
git switch -c "$BRANCH"

mkdir -p public/assets/js

cat > public/menu-upload.html <<'HTML'
<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>メニューアップロード - TONOSAMA</title>
<script defer src="/assets/js/ui-common.js"></script>
<script defer src="/assets/js/menu-upload.js"></script>
</head><body><main id="app">
<h1>メニューアップロード（モック）</h1>
<section id="upload-card"></section>
<section id="progress-card"></section>
<section id="candidates-card"></section>
<section id="next-card"></section>
</main></body></html>
HTML

cat > public/assets/js/menu-upload.js <<'JS'
(() => { const mockMode = true; console.log("[menu-upload] mockMode=", mockMode); })();
JS

cat > public/owner-work.html <<'HTML'
<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>店主用実務 - TONOSAMA</title>
<script defer src="/assets/js/ui-common.js"></script>
<script defer src="/assets/js/owner-work.js"></script>
</head><body><main id="app">
<h1>店主用実務ページ（モック）</h1>
<section id="list-card"></section>
<section id="detail-card"></section>
<section id="image-card"></section>
<section id="approve-card"></section>
</main></body></html>
HTML

cat > public/assets/js/owner-work.js <<'JS'
(() => { const mockMode = true; console.log("[owner-work] mockMode=", mockMode); })();
JS

git add public/menu-upload.html public/owner-work.html public/assets/js/menu-upload.js public/assets/js/owner-work.js
git commit -m "feat(mock): add P0 menu-upload & owner-work skeleton" || true

# ===== 6) push =====
echo
echo "=== 6) push branch ==="
git push -u origin "$BRANCH"

# ===== 7) pages deploy =====
echo
echo "=== 7) pages deploy ==="
npx --yes wrangler pages deploy public --project-name "$CF_PROJECT_NAME"

echo
echo "=== TUNNEL OPENED ==="
echo "Repo : https://github.com/${REPO_FIX}"
echo "Branch: $BRANCH"
echo "Issues:"
echo "  $ISSUE1_URL"
echo "  $ISSUE2_URL"
