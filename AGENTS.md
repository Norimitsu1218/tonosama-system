# AGENTS.md (TONOSAMA OS) — Non-negotiables

## Mission
Implement TONOSAMA OS with strict safety boundaries:
Runtime Guest PWA: Awakening → Mood → Discovery → Tray → Slip
Build-time Owner: approvals only (minimal)
Functions: gate/billing/analytics
Genkit: Okami JSON classifier (SECURITY/RULE/PLACE/SOUL)

## Definition of Done (DoD)
1) /s/{STORE_ID} is blocked unless paymentStatus in {PAID, TRIAL}
2) Clickwrap consent is explicit (no stealth). Without consent, Discovery is blocked.
3) Mood sorting works offline-first (cached menu); no AI required for basic UI
4) Tray → Slip → SUMIMASEN screen works (E2E)
5) Analytics stores aggregates only; never store IP/session/device IDs

## Hard Safety Rules (MUST)
- External tools (MCP etc.) are READ-ONLY only.
- Any write action requires approval gate (approvals collection).
- Stripe must be idempotent (idempotency key); never double charge.
- Never infer sensitive attributes (e.g., gender estimation). Do not implement.

## Implementation Order
1) Firestore schema + rules (fail-closed)
2) functions: gate.ts (paymentStatus), analytics.ts (aggregate only)
3) guest PWA routes/UI
4) genkit okami_answer flow (JSON output), then wire into UI
