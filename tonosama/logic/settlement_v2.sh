#!/bin/bash
# 決済モードの判定と資金分配ロジック

MODE=$1 # guest_pay | merchant_pay
AMOUNT_TOTAL=198
PLATFORM_CUT=187
MERCHANT_BACK=11

if [ "$MODE" == "guest_pay" ]; then
    echo "[STATUS] Guest pays ¥${AMOUNT_TOTAL}"
    echo "[STATUS] Platform receives ¥${PLATFORM_CUT}"
    echo "[STATUS] Merchant gets back ¥${MERCHANT_BACK}"
elif [ "$MODE" == "merchant_pay" ]; then
    echo "[STATUS] Guest pays ¥0"
    echo "[STATUS] Merchant pays to Platform ¥${PLATFORM_CUT}"
else
    echo "[ERROR] Invalid Settlement Mode"
fi
