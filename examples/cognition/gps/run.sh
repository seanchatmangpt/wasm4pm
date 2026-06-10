#!/usr/bin/env bash
# GPS — General Problem Solver, means-ends analysis (1957)
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../../.. && pwd)"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── GPS: get-dressed means-ends planning ───"
$WPM cognition run --contract gps --input intent.json --format json | tee result.json
