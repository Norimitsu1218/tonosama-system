# IAM Reduction Policy

## Scope

- This policy covers post-audit IAM cleanup tasks after release blockers are closed.
- It does not authorize immediate removal of platform-managed principals.

## Closed Items

- Runtime SA moved off default compute SA.
- Hash verify daily workflow enabled.
- Ops observe workflow enabled with fail-closed behavior.

## Remaining Improvement Tasks

1. Reduce `roles/editor` residuals with one-binding-at-a-time rollout.
2. Define explicit downsizing policy for human `roles/owner` assignments.
3. Keep S-22 WARN criteria stable and versioned.
4. Update final audit summary whenever status changes.
5. Keep S-21 (guest SSR Node22) separate until deploy path stabilizes.

## Roles Editor Policy

- Remove only after evidence shows no active dependency.
- For each removal:
  - snapshot IAM before,
  - remove one binding,
  - run smoke + verify-hash,
  - keep rollback command ready.
- Do not remove platform-managed identities without dependency proof.

## Roles Owner Policy

- No immediate blanket removal.
- Move to least privilege in phases:
  - define operational owners,
  - split deploy/runtime/audit duties,
  - migrate owner privileges to role-specific bindings,
  - remove direct owner grants last.

## Evidence Requirements

- Mandatory evidence per change:
  - IAM before/after snapshots,
  - run URL of observe workflow,
  - smoke result,
  - verify-hash result.

## WIF Ceiling

- WIF principal must remain read-only for observe jobs.
- Allowed roles for observe principal:
  - `roles/run.viewer`
  - `roles/cloudfunctions.viewer`
  - `roles/viewer`
- Any role outside this list requires explicit review and evidence.

## Notification Redundancy

- Artifact upload is mandatory for each observe run.
- Primary signal: GitHub Actions run conclusion.
- Secondary signal: run URL + artifact link stored in ops evidence.
