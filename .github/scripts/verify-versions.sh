#!/bin/bash

# Version consistency verification script
# Ensures Cargo.toml and package.json versions match

set -e

echo "========================================"
echo "Version Consistency Check"
echo "========================================"

# Extract versions
PACKAGE_VERSION=$(node -p "require('./package.json').version")
WASM4PM_VERSION=$(node -p "require('./wasm4pm/package.json').version")
WASM4PM_CARGO=$(grep '^version' wasm4pm/Cargo.toml | head -1 | cut -d'"' -f2)

echo "Root package.json:     $PACKAGE_VERSION"
echo "wasm4pm/package.json:  $WASM4PM_VERSION"
echo "wasm4pm/Cargo.toml:    $WASM4PM_CARGO"

FAILED=0

# Check root and wasm4pm match
if [ "$PACKAGE_VERSION" != "$WASM4PM_VERSION" ]; then
    echo "✗ ERROR: Root package.json ($PACKAGE_VERSION) != wasm4pm/package.json ($WASM4PM_VERSION)"
    FAILED=1
else
    echo "✓ Root and wasm4pm versions match"
fi

# Check wasm4pm package and Cargo match
if [ "$WASM4PM_VERSION" != "$WASM4PM_CARGO" ]; then
    echo "✗ ERROR: wasm4pm/package.json ($WASM4PM_VERSION) != wasm4pm/Cargo.toml ($WASM4PM_CARGO)"
    FAILED=1
else
    echo "✓ wasm4pm package and Cargo versions match"
fi

# Check all @wasm4pm/* packages
if [ -d "packages" ]; then
    echo ""
    echo "Checking @wasm4pm/* packages..."
    for pkg in packages/*/package.json; do
        PKG_NAME=$(node -p "require('$pkg').name")
        PKG_VERSION=$(node -p "require('$pkg').version")

        if [ "$PKG_VERSION" != "$WASM4PM_VERSION" ]; then
            echo "✗ ERROR: $PKG_NAME version ($PKG_VERSION) != root version ($WASM4PM_VERSION)"
            FAILED=1
        else
            echo "✓ $PKG_NAME: $PKG_VERSION"
        fi
    done
fi

echo ""
echo "========================================"
if [ $FAILED -eq 0 ]; then
    echo "✓ All versions are consistent"
    exit 0
else
    echo "✗ Version inconsistencies detected"
    exit 1
fi
