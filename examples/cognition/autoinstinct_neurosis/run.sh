#!/usr/bin/env bash
# AutoinstinctNeurosis example — Colby/Abelson affect-driven belief processing (PARRY lineage).
set -euo pipefail
cd "$(dirname "$0")"

if command -v wpm >/dev/null 2>&1; then
  WPM=wpm
else
  WPM="pnpm --silent --filter @wasm4pm/cli exec wpm"
fi

echo "─── AutoinstinctNeurosis: paranoia/hostility belief network + stimulus processing ───"
$WPM cognition run --contract autoinstinct_neurosis --input intent.json --format json | tee result.json
