#!/usr/bin/env bash
# MYCIN — Shortliffe CF combining for bacterial infection diagnosis (Shortliffe 1976).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── mycin: gram_positive_cocci + strep + throat_culture → antibiotic recommendation ───"
$WPM cognition run --contract mycin --input intent.json --format json | tee result.json
