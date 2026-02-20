#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main-v2}"
WORKFLOW_FILE="${2:-ops-autopilot-observe.yml}"
OUT_ROOT="${3:-artifacts/ops-observe}"
POLL_SECONDS="${POLL_SECONDS:-5}"

mkdir -p "$OUT_ROOT"

echo "[RUN] workflow dispatch: $WORKFLOW_FILE ($BRANCH)"
gh workflow run "$WORKFLOW_FILE" --ref "$BRANCH"

echo "[WAIT] resolve latest workflow_dispatch run id"
run_id=""
for _ in $(seq 1 30); do
  run_id="$(gh run list --workflow "$WORKFLOW_FILE" --event workflow_dispatch --branch "$BRANCH" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  if [[ -n "$run_id" && "$run_id" != "null" ]]; then
    break
  fi
  sleep "$POLL_SECONDS"
done

if [[ -z "$run_id" || "$run_id" == "null" ]]; then
  echo "BLOCK | run=unknown | reason=run_id_unresolved"
  exit 2
fi

echo "[INFO] run=$run_id"
gh run watch "$run_id" --exit-status --interval "$POLL_SECONDS"

out_dir="$OUT_ROOT/$run_id"
mkdir -p "$out_dir"
gh run download "$run_id" -D "$out_dir" || true

metrics_path="$(find "$out_dir" -type f -name 'metrics.json' | head -n1 || true)"
summary_path="$(find "$out_dir" -type f -name 'summary.md' | head -n1 || true)"

if [[ -z "$metrics_path" ]]; then
  echo "BLOCK | run=$run_id | reason=metrics_missing"
  exit 2
fi

status="$(jq -r '.status // "UNKNOWN"' "$metrics_path" 2>/dev/null || echo UNKNOWN)"
next_task="$(jq -r '.next_task_id // "KEEP-MANUAL"' "$metrics_path" 2>/dev/null || echo KEEP-MANUAL)"

decision="BLOCK"
case "$status" in
  OK|PASS)
    decision="CLOSE"
    ;;
  WARN)
    decision="KEEP"
    ;;
  FAIL)
    decision="BLOCK"
    ;;
esac

echo "$decision | run=$run_id | metrics=$metrics_path | summary=${summary_path:-none} | next=$next_task"
gh run view "$run_id" --json url --jq '.url' | sed 's#^#[URL] #'
