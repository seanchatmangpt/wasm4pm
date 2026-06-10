#!/usr/bin/env bash
# Run every cognition example. Each must produce a non-empty inference trace
# and a receipt. Failure is hard.

set -euo pipefail
cd "$(dirname "$0")"

EXAMPLES=(eliza mycin cbr prolog strips dendral gps soar hearsay)
PASS=0
FAIL=0

for ex in "${EXAMPLES[@]}"; do
  echo ""
  echo "═══ $ex ═══"
  if bash "$ex/run.sh" >"$ex/last-output.log" 2>&1; then
    PASS=$((PASS + 1))
    echo "✓ $ex"
  else
    FAIL=$((FAIL + 1))
    echo "✗ $ex (see $ex/last-output.log)"
  fi
done

echo ""
echo "═══ Summary ═══"
echo "Passed: $PASS / ${#EXAMPLES[@]}"
echo "Failed: $FAIL"

[ $FAIL -eq 0 ] || exit 1
