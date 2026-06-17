#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="node --experimental-wasm-modules $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi
$WPM cognition run --contract frames_inheritance --input intent.json --format json | tee result.json
