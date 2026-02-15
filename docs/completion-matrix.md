# Completion Matrix

Legend:
- `⭕️` 100% implemented
- `🔺xx%` in progress
- `💁‍♂️` requires human approval or external console action
- `❌` intentionally not implemented (policy/safety mismatch)

## Guest Runtime
- `⭕️` START trigger to `/s/{storeId}` flow boot
- `⭕️` Gate control (`PAID`/`TRIAL` allow, fail-closed block)
- `⭕️` Explicit clickwrap consent gate before Discovery
- `⭕️` Locale auto-selection + localized UI (browser/query/local cache path)
- `⭕️` Awakening hook copy and A/B branch (`unlock` vs `basic list`)
- `⭕️` Mood selector (`Hungry`/`Relax`/`Adventure`)
- `⭕️` Discovery sort + offline-first cached fallback
- `⭕️` Pairing display (server matrix + owner override path)
- `⭕️` Tray -> Slip -> SUMIMASEN flow
- `⭕️` Security block path routes to SUMIMASEN
- `⭕️` Digital Souvenir (image export + share path)

## Analytics / Privacy
- `⭕️` Aggregate-only telemetry events (`gate_allowed/consent/mood/tray_add/slip/sumimasen`)
- `⭕️` No IP/session/device ID storage in analytics documents
- `❌` Sensitive attribute inference (e.g. gender estimation) is not implemented by policy
- `⭕️` Owner dashboard for today/yesterday/7d/30d + totals/delta/warnings

## Owner / Build-time
- `⭕️` Owner auth + replay guard + nonce + rate limit
- `⭕️` Approval log append-only + hash-chain verification tooling
- `⭕️` Owner 3-actions API (approve/reject/soldout) + UI
- `⭕️` Store foundation APIs (rules/menu import/soul capture/crystallize/status)
- `⭕️` Owner pairing override API path + UI integration
- `💁‍♂️` Final legal copy approval (clickwrap/terms text)

## Functions / Security / Ops
- `⭕️` `/api/gate` token issuance (fail-closed)
- `⭕️` `/api/storeBundle` bearer token required
- `⭕️` Kill switch (global/store) with fail-closed behavior
- `⭕️` Firestore guest direct-read denied by rules design
- `⭕️` CI hardening (main-only deploy, OIDC path, preflight guards)
- `⭕️` Deploy/canary/rollback/recover/runbook scripts
- `⭕️` Post-deploy smoke and health scripts
- `💁‍♂️` OIDC cloud-side principal/role setup in GCP console/CLI

## Billing
- `⭕️` Guest checkout endpoint path + webhook idempotency protections
- `⭕️` Billing aggregates + owner billing status read model
- `⭕️` Runtime billing code path (flip/checkout/webhook/status)
- `💁‍♂️` Stripe live keys, webhook endpoint registration, dashboard-side config

## Foundation / AI Pipeline
- `⭕️` Okami JSON classifier path (`SECURITY/RULE/PLACE/SOUL`) + fallback behavior
- `⭕️` Okami engine boundary module for future Genkit provider swap (`functions/src/okamiEngine.ts`)
- `⭕️` Multimodal owner import path (vision payload ingestion + owner UI operation)
- `⭕️` Store soul/story generation pipeline (capture + crystallize in owner flow)
- `💁‍♂️` External model/provider contract and budget approval
