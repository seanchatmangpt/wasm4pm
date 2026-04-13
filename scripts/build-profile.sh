#!/usr/bin/env bash
# Build pictl WASM for a specific deployment profile
# Usage: bash scripts/build-profile.sh <browser|edge|fog|iot|cloud>
set -euo pipefail

PROFILE=${1:?Usage: build-profile.sh <browser|edge|fog|iot|cloud>}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/dist/pictl-${PROFILE}"

# Map profile to cargo features
case "$PROFILE" in
  browser) FEATURES="browser" ;;
  edge)    FEATURES="edge" ;;
  fog)     FEATURES="fog" ;;
  iot)     FEATURES="iot" ;;
  cloud)   FEATURES="cloud" ;;
  *)
    echo "ERROR: Unknown profile '$PROFILE'. Choose: browser, edge, fog, iot, cloud"
    exit 1
    ;;
esac

echo "=== Building pictl for profile: $PROFILE ==="
echo "Features: $FEATURES"
echo "Output:   $OUTPUT_DIR/"
echo ""

# Build WASM with profile-specific features
cargo build --release --target wasm32-unknown-unknown -p pictl --features "$FEATURES"

# Copy to profile-specific directory
mkdir -p "$OUTPUT_DIR"
cp "$PROJECT_ROOT/target/wasm32-unknown-unknown/release/pictl.wasm" "$OUTPUT_DIR/pictl.wasm"

# Run wasm-opt for size optimization on constrained profiles
if command -v wasm-opt &> /dev/null; then
  case "$PROFILE" in
    browser|iot)
      echo "Optimizing with wasm-opt -Oz..."
      wasm-opt -Oz "$OUTPUT_DIR/pictl.wasm" -o "$OUTPUT_DIR/pictl.wasm.tmp" \
        && mv "$OUTPUT_DIR/pictl.wasm.tmp" "$OUTPUT_DIR/pictl.wasm"
      ;;
    edge)
      echo "Optimizing with wasm-opt -Os..."
      wasm-opt -Os "$OUTPUT_DIR/pictl.wasm" -o "$OUTPUT_DIR/pictl.wasm.tmp" \
        && mv "$OUTPUT_DIR/pictl.wasm.tmp" "$OUTPUT_DIR/pictl.wasm"
      ;;
    fog)
      echo "Optimizing with wasm-opt -O2..."
      wasm-opt -O2 "$OUTPUT_DIR/pictl.wasm" -o "$OUTPUT_DIR/pictl.wasm.tmp" \
        && mv "$OUTPUT_DIR/pictl.wasm.tmp" "$OUTPUT_DIR/pictl.wasm"
      ;;
    cloud)
      # No wasm-opt for cloud — full features, prioritize correctness
      ;;
  esac
fi

# Report size
if [ "$(uname)" = "Darwin" ]; then
  SIZE=$(stat -f%z "$OUTPUT_DIR/pictl.wasm")
else
  SIZE=$(stat -c%s "$OUTPUT_DIR/pictl.wasm")
fi
SIZE_MB=$(python3 -c "print(f'{$SIZE / 1048576:.2f}')")

echo ""
echo "Built: dist/pictl-${PROFILE}/pictl.wasm (${SIZE_MB} MB)"
