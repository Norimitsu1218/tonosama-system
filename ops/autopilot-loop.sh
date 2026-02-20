#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/metrics-validate.sh"

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
policy_rules_path="none"
policy_version="unknown"
metrics_decision="unknown"
metrics_reason_code="none"

annotate_metrics_decision() {
  local decision_code="${1:?decision required}"
  local reason_code="${2:?reason required}"
  local tmp_file eval_at

  if [[ -z "${metrics_path:-}" || "$metrics_path" == "none" || ! -f "$metrics_path" ]]; then
    return 1
  fi

  tmp_file="${metrics_path}.tmp"
  eval_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if ! jq \
    --arg decision "$decision_code" \
    --arg reason "$reason_code" \
    --arg source "autopilot-loop" \
    --arg eval_at "$eval_at" \
    --arg policy_ver "$policy_version" \
    '
      .decision = $decision
      | .decision_reason_code = $reason
      | .decision_source = $source
      | .policy_eval_at = $eval_at
      | .policy_version = (.policy_version // $policy_ver)
    ' "$metrics_path" > "$tmp_file"; then
    rm -f "$tmp_file"
    return 1
  fi

  if ! jq -e 'type == "object"' "$tmp_file" >/dev/null 2>&1; then
    rm -f "$tmp_file"
    return 1
  fi

  if ! mv "$tmp_file" "$metrics_path"; then
    rm -f "$tmp_file"
    return 1
  fi

  return 0
}

block_with_metrics() {
  local reason_code="${1:?reason required}"
  local next_task="${2:-KEEP-MANUAL}"
  local emit_reason="$reason_code"

  if [[ "${metrics_path:-none}" != "none" && -f "${metrics_path:-}" ]]; then
    if ! annotate_metrics_decision "BLOCK" "$reason_code"; then
      emit_result "BLOCK" "metrics_write_failed" "$next_task"
      exit 2
    fi
    if load_metrics_decision "$metrics_path"; then
      emit_reason="$metrics_reason_code"
    fi
  fi

  emit_result "BLOCK" "$emit_reason" "$next_task"
  exit 2
}

load_metrics_decision() {
  local m="$1"
  local d r
  d="$(jq -r '.decision // empty' "$m" 2>/dev/null || true)"
  r="$(jq -r '.decision_reason_code // empty' "$m" 2>/dev/null || true)"

  if [[ -z "$d" || -z "$r" ]]; then
    return 1
  fi
  case "$d" in
    CLOSE|KEEP|BLOCK) ;;
    *) return 1 ;;
  esac

  metrics_decision="$d"
  metrics_reason_code="$r"
  return 0
}

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

policy_rules_path="$(find "$out_dir" -type f -name 'policy-rules.json' | head -n1 || true)"
if [[ -z "$policy_rules_path" ]]; then
  policy_rules_path="none"
  block_with_metrics "policy_rules_missing" "BLOCK-TRIAGE"
fi

if ! jq -e '
  type == "object"
  and (.policy_version | type == "string")
  and (.classification.warn_allowlist | type == "array")
  and (.classification.fail_closed_categories | type == "array")
  and (.promotions.dedupe_key | type == "string")
  and (.retries.issue_create_max_attempts | type == "number")
' "$policy_rules_path" >/dev/null 2>&1; then
  block_with_metrics "policy_rules_invalid" "BLOCK-TRIAGE"
fi

if ! jq -e '
  type == "object"
  and (.policy_version | type == "string")
  and (.warn_by_category | type == "object")
  and (.fail_by_category | type == "object")
  and (.counts.warn | type == "number")
  and (.counts.fail | type == "number")
' "$metrics_path" >/dev/null 2>&1; then
  block_with_metrics "metrics_invalid" "BLOCK-TRIAGE"
fi

policy_version="$(jq -r '.policy_version' "$policy_rules_path" 2>/dev/null || echo unknown)"
metrics_policy_version="$(jq -r '.policy_version // "missing"' "$metrics_path" 2>/dev/null || echo missing)"
if [[ "$metrics_policy_version" != "$policy_version" ]]; then
  block_with_metrics "policy_version_mismatch" "BLOCK-TRIAGE"
fi

next_task="$(jq -r '.next_task_id // "KEEP-MANUAL"' "$metrics_path" 2>/dev/null || echo KEEP-MANUAL)"

if ! jq -e --slurpfile p "$policy_rules_path" '
  [(.warn_by_category // {} | to_entries[]? | select((.value|tonumber) > 0) | .key)] as $activeWarn
  | ($p[0].classification.warn_allowlist + ["WARN_UNKNOWN"]) as $allowWarn
  | (($activeWarn - $allowWarn) | length) == 0
' "$metrics_path" >/dev/null 2>&1; then
  block_with_metrics "unknown_warn_category" "$next_task"
fi

if ! jq -e --slurpfile p "$policy_rules_path" '
  [(.fail_by_category // {} | to_entries[]? | select((.value|tonumber) > 0) | .key)] as $activeFail
  | ($p[0].classification.fail_closed_categories) as $allowFail
  | (($activeFail - $allowFail) | length) == 0
' "$metrics_path" >/dev/null 2>&1; then
  block_with_metrics "unknown_fail_category" "$next_task"
fi

fail_total="$(jq -r '.counts.fail // 0' "$metrics_path" 2>/dev/null || echo 0)"
warn_total="$(jq -r '.counts.warn // 0' "$metrics_path" 2>/dev/null || echo 0)"
if ! [[ "$fail_total" =~ ^[0-9]+$ ]]; then
  fail_total=0
fi
if ! [[ "$warn_total" =~ ^[0-9]+$ ]]; then
  warn_total=0
fi

decision="BLOCK"
reason="unknown"
if (( fail_total > 0 )); then
  decision="BLOCK"
  reason="fail_category_present"
elif (( warn_total > 0 )); then
  decision="KEEP"
  reason="warn_category_present"
else
  decision="CLOSE"
  reason="policy_pass"
fi

if [[ "$decision" == "BLOCK" ]]; then
  block_with_metrics "$reason" "$next_task"
fi

if ! annotate_metrics_decision "$decision" "$reason"; then
  emit_result "BLOCK" "metrics_write_failed" "$next_task"
  exit 2
fi

if ! validate_metrics_json "$metrics_path"; then
  emit_result "BLOCK" "metrics_decision_invalid" "$next_task"
  exit 2
fi

if ! load_metrics_decision "$metrics_path"; then
  emit_result "BLOCK" "metrics_decision_invalid" "$next_task"
  exit 2
fi

emit_result "$metrics_decision" "$metrics_reason_code" "$next_task"
