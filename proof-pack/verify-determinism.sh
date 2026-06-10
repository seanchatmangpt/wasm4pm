#!/usr/bin/env bash
set -euo pipefail

echo "=== Determinism Verification ==="

cargo test -p wasm4pm-cognition -- determinism --quiet

echo ""
echo "=== Determinism verification complete ==="
