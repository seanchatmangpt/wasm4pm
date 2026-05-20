#!/usr/bin/env bash
set -euo pipefail

# scripts/release/prepublish-gauntlet.sh
# The master gate for publication.

source scripts/release/lib/version.sh
VERSION=$(release_version "${1:-}")

echo "=== STARTING PREPUBLISH GAUNTLET FOR v$VERSION ==="

# 1. Clean build
echo "--- 1. Clean Build ---"
pnpm run clean
pnpm run build:all

# 2. Lint & Type Check
echo "--- 2. Lint & Type Check ---"
pnpm run lint

# 3. Native Tests (Rust)
echo "--- 3. Native Rust Tests ---"
cd wasm4pm
cargo test --lib
cd ..

# 4. Kernel Tests (TypeScript)
echo "--- 4. Kernel TS Tests ---"
cd packages/kernel
npm run test
cd ../..

# 5. CLI Parity Gate
echo "--- 5. CLI Parity Gate ---"
npm run cli:parity

# 6. Examples Gate (8x8 algorithms)
echo "--- 6. Examples Gate ---"
npm run examples:gate

# 7. Algorithm Behavior Evidence
echo "--- 7. Algorithm Behavior Evidence ---"
npm run release:algorithm-behavior
npm run release:verify-algorithm-behavior

# 8. Forbidden Term Check
echo "--- 8. Forbidden Terms ---"
npm run release:forbidden

# 8. Pack Smoke Test
echo "--- 8. Pack Smoke Test ---"
npm run prepublish:pack-smoke

# 9. Release Certificate
echo "--- 9. Generating Release Certificate ---"
npm run release:certificate

# 10. Authenticity Verification
echo "--- 10. Verifying Receipt Authenticity ---"
tsx scripts/release/verify-receipt-authenticity.ts

echo "=== GAUNTLET PASSED FOR v$VERSION ==="
