#!/usr/bin/env bash
# CBR example — Jaccard-similarity case retrieval over recipe ingredients.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

echo "─── CBR: best recipe for {flour, egg, prep_time:5min} ───"
$WPM cognition run --contract cbr --input intent.json --format json | tee result.json
