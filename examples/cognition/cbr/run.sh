#!/usr/bin/env bash
# CBR — 4R cycle: Retrieve (Jaccard), Reuse (BTreeMap merge), Revise, Retain (BLAKE3 id).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── cbr: query case → retrieve top match (Jaccard), reuse, revise, retain ───"
$WPM cognition run --contract cbr --input intent.json --format json | tee result.json
