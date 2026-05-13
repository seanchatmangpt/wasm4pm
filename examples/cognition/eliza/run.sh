#!/usr/bin/env bash
# ELIZA example — pattern-match a sentence and emit a slot-bound response.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

echo "─── ELIZA: 'I feel sad about my deadlines' ───"
$WPM cognition run --contract eliza --input intent.json --format json | tee result.json
