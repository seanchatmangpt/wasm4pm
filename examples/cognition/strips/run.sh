#!/usr/bin/env bash
# STRIPS — Linear planning with add/delete effects (1971)
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../../.. && pwd)"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── STRIPS: stack_A_on_B planning ───"
$WPM cognition run --contract strips --input intent.json --format json | tee result.json
