#!/usr/bin/env bash
# Build all 5 pictl deployment profiles
# Usage: bash scripts/build-all-profiles.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILES=("browser" "iot" "edge" "fog" "cloud")

echo "========================================"
echo " Building all pictl deployment profiles"
echo "========================================"
echo ""

for PROFILE in "${PROFILES[@]}"; do
  echo "---"
  bash "$SCRIPT_DIR/build-profile.sh" "$PROFILE"
  echo ""
done

echo "========================================"
echo " Build Summary"
echo "========================================"

for PROFILE in "${PROFILES[@]}"; do
  WASM_FILE="$PROJECT_ROOT/dist/pictl-${PROFILE}/pictl.wasm"
  if [ -f "$WASM_FILE" ]; then
    if [ "$(uname)" = "Darwin" ]; then
      SIZE=$(stat -f%z "$WASM_FILE")
    else
      SIZE=$(stat -c%s "$WASM_FILE")
    fi
    SIZE_MB=$(python3 -c "print(f'{$SIZE / 1048576:.2f}')")
    printf "  %-10s %8s MB  %s\n" "${PROFILE}:" "$SIZE_MB" "$WASM_FILE"
  else
    printf "  %-10s %8s     MISSING\n" "${PROFILE}:"
  fi
done

echo ""
echo "All profiles built in: $PROJECT_ROOT/dist/"
