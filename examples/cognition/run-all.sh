#!/usr/bin/env bash
# Run all 13 cognition breed examples.
# Each must produce status:ok, a non-empty inference trace, and a BLAKE3 receipt.
# Failure is hard — any non-zero exit aborts.

set -euo pipefail
cd "$(dirname "$0")"

EXAMPLES=(
  mycin hearsay soar cbr prolog strips gps dendral eliza
  autoinstinct_learning autoinstinct_neurosis autoinstinct_semantics autoinstinct_vision
)
PASS=0
FAIL=0

for ex in "${EXAMPLES[@]}"; do
  echo ""
  echo "═══ $ex ═══"
  if bash "$ex/run.sh" >"$ex/last-output.log" 2>&1; then
    PASS=$((PASS + 1))
    oh=$(python3 -c "import json,sys; d=json.load(open('$ex/result.json')); print(d.get('payload',{}).get('output_hash','')[:16])" 2>/dev/null || echo "")
    echo "✓ $ex  $oh"
  else
    FAIL=$((FAIL + 1))
    echo "✗ $ex (see $ex/last-output.log)"
    cat "$ex/last-output.log" | tail -5
  fi
done

echo ""
echo "═══ Summary ═══"
echo "Passed: $PASS / ${#EXAMPLES[@]}"
echo "Failed: $FAIL"

[ $FAIL -eq 0 ] || exit 1
