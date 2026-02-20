#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-main-v2}"
WORKFLOW_FILE="${2:-ops-autopilot-observe.yml}"
OUT_ROOT="${3:-artifacts/ops-observe}"
POLL_SECONDS="${POLL_SECONDS:-5}"
GH_RETRY_MAX="${GH_RETRY_MAX:-3}"
ACTIONS_ADAPTER="${ACTIONS_ADAPTER:-ops/mcp/gh-actions-adapter.sh}"
GH_ACTIONS_BACKEND="${GH_ACTIONS_BACKEND:-gh}"
BLOCK_DEDUPE_WINDOW_SEC="${BLOCK_DEDUPE_WINDOW_SEC:-900}"
run_id="unknown"
out_dir=""
metrics_path="none"
summary_path="none"

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

emit_result() {
  local decision="${1:-BLOCK}"
  local reason="${2:-none}"
  local next_task="${3:-KEEP-MANUAL}"

  if [[ "$decision" == "BLOCK" ]]; then
    local draft_root
    if [[ -n "${out_dir:-}" ]]; then
      draft_root="$out_dir/drafts/block"
    else
      draft_root="$OUT_ROOT/block"
    fi
    mkdir -p "$draft_root"

    local artifact_flag="no"
    if [[ -n "${out_dir:-}" && -d "$out_dir" ]]; then
      artifact_flag="yes"
    fi

    local ts key_slug draft_file
    ts="$(date -u +%Y%m%d-%H%M%S)"
    key_slug="$(printf '%s' "${WORKFLOW_FILE}|${BRANCH}|${reason}" | tr -c 'a-zA-Z0-9_-' '_')"
    draft_file="$draft_root/block-${key_slug}.md"

    if [[ -f "$draft_file" ]]; then
      local now_epoch old_epoch
      now_epoch="$(date +%s)"
      old_epoch="$(stat -f %m "$draft_file" 2>/dev/null || stat -c %Y "$draft_file" 2>/dev/null || echo 0)"
      if (( now_epoch - old_epoch < BLOCK_DEDUPE_WINDOW_SEC )); then
        echo "$decision | run=${run_id:-unknown} | reason=$reason | metrics=${metrics_path:-none} | summary=${summary_path:-none} | next=$next_task"
        if [[ -n "${run_id:-}" && "$run_id" != "unknown" ]]; then
          retry_gh "$GH_RETRY_MAX" "$ACTIONS_ADAPTER" url "$run_id" | sed 's#^#[URL] #' || true
        fi
        echo "[INFO] block draft deduped: $draft_file" >&2
        return 0
      fi
    fi

    {
      echo "# [AUTO-BLOCK] $reason"
      echo
      echo "- dedupe_key: ${WORKFLOW_FILE}|${BRANCH}|${reason}"
      echo "- generated_at_utc: $ts"
      echo "- reason: $reason"
      echo "- run_id: ${run_id:-unknown}"
      echo "- workflow: $WORKFLOW_FILE"
      echo "- branch: $BRANCH"
      echo "- backend: $GH_ACTIONS_BACKEND"
      echo "- artifact_present: $artifact_flag"
      echo "- artifact_dir: ${out_dir:-none}"
      echo "- metrics: ${metrics_path:-none}"
      echo "- summary: ${summary_path:-none}"
      echo
      echo "## Retry Command"
      echo "\`GH_RETRY_MAX=${GH_RETRY_MAX} GH_ACTIONS_BACKEND=${GH_ACTIONS_BACKEND} ACTIONS_ADAPTER=${ACTIONS_ADAPTER} sh ops/autopilot-loop.sh ${BRANCH} ${WORKFLOW_FILE}\`"
      echo
      echo "## Policy"
      echo "- BLOCK requires human approval before dangerous actions."
      echo "- No production mutation is performed by this script."
    } > "$draft_file"
  fi

  echo "$decision | run=${run_id:-unknown} | reason=$reason | metrics=${metrics_path:-none} | summary=${summary_path:-none} | next=$next_task"
  if [[ -n "${run_id:-}" && "$run_id" != "unknown" ]]; then
    retry_gh "$GH_RETRY_MAX" "$ACTIONS_ADAPTER" url "$run_id" | sed 's#^#[URL] #' || true
  fi
}

mkdir -p "$OUT_ROOT"

if [[ ! -x "$ACTIONS_ADAPTER" ]]; then
  emit_result "BLOCK" "mcp_unavailable" "BLOCK-TRIAGE"
  exit 2
fi

echo "[RUN] workflow dispatch: $WORKFLOW_FILE ($BRANCH)"
if ! retry_gh "$GH_RETRY_MAX" "$ACTIONS_ADAPTER" dispatch "$WORKFLOW_FILE" "$BRANCH"; then
  emit_result "BLOCK" "dispatch_failed" "BLOCK-TRIAGE"
  exit 2
fi

echo "[WAIT] resolve latest workflow_dispatch run id"
for _ in $(seq 1 30); do
  run_id="$(retry_gh "$GH_RETRY_MAX" "$ACTIONS_ADAPTER" latest_run_id "$WORKFLOW_FILE" "$BRANCH" 2>/dev/null || true)"
  if [[ -n "$run_id" && "$run_id" != "null" ]]; then
    break
  fi
  sleep "$POLL_SECONDS"
done

if [[ -z "$run_id" || "$run_id" == "null" ]]; then
  run_id="unknown"
  emit_result "BLOCK" "run_id_lookup_failed" "BLOCK-TRIAGE"
  exit 2
fi

echo "[INFO] run=$run_id"
if ! retry_gh "$GH_RETRY_MAX" "$ACTIONS_ADAPTER" watch "$run_id" "$POLL_SECONDS"; then
  emit_result "BLOCK" "watch_failed" "BLOCK-TRIAGE"
  exit 2
fi

out_dir="$OUT_ROOT/$run_id"
mkdir -p "$out_dir"
if ! retry_gh "$GH_RETRY_MAX" "$ACTIONS_ADAPTER" download_artifacts "$run_id" "$out_dir"; then
  emit_result "BLOCK" "artifact_missing" "BLOCK-TRIAGE"
  exit 2
fi

metrics_path="$(find "$out_dir" -type f -name 'metrics.json' | head -n1 || true)"
summary_path="$(find "$out_dir" -type f -name 'summary.md' | head -n1 || true)"
if [[ -z "${summary_path:-}" ]]; then
  summary_path="none"
fi

if [[ -z "$metrics_path" ]]; then
  metrics_path="none"
  emit_result "BLOCK" "metrics_missing" "BLOCK-TRIAGE"
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

if [[ "$decision" == "BLOCK" ]]; then
  emit_result "$decision" "status_fail" "$next_task"
  exit 2
fi

emit_result "$decision" "none" "$next_task"
