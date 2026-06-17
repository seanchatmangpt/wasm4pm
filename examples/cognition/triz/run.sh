#!/usr/bin/env bash
# triz: contradiction matrix
set -euo pipefail
cd "$(dirname "$0")"
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi
echo "─── triz: contradiction matrix ───"
$WPM cognition run --contract triz --input intent.json --format json | tee result.json