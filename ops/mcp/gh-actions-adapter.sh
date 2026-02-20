#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
shift || true

case "$cmd" in
  dispatch)
    wf="${1:?workflow required}"
    ref="${2:?branch required}"
    gh workflow run "$wf" --ref "$ref"
    ;;
  latest_run_id)
    wf="${1:?workflow required}"
    ref="${2:?branch required}"
    gh run list --workflow "$wf" --event workflow_dispatch --branch "$ref" --limit 1 --json databaseId --jq '.[0].databaseId'
    ;;
  watch)
    run_id="${1:?run_id required}"
    interval="${2:-5}"
    gh run watch "$run_id" --exit-status --interval "$interval"
    ;;
  download_artifacts)
    run_id="${1:?run_id required}"
    out_dir="${2:?out_dir required}"
    gh run download "$run_id" -D "$out_dir"
    ;;
  url)
    run_id="${1:?run_id required}"
    gh run view "$run_id" --json url --jq '.url'
    ;;
  *)
    echo "usage: $0 {dispatch|latest_run_id|watch|download_artifacts|url} ..." >&2
    exit 2
    ;;
esac
