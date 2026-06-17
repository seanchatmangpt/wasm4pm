#!/usr/bin/env bash
# morphological: zwicky morphological box
set -euo pipefail
cd "$(dirname "$0")"
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi
echo "─── morphological: zwicky morphological box ───"
$WPM cognition run --contract morphological --input intent.json --format json | tee result.json