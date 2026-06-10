#!/usr/bin/env bash
# GPS — means-ends analysis with difference reduction table (Newell & Simon 1963).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── gps: initial state + goals → means-ends plan via difference reduction ───"
$WPM cognition run --contract gps --input intent.json --format json | tee result.json
