#!/usr/bin/env bash
# DENDRAL — constrained structure enumeration with forbid/require rules (Buchanan & Feigenbaum 1978).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── dendral: molecular formula + constraints → enumerate valid candidate structures ───"
$WPM cognition run --contract dendral --input intent.json --format json | tee result.json
