#!/usr/bin/env bash
# version_space: candidate elimination learning
set -euo pipefail
cd "$(dirname "$0")"
if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="node $REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi
echo "─── version_space: learning EnjoySport concept ───"
$WPM cognition run --contract version_space --input intent.json --format json | tee result.json
