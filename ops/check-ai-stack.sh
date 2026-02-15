#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

check_file() {
  file="$1"
  [ -f "$file" ] || fail "missing: $file"
  echo "[ok] $file"
}

echo "[check] Genkit/MCP/Gems baseline"
check_file "ai/genkit/README.md"
check_file "ai/genkit/flows/okami.local.ts"
check_file "ai/genkit/tools/mcp-readonly.ts"
check_file "ai/gems/okami-gems.json"
echo "[done] AI stack baseline is present."
