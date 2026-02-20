# Owner Role Downsizing Plan

## Goal

- Reduce direct `roles/owner` usage without service disruption.
- Keep rollback-ready changes and evidence for each phase.

## Current Policy

- No immediate blanket removal of human owner bindings.
- Move to least privilege through staged migration.

## Phases

1. Phase A (Inventory)
- Snapshot IAM baseline.
- Enumerate owner-required operations (deploy, billing, IAM, secret, incident).
- Map each operation to minimal role candidates.

2. Phase B (Duty Split)
- Assign deploy/runtime/audit duties to dedicated identities.
- Validate all runbooks work without direct owner actions.

3. Phase C (Trial Reduction)
- Remove owner role from one non-critical operator account.
- Run smoke + verify-hash + observe workflow.
- Roll back immediately on failure.

4. Phase D (Final Reduction)
- Remove residual direct owner grants.
- Keep emergency break-glass path documented.

## Mandatory Evidence Per Phase

- IAM before/after snapshots
- Run URLs (observe + verify-hash)
- Smoke result
- Rollback command
