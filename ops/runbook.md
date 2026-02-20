# Ops Runbook

## Preflight

0. First command after clone:
`sh ops/owner-setup.sh`

1. Ensure Functions secret `GATE_TOKEN_SECRET` is configured.
2. Ensure Functions secret `OWNER_API_TOKEN` is configured for owner APIs.
3. Ensure Functions secret `TELEMETRY_SALT_SECRET` is configured for telemetry hashing.
4. Ensure billing secrets are configured for guest checkout:
- `STRIPE_SECRET_KEY`
- `BILLING_SUCCESS_URL`
- `BILLING_CANCEL_URL`
- `STRIPE_WEBHOOK_SECRET`
- `BILLING_SUCCESS_URL` (guest return route)
- `BILLING_CANCEL_URL` (guest return route)
5. Verify Stripe billing secret existence (without printing values):
`PROJECT_ID=<gcp-project-id> sh ops/stripe-secrets-check.sh`
2. Ensure GitHub deploy secrets are set:
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SA`
2. Confirm Firebase Hosting rewrites are deployed:
- `/api/gate`
- `/api/storeBundle`
- `/api/billing/flip`
- `/api/billing/checkout`
- `/api/billing/webhook`
- `/api/approvalLog`
- `/api/owner/itemAction`
- `/api/owner/telemetry`
- `/api/owner/billingStatus`
- `/api/owner/storeStatus`
- `/api/owner/costStatus`
- `/api/owner/businessRules`
- `/api/owner/menuImport`
- `/api/owner/menuVisionImport`
- `/api/owner/pairingOverrides`
- `/api/owner/soulCapture`
- `/api/owner/crystallize`
- `/api/owner/salesDiagnosis`
- `/api/owner/businessModel`
- `/api/owner/contractAccept`
- `/api/owner/activateAccount`
- `/api/owner/shopCardImport`
- `/api/owner/publishTrends`
- `/api/owner/initialFeeCheckout`
- `/api/owner/shopCardParse`
- `/api/owner/shopCardVisionParse`
- `/api/owner/storeQr`
- `/api/telemetry`
- `/api/okami/answer`
3. Ensure owner bootstrap was executed once:
`sh ops/init-owner.sh <GCP_PROJECT_ID>`
3. Run local owner preflight:
`sh ops/preflight-local.sh`
3. Run audit guard:
`sh ops/check-audit.sh`
3. Run runtime health check:
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/health.sh`
3. Run drill suite:
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/drill.sh`
3. Run local checks:
`npm run build`
`npm run typecheck:guest`
`npm run test:e2e:guest`
`npm run test:functions`

## Deploy

1. Set `.firebaserc` project/target values (`default`, `hosting.guest`).
2. Ensure GitHub Actions deploy uses OIDC (no `FIREBASE_TOKEN`).
2. Ensure GitHub repository variables are set:
- `BASE_URL`
- `STORE_ID`
2. Deploy Functions (`gate`, `storeBundle`).
3. Deploy Hosting target `guest` (framework-aware SSR from `apps/pwa-guest`).
3. Smoke test:
- `GET /api/gate?storeId=<validStore>`
- `GET /api/storeBundle?storeId=<validStore>` with valid bearer token
- `POST /api/approvalLog` with `X-OWNER-TOKEN`
- `POST /api/owner/itemAction` with `X-OWNER-TOKEN`
- `GET /api/owner/storeStatus` with `X-OWNER-TOKEN`
- `GET /api/owner/costStatus` with `X-OWNER-TOKEN`
- `GET /api/owner/billingStatus` with `X-OWNER-TOKEN`
  - response includes `checkout_per_gate_rate` based on telemetry gate counters.
- `POST /api/owner/businessRules` with `X-OWNER-TOKEN`
- `POST /api/owner/menuImport` with `X-OWNER-TOKEN`
- `POST /api/owner/menuVisionImport` with `X-OWNER-TOKEN`
- `POST /api/owner/pairingOverrides` with `X-OWNER-TOKEN`
- `POST /api/owner/soulCapture` with `X-OWNER-TOKEN`
- `POST /api/owner/crystallize` with `X-OWNER-TOKEN`
- `POST /api/owner/salesDiagnosis` with `X-OWNER-TOKEN`
- `POST /api/owner/businessModel` with `X-OWNER-TOKEN`
- `POST /api/owner/contractAccept` with `X-OWNER-TOKEN`
- `POST /api/owner/activateAccount` with `X-OWNER-TOKEN`
- `POST /api/owner/shopCardImport` with `X-OWNER-TOKEN`
- `POST /api/owner/publishTrends` with `X-OWNER-TOKEN`
- `POST /api/owner/initialFeeCheckout` with `X-OWNER-TOKEN`
- `POST /api/owner/shopCardParse` with `X-OWNER-TOKEN`
- `POST /api/owner/shopCardVisionParse` with `X-OWNER-TOKEN`
- `GET /api/owner/storeQr` with `X-OWNER-TOKEN`
- `POST /api/telemetry` with gate bearer token (204 expected)
- `POST /api/okami/answer` with gate bearer token
- `POST /api/billing/webhook` from Stripe (signature verified)
- Stripe endpoint wiring:
  - Webhook: `https://<your-host>/api/billing/webhook`
  - Success return: `https://<your-host>/s/<storeId>?checkout=success`
  - Cancel return: `https://<your-host>/s/<storeId>?checkout=cancel`
- success URL should include guest route; runtime app auto-recognizes `checkout=success|cancel` query.
- `POST /api/owner/businessRules` requires liability flags (`liabilityAllergyAccepted`, `liabilityReligionAccepted`) set to true.
- `POST /api/owner/businessRules` blocks aggregator domains (`tabelog.com`, `retty.me`, `hotpepper.jp`, `gurunavi.com`, `yelp.com`).
- `GET /api/owner/costStatus?storeId=<id>` returns aggregate cost log (`totalYen`, `byAction`).
- owner headers must include:
  - `X-REQ-TS` (unix ms)
  - `X-REQ-NONCE` (single use)
- `GET /s/<storeId>` renders SSR page (not static 404).
4. Command:
`sh ops/deploy.sh`
5. Post deploy smoke:
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/post-deploy-smoke.sh`
6. Health check:
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/health.sh`
7. Approval hash verify:
`STORE_ID=<storeId> sh ops/verify-approval-hash.sh`

## Rollback

1. Identify bad commit:
`git log --oneline -n 20`
2. Revert:
`git revert <bad_commit_sha>`
3. Redeploy Functions + Hosting.
4. Re-run smoke tests and E2E.
5. Command examples:
`HOSTING_SOURCE=<channel-or-version> SITE_ID=<hosting-site-id> sh ops/rollback.sh`
`FUNCTIONS_REVERT_COMMIT=<bad_commit_sha> sh ops/rollback.sh`

## SSR Fallback Switch

1. Build static fallback:
`npm run build:guest:static`
2. Switch hosting to static fallback output only for incident mitigation.
3. Restore SSR hosting after fix.

## Canary

1. Preview deploy:
`CHANNEL=preview sh ops/canary.sh deploy`
2. Promote:
`SITE_ID=<hosting-site-id> CHANNEL=preview sh ops/canary.sh promote`
3. Abort:
`CHANNEL=preview sh ops/canary.sh abort`
4. One-command ship (preview -> optional health -> promote):
`SITE_ID=<hosting-site-id> CHANNEL=preview BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/canary-release.sh ship`
5. Verify only:
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/canary-release.sh verify`

## Secret Rotation

1. Set new `GATE_TOKEN_SECRET`.
2. Set new `OWNER_API_TOKEN`.
3. Redeploy Functions.
4. Verify `gate`, `storeBundle`, `approvalLog`, `ownerItemAction`, and `telemetry` responses.
5. Remove old secret after transition window.
5. CI auth secret hygiene:
- keep `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SA` only.
- remove `FIREBASE_TOKEN` once OIDC deploy is confirmed green.

## Owner Commands

- Run owner app locally:
`npm run dev:owner`
- New store checklist (manual Firestore provisioning):
`STORE_ID=<storeId> BASE_URL=https://<your-host> sh ops/new-store.sh`
- Owner endpoint smoke:
`BASE_URL=https://<your-host> STORE_ID=<storeId> OWNER_API_TOKEN=<owner-token> sh ops/smoke-owner.sh`
- Owner API base override (optional):
`NEXT_PUBLIC_OWNER_API_BASE=https://<your-host> npm run dev:owner`
- Verify approval hash chain:
`STORE_ID=<storeId> sh ops/verify-approval-hash.sh`
- OIDC apply helper (owner one-time):
`PROJECT_ID=<gcp-project-id> GH_ORG=<github-org> sh ops/oidc-apply.sh`
- Multimodal payload reference:
`docs/multimodal-payloads.md`

## Incident Triage

- Spike in 403:
  - check `GATE_TOKEN_SECRET` presence
  - check token expiry and rewrite config
- Spike in 5xx:
  - check Functions health/logs
  - Guest must remain fail-closed (blocked UI, no white screen)
- Incident command:
`BASE_URL=https://<your-host> sh ops/incident.sh`
`BASE_URL=https://<your-host> ROLLBACK_HOSTING_SOURCE=<channel-or-version> ROLLBACK_SITE_ID=<hosting-site-id> sh ops/incident.sh`
- One-command recovery helper:
`BASE_URL=https://<your-host> ISSUE=gate|ssr|auto sh ops/recover.sh`

## Decision Tree

- Gate broken (`/api/gate` returns not in 200/403/429):
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/incident.sh`
- SSR broken (`/s/<storeId>` returns non-200):
`HOSTING_SOURCE=<channel-or-version> SITE_ID=<hosting-site-id> sh ops/rollback.sh`

## Monitoring Points

- `/api/gate` success/error rates and 429 trend.
- `/api/storeBundle` 401/403 trend (token validation issues).
- `/api/telemetry` 401/403/429 trend and daily aggregate freshness.
- `/api/okami/answer` unauthorized probe should return 401/403/429.
- monitor telemetry counters for `okami_ask`, `okami_api`, `okami_blocked`, `okami_fallback`, `okami_rate_limited`.
- `/s/<storeId>` SSR availability (404/5xx).
- Deployed environment E2E:
`E2E_BASE_URL=https://<your-host>/ npm run test:e2e:guest`
- Guardrail failures:
  - preflight is expected to fail on policy drift (permissions, rewrites, deny-all rules, missing tests).

## S-22 Observe Policy

- Workflow: `.github/workflows/ops-autopilot-observe.yml`.
- Scope is read-only: runtime/IAM/TTL/workflow/smoke evidence collection only.
- Any `FAIL` must end the workflow with non-zero exit (fail-closed).
- Artifact upload is mandatory for every run.
- WARN is allowed when:
  - `roles/editor` or `roles/owner` bindings still exist.
  - project-level `secretAccessor` bindings still exist.
  - one of required TTL entries (`nonces`, `partner_nonces`, `owner_rate_limit`) is missing.
- Summary must include explicit fail reasons and warn reasons.
- IAM pass2 baseline command:
`PROJECT_ID=apicius-6bcae REGION=asia-northeast1 SERVICE=ssrapicius6bcae sh ops/iam-pass2-audit.sh`

## S-24 Compressed Mode

- Task handling format is fixed to one line:
`<TASK_ID>: CLOSE|KEEP|BLOCK | commit=<sha> | run=<id> | next=<TASK_ID>`
- Use one task per cycle (single concern, single commit).
- Use fixed verification bundle:
`sh ops/quick-check.sh main-v2`
- Use one-command orchestration for observe loop:
`sh ops/autopilot-loop.sh main-v2`
- Ask for confirmation only when operation is destructive:
  - deletion with production impact
  - human user permission revocation
  - billing/public exposure change
  - rollback-impossible change

## S-25 Zero-Copy Loop

- Human role is policy and approval boundary only.
- Standard loop command:
`sh ops/autopilot-loop.sh main-v2`
- Adapter is swappable for MCP bridge:
`ACTIONS_ADAPTER=ops/mcp/gh-actions-adapter.sh sh ops/autopilot-loop.sh main-v2`
- Backend selection:
`GH_ACTIONS_BACKEND=gh|mcp`
- MCP backend contract:
`MCP_GH_ACTIONS_CMD=<executable_bridge> GH_ACTIONS_BACKEND=mcp sh ops/autopilot-loop.sh main-v2`
- Output contract:
`CLOSE|KEEP|BLOCK | run=<id> | metrics=<path> | next=<TASK_ID>`
- `BLOCK` requires immediate triage using evidence in:
`artifacts/ops-observe/<RUN_ID>/`
- On `BLOCK`, a draft notification is auto-generated:
`artifacts/ops-observe/block/block-<workflow|branch|reason>.md`
- Duplicate block drafts are suppressed within:
`BLOCK_DEDUPE_WINDOW_SEC` (default `900`)
- Issue/PR draft dedupe key is fixed:
`category|owner|action_class|target`
- Draft regeneration exception rules:
  - `effective_priority` upgraded
  - `due_over` changed to `true`
  - status transition `WARN -> FAIL`

## S-21 Runtime Track

- Guest SSR runtime hardening is a separate track from S-22.
- Production baseline remains Node20 until guest SSR deploy path is stable on Node22.
- Node22 retries must include:
  - build log evidence,
  - rollback command,
  - post-deploy smoke and verify-hash checks.

## S-24 Owner Reduction Gate

- Execution preconditions and role responsibilities are fixed in:
`docs/owner-role-downsizing-plan.md` (section: `Execution Preconditions (S-24-01)`).

## Telemetry Query

- Read daily counters for a store:
`STORE_ID=<storeId> DAY=<yyyymmdd> node --input-type=module -e "import {initializeApp,applicationDefault} from 'firebase-admin/app'; import {getFirestore} from 'firebase-admin/firestore'; initializeApp({credential: applicationDefault()}); const db=getFirestore(); const id=\`\${process.env.STORE_ID}_\${process.env.DAY}\`; const snap=await db.collection('telemetry_daily').doc(id).get(); console.log(JSON.stringify(snap.data() ?? {}, null, 2)); process.exit(0);"`
- Incident note:
  - telemetry is best-effort; if telemetry fails, Guest runtime remains available and no rollback is required.
