#!/usr/bin/env bash
set -euo pipefail

METRICS_VALIDATION_REASON="metrics_decision_invalid"

validate_metrics_json() {
  local path="${1:-}"
  METRICS_VALIDATION_REASON="metrics_decision_invalid"

  if [[ -z "$path" || ! -f "$path" ]]; then
    METRICS_VALIDATION_REASON="metrics_decision_invalid"
    return 1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    METRICS_VALIDATION_REASON="metrics_decision_invalid"
    return 1
  fi

  if ! jq -e '
    type == "object"
    and (
      (.policy_version | type == "string")
      or
      (.policy_version | type == "number")
    )
    and (.decision | type == "string")
    and (.decision_reason_code | type == "string" and length > 0)
    and (.decision_source == "autopilot-loop")
    and (.policy_eval_at | type == "string" and length > 0)
    and ((.decision == "CLOSE") or (.decision == "KEEP") or (.decision == "BLOCK"))
  ' "$path" >/dev/null 2>&1; then
    METRICS_VALIDATION_REASON="metrics_decision_invalid"
    return 1
  fi

  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  validate_metrics_json "${1:-}" && exit 0
  echo "$METRICS_VALIDATION_REASON"
  exit 1
fi
