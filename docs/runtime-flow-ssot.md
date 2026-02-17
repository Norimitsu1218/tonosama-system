# Runtime Flow SSOT (`⭕️/△/❌`)

This file is the single source of truth for implementation status of the guest runtime and directly related owner/ops surfaces.

## Legend
- `⭕️`: Implemented and verified by tests or runtime checks.
- `△`: Partially implemented (skeleton present, full behavior/SLO not complete).
- `❌`: Not implemented.

## Guest Runtime
- `⭕️` `/s/{storeId}` route with storeId validation.
- `⭕️` Gate enforcement via `/api/gate` (`PAID`/`TRIAL` allowed, fail-closed blocked UI).
- `⭕️` Gate retry path for transient failures (blocked UI -> retry -> recheck gate).
- `⭕️` Explicit clickwrap consent; Discovery is blocked without consent.
- `⭕️` Basic-list branch (`No, just show me the list`) still requires explicit consent before Discovery.
- `⭕️` Mood selector (`Hungry`/`Relax`/`Adventure`) and mood-based sorting.
- `⭕️` Discovery menu rendering from `/api/storeBundle` with fallback menu.
- `⭕️` Discovery retry control for fallback mode (`Retry Store Data`).
- `⭕️` Discovery sort controls (`Mood`, `Price`, `Name`) with local persistence.
- `⭕️` Tray add -> Slip -> SUMIMASEN transition.
- `⭕️` Tray quantity control (`+/-`) before order confirmation.
- `⭕️` Slip metadata includes generated slip number and timestamp.
- `⭕️` Offline-first menu cache (`localStorage` schema versioned).
- `⭕️` Anonymous telemetry events (`gate_allowed`, `consent`, `mood`, `tray_add`, `slip`, `sumimasen`).
- `⭕️` Safety notices shown in runtime and allergy guard on tray add.
- `⭕️` Place/rule/security/soul classifier via `/api/okami/answer` with local fallback shell.
- `⭕️` Okami ask telemetry (`okami_ask`) is aggregated without PII.
- `⭕️` Okami injection-like prompts are blocked to `SECURITY`; api/fallback/blocked/rate-limited counts are aggregated.
- `△` LP hook quality (psychological copy/creative depth) is basic.
- `⭕️` Locale auto-render with browser detect + query/localStorage persistence + localized runtime labels.
- `⭕️` Pairing matrix includes server-side ranking and owner override path (`/api/owner/pairingOverrides`).
- `⭕️` Tray visual effects include wood tray state, particle arc, sound, and call-state animation.
- `⭕️` Digital souvenir supports stamped receipt image export and share action.
- `⭕️` Stripe production payment path is operational (`/api/billing/checkout`, webhook idempotency, secret-bound webhook, signed smoke via `ops/autopilot.sh`).

## Owner / Build-time
- `⭕️` Owner action APIs (`approve`/`reject`/`soldout_toggle`) through Functions only.
- `⭕️` Owner replay guards (`X-REQ-TS`/`X-REQ-NONCE`) and rate limit path.
- `⭕️` Owner telemetry read (`today`/`yesterday`/`7d`/`30d`) with totals and rates.
- `⭕️` Owner billing status read (`today`/`yesterday`/`7d`/`30d`) with totals and average checkout amount.
- `⭕️` Owner billing status includes `checkout_per_gate_rate` (conversion from gate passes).
- `⭕️` Owner billing delta (`7d` vs `30d`) and low average amount warning.
- `⭕️` Owner telemetry deltas (`7d` vs `30d`) and low-rate warning.
- `⭕️` Owner foundation endpoints (`businessRules`, `menuImport`, `soulCapture`, `crystallize`, etc.).
- `⭕️` Owner multimodal ingest endpoints (`menuVisionImport`, `shopCardVisionParse`) are available.
- `⭕️` Owner safe URL checks with blocked domains and liability acceptance flags.
- `⭕️` Owner cost status endpoint (`/api/owner/costStatus`) for aggregate owner operation cost.
- `⭕️` B2B owner journey includes readiness checklist + quick flow (diagnosis/model/contract/activation path).
- `⭕️` Multimodal ingestion path (`menuVisionImport`/`shopCardVisionParse`) is operational in owner flow.

## Security / Ops
- `⭕️` Guest Firestore direct read blocked by rules; Functions path is the runtime data path.
- `⭕️` `storeBundle` requires bearer gate token.
- `⭕️` Kill switch fail-closed behavior in gate/store data path.
- `⭕️` Approval log with hash-chain verification tooling.
- `⭕️` OIDC-based CI deploy path and preflight hardening.
- `⭕️` Deploy -> health check -> hash verify runbook coverage.
- `⭕️` Recover/rollback/drill scripts available.
- `⭕️` Canary strategy has one-command ship/verify/abort helper (`ops/canary-release.sh`).

## Explicit Non-negotiables Mapping
- `⭕️` No stealth consent: explicit clickwrap only.
- `⭕️` No sensitive attribute inference implemented (e.g. gender).
- `⭕️` Analytics are aggregate-oriented; no IP/session/device ID persistence in telemetry storage.
