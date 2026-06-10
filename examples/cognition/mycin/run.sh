#!/usr/bin/env bash
# MYCIN example — forward chaining + Shortliffe CF combining for diagnosis.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── MYCIN: gram_positive_cocci + strep + throat → ? ───"
$WPM cognition run --contract mycin --input intent.json --format json | tee result.json
