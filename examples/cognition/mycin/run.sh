#!/usr/bin/env bash
# MYCIN example — forward chaining + Shortliffe CF combining for diagnosis.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

echo "─── MYCIN: gram_positive_cocci + strep + throat → ? ───"
$WPM cognition run --contract mycin --input intent.json --format json | tee result.json
