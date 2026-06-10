#!/usr/bin/env bash
# DENDRAL — Hypothesis-and-test generate-and-test search (1965)
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../../.. && pwd)"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── DENDRAL: molecular structure hypothesis ───"
$WPM cognition run --contract dendral --input intent.json --format json | tee result.json
