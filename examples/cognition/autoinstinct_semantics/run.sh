#!/usr/bin/env bash
# AutoinstinctSemantics — Conceptual Dependency ATRANS/PTRANS/MTRANS parsing.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── autoinstinct_semantics: CD parse — 'John gave Mary the book' → ATRANS primitive ───"
$WPM cognition run --contract autoinstinct_semantics --input intent.json --format json | tee result.json
