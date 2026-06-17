#!/usr/bin/env bash
# SOAR — preference resolution + bounded subgoal on tie impasse (Newell, Laird & Rosenbloom 1987).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── soar: goals + operators → preference resolution with bounded tie-impasse subgoal ───"
$WPM cognition run --contract soar --input intent.json --format json | tee result.json
