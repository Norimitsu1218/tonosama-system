# Agent Mission (S7)

## Objective

Codex executes the runtime/security/deploy backlog end-to-end with human role limited to review/approval.

## Non-Negotiables

- Follow `AGENTS.md` Non-negotiables first.
- No external URL/file ingestion without explicit approval.
- Never print or commit secrets/keys.
- Firestore/Stripe/Genkit write paths are prohibited unless explicitly approved.
- Always fail closed on gate/token/data path errors.

## Success Definition (DoD)

- `main` deploys Guest SSR to Firebase Hosting (framework-aware) successfully.
- `/s/{storeId}` completes gate -> storeBundle -> UI flow (`mock=0`) and E2E remains green.
- Guest cannot read Firestore directly (rules deny + no direct-read code path).
- `ops/runbook.md` rollback/rotation/incident steps are executable without hidden steps.

## Execution DAG

1. Configure deploy targets:
- replace `.firebaserc` placeholders with real project/site values.
- verify `firebase.json` rewrites and hosting target `guest`.

2. Owner one-time initialization (CI must not enable APIs):
- run `ops/init-owner.sh` with project id.
- confirm required APIs enabled before CI deploy.

3. Secret policy:
- set `GATE_TOKEN_SECRET` in Functions runtime.
- CI must fail closed when secret is missing.

4. Deploy path:
- build/typecheck/e2e must pass before deploy.
- deploy Functions (`gate`, `storeBundle`) then Hosting target `guest`.

5. Production-like validation:
- run E2E with `E2E_BASE_URL=https://<host>` after deploy.

## Mandatory Step Protocol

At each implementation milestone, output:

`git add -N <paths> && git diff -- <paths>`

Final verification in order:

`npm run build`
`npm run typecheck:guest`
`npm run test:e2e:guest`

## Stop Conditions

Stop immediately and ask for human decision if:

- secret value would be exposed in logs/code/diff.
- API enable was attempted from CI path.
- deployment path requires broader IAM than defined.
- fail-open behavior is detected on gate/token checks.

## Failure Handling

- gate failure -> block screen.
- bundle failure -> fallback menu, keep order flow available.
- missing secret -> deploy failure (no bypass).

## Required Artifacts

- `ops/runbook.md` up to date.
- `ops/init-owner.sh` for one-time owner setup.
- CI workflow enforces pre-deploy checks and production-like E2E.
