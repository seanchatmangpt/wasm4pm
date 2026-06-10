#!/usr/bin/env bash
# AutoinstinctVision example — Symbolic Blocks World perception (SHRDLU lineage).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

echo "─── AutoinstinctVision: blocks-world scene parsing — find clear object in [A, B(on A), C-pyramid(on B)] ───"
$WPM cognition run --contract autoinstinct_vision --input intent.json --format json | tee result.json
