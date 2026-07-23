#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack is required to bootstrap @wasm4pm/cognition" >&2
  exit 127
fi

wasm-pack build crates/wasm4pm-cognition \
  --target nodejs \
  --out-dir ../../packages/cognition/pkg \
  --out-name wasm4pm_cognition \
  --release \
  --features wasm

wasm-pack build crates/wasm4pm-cognition \
  --target web \
  --out-dir ../../packages/cognition/pkg-web \
  --out-name wasm4pm_cognition \
  --release \
  --features wasm

rm -f packages/cognition/pkg/.gitignore packages/cognition/pkg-web/.gitignore
