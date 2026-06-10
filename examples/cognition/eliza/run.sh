#!/usr/bin/env bash
# ELIZA — keystack priority pattern matching, Rogerian therapist script (Weizenbaum 1966).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── eliza: patient message → empathic Rogerian reflection via keystack ───"
$WPM cognition run --contract eliza --input intent.json --format json | tee result.json
