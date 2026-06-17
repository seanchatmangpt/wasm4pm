#!/usr/bin/env bash
# AutoinstinctLearning — STRIPS/HACKER bitwise heuristic planning (Winston 1975).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── autoinstinct_learning: STRIPS planning — stack blocks A on B on C ───"
$WPM cognition run --contract autoinstinct_learning --input intent.json --format json | tee result.json
