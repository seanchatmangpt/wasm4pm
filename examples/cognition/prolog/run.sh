#!/usr/bin/env bash
# Prolog8 — flat-term SLD resolution with Robinson unification, grandparent derivation.
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  REPO_ROOT="$(cd ../../.. && pwd)"
  WPM="$REPO_ROOT/apps/wasm4pm/dist/bin/wpm.js"
fi

echo "─── prolog: parent/2 facts → grandparent(?0,?2) via Robinson unification ───"
$WPM cognition run --contract prolog --input intent.json --format json | tee result.json
