#!/usr/bin/env bash
# generate-capability-matrix.sh — wrapper for generate_capability_matrix.py
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

VERSION="${VERSION:-26.5.28}"
OUTPUT_DIR="wasm4pm/target/wasm4pm-v${VERSION}"
mkdir -p "$OUTPUT_DIR"

python3 scripts/generate_capability_matrix.py \
  --src-dir wasm4pm/src \
  --tests-dir wasm4pm/tests \
  --cargo-toml wasm4pm/Cargo.toml \
  --output "${OUTPUT_DIR}/capability-matrix.json" \
  --version "$VERSION"
