#!/usr/bin/env bash
set -euo pipefail

# scripts/release/verify-pack-smoke.sh
# Verifies that the package works after 'npm pack'

source scripts/release/lib/version.sh
VERSION=$(release_version "${1:-}")

echo "--- Running npm pack smoke test for v$VERSION ---"

# 1. Pack the kernel
cd packages/kernel
npm pack
TARBALL="wasm4pm-kernel-$VERSION.tgz"

# 2. Create temp test project
TEMP_DIR=$(mktemp -d)
echo "Testing in $TEMP_DIR"

tar -xzf "$TARBALL" -C "$TEMP_DIR"

# Simple check that the file exists and is readable
if [ ! -f "$TEMP_DIR/package/package.json" ]; then
  echo "ERROR: Package not packed correctly"
  exit 1
fi

echo "[PASS] npm pack smoke test passed."

# Cleanup
rm -rf "$TEMP_DIR"
cd -
rm "packages/kernel/$TARBALL"
