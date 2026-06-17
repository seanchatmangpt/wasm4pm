#!/usr/bin/env bash
# STRIPS — iterative-deepening forward search with frame axioms (Fikes & Nilsson 1971).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── strips: initial state + goals → plan sequence of actions ───"
$WPM cognition run --contract strips --input intent.json --format json | tee result.json
