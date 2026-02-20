#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main-v2}"
WORKFLOW_FILE="${2:-ops-autopilot-observe.yml}"
OUT_ROOT="${3:-artifacts/ops-observe}"
POLL_SECONDS="${POLL_SECONDS:-5}"
GH_RETRY_MAX="${GH_RETRY_MAX:-3}"

retry_gh() {
  local max="${1:-3}"
  shift
  local n=1
  local sleep_sec=2
  while true; do
    if "$@"; then
      return 0
    fi
    if [ "$n" -ge "$max" ]; then
      return 1
    fi
    echo "[WARN] gh retry $n/$max failed: $*" >&2
    sleep "$sleep_sec"
    n=$((n + 1))
    sleep_sec=$((sleep_sec * 2))
  done
}

mkdir -p "$OUT_ROOT"

echo "[RUN] workflow dispatch: $WORKFLOW_FILE ($BRANCH)"
if ! retry_gh "$GH_RETRY_MAX" gh workflow run "$WORKFLOW_FILE" --ref "$BRANCH"; then
  echo "BLOCK | run=unknown | reason=dispatch_failed"
  exit 2
fi

echo "[WAIT] resolve latest workflow_dispatch run id"
run_id=""
for _ in $(seq 1 30); do
  run_id="$(retry_gh "$GH_RETRY_MAX" gh run list --workflow "$WORKFLOW_FILE" --event workflow_dispatch --branch "$BRANCH" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  if [[ -n "$run_id" && "$run_id" != "null" ]]; then
    break
  fi
  sleep "$POLL_SECONDS"
done

if [[ -z "$run_id" || "$run_id" == "null" ]]; then
  echo "BLOCK | run=unknown | reason=run_id_lookup_failed"
  exit 2
fi

echo "[INFO] run=$run_id"
if ! retry_gh "$GH_RETRY_MAX" gh run watch "$run_id" --exit-status --interval "$POLL_SECONDS"; then
  echo "BLOCK | run=$run_id | reason=run_failed"
  exit 2
fi

out_dir="$OUT_ROOT/$run_id"
mkdir -p "$out_dir"
retry_gh "$GH_RETRY_MAX" gh run download "$run_id" -D "$out_dir" || true

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
