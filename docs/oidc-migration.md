# OIDC Migration Plan

## Scope

- Keep current deploy flow stable.
- Add only migration-ready documentation and placeholders.
- Do not include project-specific secret values in repository files.

## Execution Order

1. Owner runs `ops/oidc-apply.sh` to prepare pool/provider/service-account and IAM bindings.
2. Owner sets GitHub secrets:
   - `GCP_WIF_PROVIDER`
   - `GCP_DEPLOY_SA`
3. Confirm workflow uses OIDC auth step and does not reference `FIREBASE_TOKEN`.
4. Run CI once on `main` and confirm deploy succeeds.
5. Remove `FIREBASE_TOKEN` secret after successful OIDC deploy.

## Required Cloud Setup (Owner task)

- Workload Identity Pool
- Workload Identity Provider (GitHub OIDC issuer)
- Deploy Service Account
- IAM bindings for Workload Identity impersonation
- Minimum deploy roles for Hosting and Functions

## Required GitHub Settings

- Repository environment protection for production deploy
- Repository secrets:
  - `GCP_WIF_PROVIDER`
  - `GCP_DEPLOY_SA`

## Workflow Changes

- Keep `permissions.id-token: write`.
- Use `google-github-actions/auth` with provider and service account secrets.
- Keep deploy trigger pinned to `main` push.
- Keep `concurrency` enabled.

## Verification Checklist

- CI deploy succeeds without `FIREBASE_TOKEN`.
- `FIREBASE_TOKEN` secret removed after successful OIDC deploy.
- Deploy still fails closed when provider/SA secret is missing.
- Rollback scripts remain functional.

## Rollback Plan

- Revert workflow file to previous commit if OIDC path breaks deploy.
- Re-run deploy after restoring last known-good workflow.
