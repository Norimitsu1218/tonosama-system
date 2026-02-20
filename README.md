# tonosama-system
Runtime (Guest PWA) + Build-time (Owner) + Functions + Genkit (Okami)

## Audit Status

- Release audit: closed (Critical/High blockers resolved).
- Ops guard: active with `ops-autopilot-observe` (read-only, fail-closed, artifact-required).
- Improvement backlog (5):
  - reduce `roles/editor` residuals with evidence-first rollout.
  - define `roles/owner` downsizing policy (no immediate removal).
  - keep WARN criteria fixed and versioned.
  - update final audit summary on each status change.
  - keep S-21 (guest SSR Node22) as separate track; production remains Node20 until stable.

## Guest PWA (Next.js)

0. First command after clone (Owner bootstrap check)
`sh ops/owner-setup.sh`

1. Install dependencies
`npm install`
CI and reproducible local checks should use `npm ci`.

2. Run guest dev server from repository root
`npm run dev:guest`
Default port is `3010`.

3. Stop guest dev server from repository root
`npm run stop:guest`

4. Typecheck guest from repository root
`npm run typecheck:guest`

5. Build guest from repository root
`npm run build:guest`

6. Run guest E2E from repository root
`npm run test:e2e:guest`

7. Run Functions tests from repository root
`npm run test:functions`

## Network Runbook

- If `npm install` fails with `ENOTFOUND registry.npmjs.org`, retry from a different network path (for example, tethering) and rerun `npm install`.
- In enterprise networks, verify proxy/DNS policy allows `https://registry.npmjs.org/`.
- For remote E2E target, set `E2E_BASE_URL` (example: `E2E_BASE_URL=http://localhost:3010 npm run test:e2e:guest`).

## Toolchain Policy

- Node.js: `22.x`
- npm: `10.x` or newer compatible with lockfile
- CI install command is fixed to `npm ci` (no `npm install` in CI).
- Audit policy is fail-closed via `ops/check-audit.sh` + `ops/audit-baseline.json`.

## Audit Baseline

- Generate raw report:
`npm audit --json > /tmp/audit.json`
- Curate `ops/audit-baseline.json` with:
  - `schemaVersion`
  - `generatedAt`
  - `rules[]` where each rule has:
    - `package`, `advisory`, `severity`, `reason`, `expiresAt`
- Use short expiries (recommended: 30 days).

## Firestore Read-Only Wiring

Guest Runtime no longer reads Firestore directly. It uses Functions APIs only:
- `GET /api/gate?storeId=...`
- `GET /api/storeBundle?storeId=...` with `Authorization: Bearer <gate-token>`

## API Routing

- `firebase.json` rewrites:
  - `/api/gate` -> Function `gate`
  - `/api/storeBundle` -> Function `storeBundle`
  - `/api/billing/flip` -> Function `billingFlip`
  - `/api/billing/checkout` -> Function `billingCheckout`
  - `/api/billing/webhook` -> Function `billingWebhook`
  - `/api/approvalLog` -> Function `approvalLog`
  - `/api/owner/itemAction` -> Function `ownerItemAction`
  - `/api/owner/menuVisionImport` -> Function `ownerMenuVisionImport`
  - `/api/owner/telemetry` -> Function `ownerTelemetry`
  - `/api/owner/billingStatus` -> Function `ownerBillingStatus`
  - `/api/telemetry` -> Function `telemetry`
  - `/api/okami/answer` -> Function `okamiAnswer`
- Guest client uses relative paths (`/api/...`) to keep local/staging/prod behavior aligned.

## Hosting/SSR Delivery

- Previous config `hosting.public=apps/pwa-guest/public` served only static assets and cannot reliably serve Next SSR routes such as `/s/[storeId]`.
- Current config uses Firebase framework-aware hosting:
  - `hosting.target=guest`
  - `hosting.source=apps/pwa-guest`
  - `hosting.frameworksBackend.region=asia-northeast1`
- Project/target mapping is defined in `.firebaserc`:
  - `projects.default`
  - `targets.<project>.hosting.guest`
  Replace placeholder values before deploy.

## Secret Setup

- Required secret for Functions:
  - `GATE_TOKEN_SECRET`
  - `OWNER_API_TOKEN` (owner action and approval log API)
  - `TELEMETRY_SALT_SECRET` (daily salt derivation for irreversible telemetry hashing)
  - `STRIPE_SECRET_KEY` (guest-pays checkout)
  - `BILLING_SUCCESS_URL` (checkout success return URL)
  - `BILLING_CANCEL_URL` (checkout cancel return URL)
  - `STRIPE_WEBHOOK_SECRET` (Stripe webhook signature verification)
  - `BILLING_SUCCESS_URL` should point to guest route (`/s/<storeId>?checkout=success`).
  - `BILLING_CANCEL_URL` should point to guest route (`/s/<storeId>?checkout=cancel`).
  - Stripe webhook endpoint is `https://<host>/api/billing/webhook`.
  - Verify Stripe-related secret existence:
`PROJECT_ID=<gcp-project-id> sh ops/stripe-secrets-check.sh`
- Local Functions:
  - define required secrets in your local Functions env file (do not commit secrets).
- Production Functions:
  - set required secrets in Firebase Functions runtime config before deploy.
- Fastest safe setup (recommended):
`PROJECT_ID=<gcp-project-id> npm run ops:secrets:setup`
  - This prompts each required secret in order and applies from clipboard.
  - No secret value is printed.
- Clipboard secret registration (default: Firebase Functions only):
`npm run ops:secret:clipboard -- STRIPE_WEBHOOK_SECRET`
`npm run ops:secret:clipboard -- STRIPE_SECRET_KEY`
`npm run ops:secret:clipboard -- BILLING_SUCCESS_URL`
`npm run ops:secret:clipboard -- BILLING_CANCEL_URL`
  - Press-1 flow (copy to clipboard, then type `1`):
`npm run ops:secret:press1 -- STRIPE_WEBHOOK_SECRET`
`npm run ops:secret:press1 -- STRIPE_SECRET_KEY`
  - Optional:
    - GitHub only: `npm run ops:secret:clipboard -- --gh-only SECRET_NAME`
    - Firebase only: `npm run ops:secret:clipboard -- --firebase-only SECRET_NAME`
    - Both GitHub + Firebase: `npm run ops:secret:clipboard -- --both SECRET_NAME`
    - Force Firebase target:
      - Functions (default): `npm run ops:secret:clipboard -- --firebase-functions SECRET_NAME`
      - App Hosting (optional): `npm run ops:secret:clipboard -- --firebase-apphosting SECRET_NAME`

## Hosting Target

- Primary (SSR): Firebase framework-aware hosting from `apps/pwa-guest`.
- Fallback (static emergency): `npm run build:guest:static` creates `apps/pwa-guest/out-static`.

## CI and Production-Like E2E

- CI baseline:
`npm run ci:guest:ssr`
- Production-like run against deployed/staging URL:
`E2E_BASE_URL=https://<your-host>/ npm run test:e2e:guest`

## Owner App (Minimal)

- Run owner dev server:
`npm run dev:owner`
- Default owner URL:
`http://localhost:3011`
- Owner actions call Functions only:
  - `POST /api/owner/itemAction`
  - `POST /api/approvalLog`
  - `GET /api/owner/storeStatus`
  - `GET /api/owner/costStatus`
  - `GET /api/owner/billingStatus`
  - `POST /api/owner/businessRules`
  - `POST /api/owner/menuImport`
  - `POST /api/owner/menuVisionImport`
  - `POST /api/owner/pairingOverrides`
  - `POST /api/owner/soulCapture`
  - `POST /api/owner/crystallize`
  - `POST /api/owner/salesDiagnosis`
  - `POST /api/owner/businessModel`
  - `POST /api/owner/contractAccept`
  - `POST /api/owner/activateAccount`
  - `POST /api/owner/shopCardImport`
  - `POST /api/owner/publishTrends`
  - `POST /api/owner/initialFeeCheckout`
  - `POST /api/owner/shopCardParse`
  - `POST /api/owner/shopCardVisionParse`
  - `GET /api/owner/storeQr`
  - `POST /api/owner/businessRules` now requires:
    - `liabilityAllergyAccepted=true`
    - `liabilityReligionAccepted=true`
    - optional `lpHeroVideoUrl` (https only)
    - blocked source domains: `tabelog.com`, `retty.me`, `hotpepper.jp`, `gurunavi.com`, `yelp.com`
  - `GET /api/owner/costStatus?storeId=...` for aggregate owner action cost log.
- Owner request headers:
  - `X-OWNER-TOKEN`
  - `X-REQ-TS` (unix ms, +/- 5 min)
  - `X-REQ-NONCE` (single use)
- Provide owner token at runtime and keep values out of repository files.

## Agent Autonomy

- Execution contract for Codex is in `ops/agent_mission.md`.
- Owner one-time bootstrap script is `ops/init-owner.sh` (API enable is owner-only, not CI).

## CI Deploy

- Workflow: `.github/workflows/firebase-deploy.yml` (runs on `main-v2` push).
- Continuous runtime watch: `.github/workflows/runtime-watch.yml` (every 30 minutes + manual dispatch).
- Required repository secret:
  - `GCP_WIF_PROVIDER` (Workload Identity Provider resource name).
  - `GCP_DEPLOY_SA` (deploy service account email).
- Required repository variables:
  - `BASE_URL` (deployed host for smoke/health checks).
  - `STORE_ID` (verification target store id).
- `FIREBASE_TOKEN` is deprecated and should be removed after OIDC is active.
- CI does not enable Google APIs. Run owner bootstrap once before CI deploy:
`sh ops/init-owner.sh <GCP_PROJECT_ID>`
- CI preflight:
  - fails if `.firebaserc` has placeholder values.
  - fails if `firebase.json` guest hosting target/rewrites are invalid.
  - fails if `GCP_WIF_PROVIDER` or `GCP_DEPLOY_SA` is missing.
  - fails if workflow permissions/paths/OIDC wiring drift from policy.
  - fails if `test:functions` script is missing.
- CI execution order:
  - `firebase deploy` -> `ops/health.sh` -> `ops/verify-approval-hash.sh` -> success.
- First manual deploy before enabling CI:
`firebase deploy --only hosting:guest,functions`
- Remove legacy token secret after first successful OIDC deploy:
`gh secret delete FIREBASE_TOKEN`
- Rollback:
  - Hosting rollback to previous release.
  - Functions rollback by `git revert <bad_commit_sha>` and redeploy.

## Ops Commands

- Deploy:
`sh ops/deploy.sh`
- Canary deploy:
`CHANNEL=preview sh ops/canary.sh deploy`
- Canary promote:
`SITE_ID=<hosting-site-id> CHANNEL=preview sh ops/canary.sh promote`
- Canary abort:
`CHANNEL=preview sh ops/canary.sh abort`
- Canary one-command ship:
`SITE_ID=<hosting-site-id> CHANNEL=preview BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/canary-release.sh ship`
- Rollback (latest hosting):
`HOSTING_SOURCE=<channel-or-version> SITE_ID=<hosting-site-id> sh ops/rollback.sh`
- Incident flow:
`BASE_URL=https://<your-host> sh ops/incident.sh`
- Approval hash audit:
`STORE_ID=<storeId> sh ops/verify-approval-hash.sh`
- Local owner preflight:
`sh ops/preflight-local.sh`
- Post deploy smoke:
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/post-deploy-smoke.sh`
- Runtime health check:
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/health.sh`
- Recovery helper:
`BASE_URL=https://<your-host> ISSUE=gate|ssr|auto sh ops/recover.sh`
- Drill suite (preflight + health + hash verify):
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/drill.sh`
- Owner endpoint smoke:
`BASE_URL=https://<your-host> STORE_ID=<storeId> OWNER_API_TOKEN=<owner-token> sh ops/smoke-owner.sh`
- Stripe webhook endpoint (server-to-server):
`POST /api/billing/webhook`
  - signature requires valid `v1` and timestamp within tolerance window (default 5 minutes).
- Owner quick B2B operation:
  - use `Quick B2B Flow` in owner UI to run status/rules/diagnosis/qr/cost sequence.
  - use `Vision Menu Import` to ingest multimodal frame payloads.
  - use `Pairing Override` to pin store-level pairing matrix (`foodId -> [drinkId...]`).
- Multimodal payload examples:
`docs/multimodal-payloads.md`
- Guest runtime launch examples:
`/s/<storeId>?mock=1`
`/s/<storeId>?lang=ja|en|fr|zh`
`/shops/info/<storeId>?lang=ja|en|fr|zh` (pre-payment entry with explicit clickwrap)
`/shops/menu/<storeId>?lang=ja|en|fr|zh` (post-consent experience route)
  - legacy `lang=09` is normalized to `en`
  - when clickwrap session exists (from `/shops/info`), `/shops/menu` auto-advances to Mood
  - info CTA calls `/api/billing/checkout` (idempotent) and redirects only on accepted checkout result
- Discovery runtime controls:
  - sort: Mood / Price / Name
  - fallback recovery: `Retry Store Data`
  - basic branch: `No, just show me the list` (reduced surface, explicit consent still required)
  - slip metadata: generated slip number + timestamp
- New store checklist generator:
`STORE_ID=<storeId> BASE_URL=https://<your-host> sh ops/new-store.sh`
- 10-second geo bootstrap (one command):
`OWNER_API_TOKEN=<token> LAT=35.6764 LNG=139.6500 BASE_URL=https://apicius-owner.web.app npm run ops:geo:launch`
  - Optional:
    - `PARTNER_ID=partner-demo` (default: `partner-demo`)
    - `STORE_NAME="鮨 とのさま"` for custom initial name
    - `SOURCE_URL=https://example.jp` for initial source hint
    - `OPEN=1` to open generated guest URL automatically on macOS
- Royal onboarding launcher (geo bootstrap + gate smoke + next actions):
`OWNER_API_TOKEN=<token> LAT=35.6764 LNG=139.6500 BASE_URL=https://apicius-owner.web.app npm run ops:royal:onboarding`
  - SSOT doc: `docs/royal-onboarding-ssot.md`
- One-command bootstrap for repeated project setup (GitHub vars/secrets + Firebase secrets):
`cp .env.bootstrap.example .env.bootstrap`
`npm run ops:bootstrap` (dry-run)
`DRY_RUN=0 npm run ops:bootstrap` (apply)
  - shared global env file is also supported: `~/.tonosama/bootstrap.env`
- New project full automation (create repo from template + clone + bootstrap):
`NEW_REPO=<repo-name> PROJECT_ID=<gcp-project-id> npm run ops:new:project`
  - apply immediately: `NEW_REPO=<repo-name> PROJECT_ID=<gcp-project-id> DRY_RUN=0 npm run ops:new:project`
  - includes: hosting site create, target apply, `.firebaserc` mapping, bootstrap, first deploy, health check
  - optional skip deploy: `DO_FIRST_DEPLOY=0`
  - auto commit/push bootstrap artifacts (default on): `AUTO_COMMIT=1 AUTO_PUSH=1`
- Telemetry daily counters (Firestore):
`STORE_ID=<storeId> DAY=<yyyymmdd> node --input-type=module -e "import {initializeApp,applicationDefault} from 'firebase-admin/app'; import {getFirestore} from 'firebase-admin/firestore'; initializeApp({credential: applicationDefault()}); const db=getFirestore(); const id=\`\${process.env.STORE_ID}_\${process.env.DAY}\`; const snap=await db.collection('telemetry_daily').doc(id).get(); console.log(JSON.stringify(snap.data() ?? {}, null, 2)); process.exit(0);"`
- Owner local env:
  - set `OWNER_API_TOKEN` in Functions runtime env.
  - optional `NEXT_PUBLIC_OWNER_API_BASE` for owner app endpoint override.
- OIDC owner helper:
`PROJECT_ID=<gcp-project-id> GH_ORG=<github-org> sh ops/oidc-apply.sh`
- Runtime hard-constraints check:
`sh ops/check-runtime-constraints.sh`

## Guardrail Notes

- Destructive guardrails are expected to fail closed; if preflight fails, fix config drift instead of bypassing checks.
- Telemetry is best-effort by design; telemetry endpoint failures do not block Guest UX or gate flow.
- Runtime implementation status (`⭕️/△/❌`) is tracked in `docs/runtime-flow-ssot.md`.
- Latest completion matrix (`⭕️/🔺/💁‍♂️/❌`) is tracked in `docs/completion-matrix.md`.
- Runtime execution DAG (Policy/Capability/Experience) is tracked in `docs/runtime-exec-dag.md`.
- MCP + Genkit + UI/UX implementation playbook is in `docs/mcp-genkit-uiux-playbook.md`.
- Baseline files:
  - Genkit flow boundary: `ai/genkit/flows/okami.local.ts`
  - MCP read-only contract: `ai/genkit/tools/mcp-readonly.ts`
  - Gems prompt pack: `ai/gems/okami-gems.json`
- Quick check:
`npm run ops:ai:check`
- Information collection role assignment map is in `docs/information-collection-role-map.md`.
- Stripe manual setup links are in `docs/stripe-secret-setup-links.md`.
- Stripe setup launcher:
`PROJECT_ID=<PROJECT_ID> ORG=<ORG> REPO=<REPO> HOST=<HOST> OPEN=1 sh ops/open-stripe-setup-links.sh`
- Clipboard + press-1 Stripe secret apply with auto deploy:
`PROJECT_ID=<PROJECT_ID> npm run ops:stripe:press1 -- STRIPE_WEBHOOK_SECRET`
  - also supports: `STRIPE_SECRET_KEY`, `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL`
- Full AI autopilot (preflight + Stripe secret check + billing deploy + health + signed webhook smoke):
`PROJECT_ID=<PROJECT_ID> BASE_URL=https://<PROJECT_ID>.web.app STORE_ID=test123 npm run ops:autopilot`
  - `PROJECT_ID` is optional if set in `~/.tonosama/bootstrap.env`
- Owner billing panel includes:
  - totals table (`checkout_count`, `checkout_amount`, `avg_amount`)
  - warning when avg amount is below threshold
  - `7d vs 30d` billing delta line
- Okami answer endpoint:
  - `POST /api/okami/answer` with gate bearer token
  - optional body key `mode`: `speed | robustness | scalability`
  - model policy: `SECURITY` or `robustness` uses `gemini-2.5-pro`; others use `gemini-2.5-flash`
  - guest runtime hint: `/s/<storeId>?aiMode=speed|robustness|scalability`
  - runtime falls back to local classifier when API is unavailable
- Telemetry includes `okami_ask`, `okami_api`, `okami_blocked`, `okami_fallback`, `okami_rate_limited` aggregate counters (no PII).

## Recovery Decision

- Gate broken (`/api/gate` unexpected status):
`BASE_URL=https://<your-host> STORE_ID=<storeId> sh ops/incident.sh`
- SSR broken (`/s/<storeId>` not 200):
`HOSTING_SOURCE=<channel-or-version> SITE_ID=<hosting-site-id> sh ops/rollback.sh`
