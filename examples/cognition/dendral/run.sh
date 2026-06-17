#!/usr/bin/env bash
# DENDRAL — mass spectrometry molecular structure constraint pruning (Lederberg 1969).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── dendral: formula + spectrometry peaks → prune isomer candidates ───"
$WPM cognition run --contract dendral --input intent.json --format json | tee result.json
