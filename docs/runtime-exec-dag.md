# Runtime Exec DAG (Singularity Engine)

This document replaces legacy narrative trees with executable layers.

## Layer A: Policy (hard constraints)
- `P1` Gate allowlist: `paymentStatus in {PAID, TRIAL}` only.
- `P2` Explicit clickwrap consent required before Discovery.
- `P3` Guest data path is Functions-only (`/api/gate`, `/api/storeBundle`).
- `P4` Analytics stores aggregates only (no IP/session/device IDs).
- `P5` Sensitive inference is prohibited (e.g., gender estimation).
- `P6` Fail-closed by default (`gate`, `storeBundle`, `killSwitch`).

## Layer B: Capability (functional graph)
- `C1` Gate token issue/verify
  - depends: none
  - status: `⭕️`
- `C2` Consent gate and branch handling
  - depends: C1
  - status: `⭕️`
- `C3` Mood sort offline-first
  - depends: C2
  - status: `⭕️`
- `C4` Discovery + Pairing matrix
  - depends: C3
  - status: `⭕️`
- `C5` Tray -> Slip -> SUMIMASEN
  - depends: C4
  - status: `⭕️`
- `C6` Aggregate telemetry
  - depends: C5
  - status: `⭕️`
- `C7` Owner approvals + audit hash chain
  - depends: none
  - status: `⭕️`
- `C8` Billing runtime path (flip/checkout/webhook/status)
  - depends: C1
  - status: `⭕️`
- `C9` Okami JSON classify path
  - depends: C4
  - status: `⭕️`

## Layer C: Experience (presentation)
- `E1` Awakening hook copy + locale rendering
  - depends: C2
  - status: `⭕️`
- `E2` Tray visual effects
  - depends: C5
  - status: `⭕️`
- `E3` Digital souvenir visual export
  - depends: C5
  - status: `⭕️`
- `E4` LP cinematic assets and advanced persuasion copy
  - depends: E1
  - status: `🔺` (intentionally backlog)

## Human-only gates (`💁‍♂️`)
- OIDC cloud principal/role setup
- Stripe live key + webhook registration
- Legal text final approval
- External model/provider contract and budget approval

## Execution rule
- Implement and verify Policy -> Capability -> Experience in this order.
- A node is `⭕️` only when automated checks pass (`build`, `typecheck`, `e2e`, `functions test`).
