#!/usr/bin/env bash
# ocpm_route_discoverer: discover object routes
set -euo pipefail
cd "$(dirname "$0")"
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi
echo "─── ocpm_route_discoverer: discover object routes ───"
$WPM cognition run --contract ocpm_route_discoverer --input intent.json --format json | tee result.json