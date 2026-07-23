#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack is required to bootstrap @wasm4pm/cognition" >&2
  exit 127
fi

# packages/cognition/pkg is a committed relative symlink into the Rust crate.
# Build its target directly because wasm-pack cannot create a directory over a
# symlink. pkg-web has no committed symlink, so build the package-local
# directory that pnpm resolves from packages/cognition/package.json.
wasm-pack build crates/wasm4pm-cognition \
  --target nodejs \
  --out-dir pkg \
  --out-name wasm4pm_cognition \
  --release \
  --features wasm

wasm-pack build crates/wasm4pm-cognition \
  --target web \
  --out-dir ../../packages/cognition/pkg-web \
  --out-name wasm4pm_cognition \
  --release \
  --features wasm

rm -f crates/wasm4pm-cognition/pkg/.gitignore \
      packages/cognition/pkg-web/.gitignore
