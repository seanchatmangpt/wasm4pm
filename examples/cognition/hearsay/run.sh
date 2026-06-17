#!/usr/bin/env bash
# HEARSAY-II — KSAR opportunistic scheduler over speech hypothesis blackboard (Erman & Lesser 1980).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── hearsay: speech-signal + lexical hypotheses → phrase recognition via KSAR ───"
$WPM cognition run --contract hearsay --input intent.json --format json | tee result.json
