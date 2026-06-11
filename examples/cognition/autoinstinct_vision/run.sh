#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi
if [ "$WPM" = "wpm" ]; then
  $WPM cognition run --contract autoinstinct_vision --input intent.json --format json 2>&1 | tee result.json | tee last-output.log
else
  node "$WPM" cognition run --contract autoinstinct_vision --input intent.json --format json 2>&1 | tee result.json | tee last-output.log
fi

