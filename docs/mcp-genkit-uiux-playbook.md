# MCP + Genkit + UI/UX Playbook

## Goal
Ship and operate TONOSAMA OS with:
- deterministic safety boundaries
- read-only external integrations for runtime
- approval-gated write operations

## 1) MCP Design (read-only first)

### 1.1 Runtime MCP policy
- Runtime Guest uses Functions APIs only.
- MCP adapters are read-only in runtime paths:
  - store metadata read
  - menu/drink read
  - map/place read
- Any write action remains owner-only and approval-gated.

### 1.2 Owner MCP policy
- Owner write paths are already confined to Functions endpoints:
  - approvals, item action, business rules, crystallize, etc.
- Additions must keep:
  - replay guard (`X-REQ-TS`, `X-REQ-NONCE`)
  - rate limit
  - approval log append

### 1.3 MCP implementation checklist
- Define adapter contract by function:
  - `readStoreProfile(storeId)`
  - `readStoreBundle(storeId)`
  - `readOwnerTelemetry(storeId, range)`
- Reject unknown actions by default.
- Never pass secrets to UI/client.

## 2) Genkit Design (JSON classifier first)

### 2.1 Current contract (already enforced)
- Okami output schema:
  - `class`: `SECURITY | RULE | PLACE | SOUL`
  - `answer`: string
  - `blocked`: boolean
- Runtime behavior:
  - `SECURITY` => block path to SUMIMASEN guidance
  - API failure => local fallback classifier

### 2.2 Genkit wiring strategy
- Keep same JSON contract and swap implementation behind Functions:
  - `okamiAnswer` remains API surface
  - Genkit provider can be switched internally
- Guardrails:
  - no sensitive inference
  - no external fetch from arbitrary URL
  - no direct writes from model path

### 2.3 Genkit rollout phases
1. Local deterministic classifier (current)
2. Genkit provider behind feature flag
3. Offline evaluation on saved prompts
4. Gradual release with canary + rollback

## 3) UI/UX Implementation Strategy

### 3.1 Runtime UX pillars
- Gate fail-closed always visible
- Explicit consent before Discovery
- Mood-first entry and low-friction ordering
- Safety notice always present
- Fallback menu when data path fails

### 3.2 Owner UX pillars
- One-screen operational controls
- Clear API result states (403/429/unavailable)
- Funnel visibility (today/yesterday/7d/30d + delta)
- Approval and audit actions near each write operation

### 3.3 UX backlog (non-human)
- improve discovery card readability by locale
- tighter pairing rationale copy per mood
- souvenir visual theme presets
- stronger empty/loading/error states for owner panels

## 4) Execution Order (practical)
1. Keep runtime/owner schemas stable.
2. Add MCP adapters behind Functions only.
3. Replace Okami internals with Genkit (same response schema).
4. Iterate UI/UX with E2E regression lock.

## 5) Done Criteria
- Guest flow remains green:
  - build/typecheck/e2e/functions tests
- no new direct Firestore client reads
- no secret exposure in logs/diffs
- approval/audit chain remains verifiable
