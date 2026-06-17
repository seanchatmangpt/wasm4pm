#!/usr/bin/env bash
# Generate result.json + last-output.log for all 13 breeds
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"

BREEDS=(
  mycin hearsay soar cbr prolog strips gps dendral eliza
  autoinstinct_learning autoinstinct_neurosis autoinstinct_semantics autoinstinct_vision
)

fail=0
for breed in "${BREEDS[@]}"; do
  dir="$REPO_ROOT/examples/cognition/$breed"
  printf "%-32s" "$breed"
  out=$("$WPM" cognition run --contract "$breed" --input "$dir/intent.json" --format json 2>&1)
  echo "$out" > "$dir/result.json"
  echo "$out" > "$dir/last-output.log"
  st=$(echo "$out" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null || echo "PARSE_ERR")
  oh=$(echo "$out" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('payload',{}).get('output_hash','')[:16])" 2>/dev/null || echo "")
  if [ "$st" = "ok" ]; then
    echo "ok  $oh"
  else
    echo "FAIL: $st"
    fail=1
  fi
done
exit $fail
