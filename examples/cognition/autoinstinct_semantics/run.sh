#!/usr/bin/env bash
# AutoinstinctSemantics example — Schank Conceptual Dependency NLU (ELIZA/SHRDLU lineage).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

echo "─── AutoinstinctSemantics: NLU semantic frame extraction — 'John gave Mary the book' ───"
$WPM cognition run --contract autoinstinct_semantics --input intent.json --format json | tee result.json
