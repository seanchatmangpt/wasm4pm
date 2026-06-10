#!/usr/bin/env bash
# SOAR — Universal subgoaling + chunking cognitive architecture (1987)
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../../.. && pwd)"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── SOAR: universal subgoaling ───"
$WPM cognition run --contract soar --input intent.json --format json | tee result.json
