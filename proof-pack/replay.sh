#!/usr/bin/env bash
set -euo pipefail

echo "=== wasm4pm Proof-Pack Replay ==="

echo ""
echo "[1/3] Running Rust unit tests for wasm4pm-cognition..."
cargo test -p wasm4pm-cognition

echo ""
echo "[2/3] Running TypeScript tests for @wasm4pm/cognition..."
pnpm --filter @wasm4pm/cognition test --run

echo ""
echo "[3/3] Checking breed registry..."
bash crates/wasm4pm-cognition/breeds/check_registry.sh

echo ""
echo "=== Proof-Pack Replay complete ==="
