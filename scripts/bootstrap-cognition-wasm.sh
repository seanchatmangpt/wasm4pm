#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack is required to bootstrap @wasm4pm/cognition" >&2
  exit 127
fi

# packages/cognition/pkg and pkg-web are committed relative symlinks into the
# Rust crate. Build at the canonical targets; wasm-pack cannot create a
# directory over an existing symlink.
wasm-pack build crates/wasm4pm-cognition \
  --target nodejs \
  --out-dir pkg \
  --out-name wasm4pm_cognition \
  --release \
  --features wasm

wasm-pack build crates/wasm4pm-cognition \
  --target web \
  --out-dir pkg-web \
  --out-name wasm4pm_cognition \
  --release \
  --features wasm

rm -f crates/wasm4pm-cognition/pkg/.gitignore \
      crates/wasm4pm-cognition/pkg-web/.gitignore
