# Runtime Exec DAG (Singularity Engine) - Final Tree

This document is the executable final tree for Owner + Guest + AI backend flow.
It replaces narrative-only trees with deployable, testable phases.

## 0. Safety Baseline (non-negotiable)
- Guest gate is fail-closed: `paymentStatus in {PAID, TRIAL}` only.
- Explicit clickwrap is required before Discovery.
- Runtime data path is Functions-only (`/api/gate`, `/api/storeBundle`, `/api/okami/answer`).
- Analytics is aggregate-only. Do not store IP/session/device IDs.
- Sensitive inference is prohibited (example: gender estimation).

---

## A. Owner Side (Pre-runtime)

### A-2 Sales & Contract (B2B)
- Diagnose opportunity loss, show expected lift, and compare operation cost.
- Demonstrate AI value over generic translation tools.
- Select business model:
  - Cashback model (guest-pay + cashback)
  - Hospitality model (store-pay)
- Run initial payment and digital contract acceptance.
- On success: activate account and issue `STORE_ID`.

### A-1 Foundation
- Accept only first-party sources (official site, map, SNS). Block scraping domains.
- Enforce `paymentStatus` guard during owner operation.
- Scan shop card to extract store identity fields.
- Build fixed RULE answers (cashless, wifi, otoshi, etc.).

### A0 Source Collection
- Scan menu assets.
- Conduct owner interview (soul capture):
  - philosophy
  - hungry/fast/volume context
  - adventure items
  - pairing intent

### A1 Perception
- Native multimodal extraction to structured JSON.
- Mood attributes:
  - speed index
  - volume index
- Drink flavor tags and pairing candidates.
- SECURITY flags for allergy/risk cues.

### A2 Hallucination / Reconstruction
- Generate catch copy and store story from verified source.
- Build food-drink pairing matrix.
- Pick LP hero asset for awakening screen.
- Prepare multilingual source cache for JIT rendering.

### A3 Clean Room
- Owner approval gate for generated copy/pairing outputs.
- Liability checkbox confirmation for legal responsibility.
- Audit log append for final agreement timestamp and approver.

### A4 Crystallization
- Write finalized assets to `MENU_MASTER` layer:
  - menu master
  - soul vectors
  - pairing matrix
  - cost log
- Mark runtime-ready.

---

## B. Guest Runtime (In-store)

### B0 Start Trigger
- Guest sits and visually finds permanent QR code.
- No heavy explanation on table surface: only universal entry cue.

### B1 Injection (Scan / Launch)
- QR -> `/s/{STORE_ID}`.
- Resolve gate status.
- JIT locale rendering from browser language and cache.

### B1.5 Awakening (LP + Consent)
- Native-language hook sequence:
  - empathy
  - agitation (FOMO)
  - solution
  - decision
- Decision branches:
  - A: unlock (clickwrap accepted) -> Mood
  - B: basic list mode (reduced experience)

### B2 Venom Activation (Defense)
- Load runtime context:
  - master menu
  - pairing matrix
  - store rules
- Load security filters and blocked patterns.
- Load Elegant Okami behavior profile.

### B3 Mood & Gateway
- Mood selector:
  - Hungry: speed/volume first
  - Relax: course flow + pairing
  - Adventure: chef soul and rare picks
- Trigger billing flip/check path asynchronously.

### B4 Discovery
- Render dynamic menu sorted by mood/strategy.
- Pairing hints active for Relax/Adventure.
- Elegant Okami classify behavior:
  - SECURITY -> block and route to SUMIMASEN guidance
  - RULE -> direct answer
  - PLACE -> map guidance
  - SOUL -> story answer

### B5 Ordering
- Tap item -> wooden tray interaction and feedback.
- Tray -> Slip conversion.
- SUMIMASEN large trigger for analog handoff to staff.

### B6 Asset & Analytics
- Generate Digital Souvenir (save/share only).
- Record white data as aggregate-only telemetry:
  - locale bucket
  - event counters
  - dwell/scroll/order intent buckets
- Never collect/store personal identifiers or sensitive inferred traits.

---

## C. AI Backend Runtime

### C1 APIs (Functions)
- `gate`
- `storeBundle`
- `telemetry`
- `okamiAnswer`
- owner APIs (`owner*`)

### C2 Guardrails
- token verify + expiry check
- kill switch evaluation
- rate limiting
- prompt-injection pattern block
- local deterministic fallback on provider/API issues

### C3 Contract
- Okami output JSON fixed schema:
  - `kind: SECURITY | RULE | PLACE | SOUL`
  - `text: string`
  - `blocked: boolean`

---

## D. Operational Acceptance (Done Criteria)
- Guest deploy URL is reachable.
- Owner deploy URL is reachable.
- `build`, `typecheck`, `e2e`, and functions tests pass.
- secrets are injected and validated.
- deploy runbook is one-line reproducible.
