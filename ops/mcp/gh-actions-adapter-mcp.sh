#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
shift || true

MCP_GH_ACTIONS_CMD="${MCP_GH_ACTIONS_CMD:-}"
if [[ -z "$MCP_GH_ACTIONS_CMD" ]]; then
  echo "mcp adapter unavailable: set MCP_GH_ACTIONS_CMD to executable bridge" >&2
  exit 127
fi
if [[ ! -x "$MCP_GH_ACTIONS_CMD" ]]; then
  echo "mcp adapter unavailable: not executable: $MCP_GH_ACTIONS_CMD" >&2
  exit 127
fi

exec "$MCP_GH_ACTIONS_CMD" "$cmd" "$@"
