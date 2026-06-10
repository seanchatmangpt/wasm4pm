#!/usr/bin/env bash
# AutoinstinctVision — blocks-world scene parsing: support-graph, clear-set, stack detection.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── autoinstinct_vision: blocks-world perception — support graph, clear set, stack detection ───"
$WPM cognition run --contract autoinstinct_vision --input intent.json --format json | tee result.json
