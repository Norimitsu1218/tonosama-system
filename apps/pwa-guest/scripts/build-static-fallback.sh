#!/usr/bin/env sh
set -eu

OUT_DIR="${1:-out-static}"

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

if [ -d "public" ]; then
  cp -R public/. "${OUT_DIR}/"
fi

cat > "${OUT_DIR}/index.html" <<'EOF'
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TONOSAMA Guest Static Fallback</title>
</head>
<body>
  <main style="font-family: sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px;">
    <h1>Guest Static Fallback</h1>
    <p>SSR delivery is temporarily disabled. This static fallback is for emergency rollback only.</p>
  </main>
</body>
</html>
EOF

echo "Built static fallback in ${OUT_DIR}"
