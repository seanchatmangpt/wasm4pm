#!/usr/bin/env bash
# HEARSAY — Blackboard architecture with competing knowledge sources (1971)
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../../.. && pwd)"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── HEARSAY: blackboard hypothesis voting ───"
$WPM cognition run --contract hearsay --input intent.json --format json | tee result.json
