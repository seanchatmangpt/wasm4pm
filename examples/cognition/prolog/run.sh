#!/usr/bin/env bash
# Prolog example — query a fact under bounded SLD resolution.
# Demonstrates: byte-capped admission + positive proof + receipt emission.

set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── Prolog: ?- parent(alice). ───"
$WPM cognition run --contract prolog --input intent.json --format json | tee result.json
echo ""
RECEIPT_ID=$(python3 -c "import json,sys; d=json.load(open('result.json')); print(d.get('payload',{}).get('output',{}).get('explanation','no-receipt'))" 2>/dev/null || echo "no-receipt")
echo "Receipt summary: $RECEIPT_ID"
