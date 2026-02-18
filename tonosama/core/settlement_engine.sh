#!/bin/bash
# TONOSAMA Dual-Path Settlement Engine
# A: Guest Direct Pay (198/11/187)
# B: Merchant Sponsored Pay (0/187/187)

set -euo pipefail

BASE_FEE=198
PLATFORM_REVENUE=187
MERCHANT_REBATE=11

usage() {
  cat <<'USAGE'
Usage:
  ./tonosama/core/settlement_engine.sh A
  ./tonosama/core/settlement_engine.sh B
  ./tonosama/core/settlement_engine.sh A --json
  ./tonosama/core/settlement_engine.sh sweep <transactions> <modeA_percent>

Examples:
  ./tonosama/core/settlement_engine.sh A
  ./tonosama/core/settlement_engine.sh sweep 120 65
USAGE
}

report_single() {
  local mode="$1"
  local json="${2:-0}"
  local guest_pays=0
  local merchant_pays=0
  local platform_gets=0
  local merchant_return=0
  local label=""

  case "$mode" in
    A)
      label="Guest Direct"
      guest_pays="$BASE_FEE"
      merchant_pays=0
      platform_gets="$PLATFORM_REVENUE"
      merchant_return="$MERCHANT_REBATE"
      ;;
    B)
      label="Merchant Sponsored"
      guest_pays=0
      merchant_pays="$PLATFORM_REVENUE"
      platform_gets="$PLATFORM_REVENUE"
      merchant_return=0
      ;;
    *)
      echo "Error: Unknown Settlement Mode ($mode)." >&2
      exit 1
      ;;
  esac

  if [ "$json" = "1" ]; then
    printf '{"mode":"%s","label":"%s","guest_pays":%d,"merchant_pays":%d,"platform_revenue":%d,"merchant_return":%d}\n' \
      "$mode" "$label" "$guest_pays" "$merchant_pays" "$platform_gets" "$merchant_return"
    return
  fi

  echo "--- TONOSAMA Transaction Report ---"
  echo "[Mode $mode: $label]"
  echo "GUEST PAYS: ¥${guest_pays}"
  echo "MERCHANT PAYS: ¥${merchant_pays}"
  echo "PLATFORM REVENUE: ¥${platform_gets}"
  echo "MERCHANT RETURN: ¥${merchant_return}"
  echo "NET PLATFORM TAKE: ¥$((platform_gets - merchant_return))"
}

report_sweep() {
  local transactions="$1"
  local mode_a_percent="$2"

  if ! [[ "$transactions" =~ ^[0-9]+$ ]] || [ "$transactions" -le 0 ]; then
    echo "Error: transactions must be a positive integer." >&2
    exit 1
  fi
  if ! [[ "$mode_a_percent" =~ ^[0-9]+$ ]] || [ "$mode_a_percent" -lt 0 ] || [ "$mode_a_percent" -gt 100 ]; then
    echo "Error: modeA_percent must be 0..100." >&2
    exit 1
  fi

  local mode_a_count=$((transactions * mode_a_percent / 100))
  local mode_b_count=$((transactions - mode_a_count))

  local guest_total=$((mode_a_count * BASE_FEE))
  local merchant_total=$((mode_b_count * PLATFORM_REVENUE))
  local platform_gross=$((transactions * PLATFORM_REVENUE))
  local merchant_return_total=$((mode_a_count * MERCHANT_REBATE))
  local platform_net=$((platform_gross - merchant_return_total))

  echo "=== TONOSAMA Daily Sweep ==="
  echo "Transactions: ${transactions}"
  echo "Mix: A=${mode_a_count} (${mode_a_percent}%) / B=${mode_b_count} ($((100 - mode_a_percent))%)"
  echo "--------------------------------"
  echo "Guest Total Payment:   ¥${guest_total}"
  echo "Merchant Total Payment:¥${merchant_total}"
  echo "Platform Gross:        ¥${platform_gross}"
  echo "Merchant Return Total: ¥${merchant_return_total}"
  echo "Platform Net Take:     ¥${platform_net}"
}

main() {
  if [ $# -lt 1 ]; then
    usage
    exit 1
  fi

  case "$1" in
    A|B)
      local json=0
      if [ "${2:-}" = "--json" ]; then
        json=1
      fi
      report_single "$1" "$json"
      ;;
    sweep)
      if [ $# -ne 3 ]; then
        usage
        exit 1
      fi
      report_sweep "$2" "$3"
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
