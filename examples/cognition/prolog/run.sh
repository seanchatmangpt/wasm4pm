#!/usr/bin/env bash
# PROLOG — SLD resolution back-tracking engine (Colmerauer & Kowalski 1972).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── prolog: horn clauses + query → proof search via SLD resolution ───"
$WPM cognition run --contract prolog --input intent.json --format json | tee result.json
