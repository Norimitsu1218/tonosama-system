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

## Gemini Model Policy
- SECURITY-sensitive prompts use `gemini-2.5-pro`.
- RULE/PLACE/SOUL default to `gemini-2.5-flash`.
- No `1.5` model is used.

## Integrated Stack
- Genkit runtime in Functions (`okamiAnswer`).
- MCP adapter contract is read-only (`tools/mcp-readonly.ts`).
- Gems prompt pack is source-controlled (`ai/gems/okami-gems.json`).
- Firebase Functions host runtime APIs.
- GitHub Actions validates guest typecheck + functions tests.
- Next.js guest can pass `aiMode=speed|robustness|scalability`.

## Rollout
1. Keep Functions deterministic engine as source of truth.
2. Add Genkit provider behind feature flag.
3. Compare output offline, then canary rollout.
