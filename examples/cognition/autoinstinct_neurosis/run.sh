#!/usr/bin/env bash
# AutoinstinctNeurosis — affect simulation with noisy-OR belief update under high-CF stimuli.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── autoinstinct_neurosis: affect-simulation — high-CF paranoia triggers belief update ───"
$WPM cognition run --contract autoinstinct_neurosis --input intent.json --format json | tee result.json
