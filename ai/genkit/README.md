# Genkit Layer (Okami)

This folder provides a stable integration boundary for future Genkit providers.

## Scope
- Keep the runtime API contract identical to Functions `okamiAnswer`.
- Keep MCP access read-only.
- Keep no secret values in this directory.

## Files
- `flows/okami.local.ts`: deterministic fallback flow with strict JSON output.
- `tools/mcp-readonly.ts`: read-only MCP adapter contract and action guard.

## Runtime Contract
`OkamiResult` must always return:
- `kind`: `SECURITY | RULE | PLACE | SOUL`
- `text`: string
- `blocked`: boolean

## Rollout
1. Keep Functions deterministic engine as source of truth.
2. Add Genkit provider behind feature flag.
3. Compare output offline, then canary rollout.
