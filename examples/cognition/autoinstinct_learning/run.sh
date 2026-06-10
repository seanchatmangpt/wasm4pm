#!/usr/bin/env bash
# AutoinstinctLearning example — STRIPS/HACKER bitwise heuristic planning (Winston 1975).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

echo "─── AutoinstinctLearning: STRIPS planning — stack blocks A on B on C ───"
$WPM cognition run --contract autoinstinct_learning --input intent.json --format json | tee result.json
