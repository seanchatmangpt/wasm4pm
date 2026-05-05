#!/usr/bin/env bash
# Build wasm4pm WASM for a specific deployment profile with optimization and compression.
#
# Usage:
#   bash scripts/build-profile.sh <profile> [--no-compress] [--dry-run]
#
# Profiles: browser, edge, fog, iot, cloud
# Options:
#   --no-compress : Skip Brotli compression step
#   --dry-run     : Check without building
#
# Build steps:
#   1. Cargo build with profile-specific features (pm4wasm tiers)
#   2. wasm-opt optimization per profile (-Oz / -Os / -O2 / none)
#   3. Brotli compression (6:1 ratio expected)
#   4. Code splitting for cloud if binary >4.5MB (optional via wasm-split)
#   5. Size verification against targets
#
set -euo pipefail

PROFILE=${1:?Usage: build-profile.sh <profile> [--no-compress] [--dry-run]}
DRY_RUN=false
NO_COMPRESS=false

# Parse optional flags
for arg in "${@:2}"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --no-compress) NO_COMPRESS=true ;;
    *)            echo "ERROR: Unknown flag '$arg'"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/dist/wasm4pm-${PROFILE}"
WASM_FILE="$OUTPUT_DIR/wasm4pm.wasm"
WASM_OPT_FILE="$OUTPUT_DIR/wasm4pm.opt.wasm"
WASM_BROTLI_FILE="$OUTPUT_DIR/wasm4pm.wasm.br"

# Size targets (MB)
case "$PROFILE" in
  cloud)   TARGET_MB=5.0 ;;
  *)       TARGET_MB=4.0 ;;
esac

# Code splitting threshold (MB)
CODE_SPLIT_THRESHOLD=4.5

# Map profile to cargo features and wasm-opt flags
case "$PROFILE" in
  browser)
    FEATURES="browser"
    WASM_OPT_LEVEL="-Oz"
    DESCRIPTION="~18 basic discovery algorithms, hand-rolled stats, size-optimized"
    ;;
  edge)
    FEATURES="edge"
    WASM_OPT_LEVEL="-Os"
    DESCRIPTION="~25 discovery + ML algorithms, balanced performance/size"
    ;;
  fog)
    FEATURES="fog"
    WASM_OPT_LEVEL="-O2"
    DESCRIPTION="Full feature set (Tier 2), speed-optimized for edge gateway"
    ;;
  iot)
    FEATURES="iot"
    WASM_OPT_LEVEL="-Oz"
    DESCRIPTION="Minimal feature set, extreme size optimization for IoT"
    ;;
  cloud)
    FEATURES="cloud"
    WASM_OPT_LEVEL=""
    DESCRIPTION="All 41 algorithms, no wasm-opt (preserve symbols for debugging)"
    ;;
  *)
    echo "ERROR: Unknown profile '$PROFILE'. Choose: browser, edge, fog, iot, cloud"
    exit 1
    ;;
esac


echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  wasm4pm WASM Build Orchestration — Profile: $PROFILE"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Profile Description: $DESCRIPTION"
echo "Target Size Limit:   ${TARGET_MB} MB (uncompressed)"
echo "Features:            $FEATURES"
echo "Output Directory:    $OUTPUT_DIR"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Verify Prerequisites
# ─────────────────────────────────────────────────────────────────────────────

if [ "$DRY_RUN" = true ]; then
  echo "[DRY-RUN] Skipping actual build"
  exit 0
fi

if ! command -v cargo &> /dev/null; then
  echo "ERROR: cargo not found in PATH. Install Rust."
  exit 1
fi

WASM_OPT_AVAILABLE=false
if command -v wasm-opt &> /dev/null; then
  WASM_OPT_AVAILABLE=true
  WASM_OPT_VERSION=$(wasm-opt --version)
  echo "[OK] wasm-opt available: $WASM_OPT_VERSION"
fi

BROTLI_AVAILABLE=false
if command -v brotli &> /dev/null; then
  BROTLI_AVAILABLE=true
  echo "[OK] brotli available"
fi

if [ "$NO_COMPRESS" = false ] && [ "$BROTLI_AVAILABLE" = false ]; then
  echo "[WARN] brotli not found, compression will be skipped"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Build WASM with Cargo
# ─────────────────────────────────────────────────────────────────────────────

echo "[1/5] Building WASM with Cargo (profile: $PROFILE, features: $FEATURES)..."
mkdir -p "$OUTPUT_DIR"

# Cargo build with profile-specific features
cd "$PROJECT_ROOT/wasm4pm"
RUSTFLAGS="${RUSTFLAGS:-} -C target-feature=+simd128" \
  cargo build --release --target wasm32-unknown-unknown \
    --features "$FEATURES" \
    --quiet 2>&1 | grep -v "warning:" || true

# Copy to output directory
BUILT_WASM="$PROJECT_ROOT/target/wasm32-unknown-unknown/release/wasm4pm.wasm"
if [ ! -f "$BUILT_WASM" ]; then
  echo "ERROR: Cargo build failed, WASM file not found at $BUILT_WASM"
  exit 1
fi

cp "$BUILT_WASM" "$WASM_FILE"
echo "[✓] WASM built: $WASM_FILE"

# Report raw size
if [ "$(uname)" = "Darwin" ]; then
  RAW_SIZE_BYTES=$(stat -f%z "$WASM_FILE")
else
  RAW_SIZE_BYTES=$(stat -c%s "$WASM_FILE")
fi
RAW_SIZE_MB=$(python3 -c "print(f'{$RAW_SIZE_BYTES / 1048576:.2f}')")
echo "    Size: ${RAW_SIZE_MB} MB (raw)"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: wasm-opt Optimization (per profile)
# ─────────────────────────────────────────────────────────────────────────────

if [ "$WASM_OPT_AVAILABLE" = true ] && [ -n "$WASM_OPT_LEVEL" ]; then
  echo "[2/5] Optimizing with wasm-opt $WASM_OPT_LEVEL..."
  wasm-opt "$WASM_OPT_LEVEL" "$WASM_FILE" -o "$WASM_OPT_FILE" 2>/dev/null || {
    echo "ERROR: wasm-opt optimization failed"
    exit 1
  }

  if [ "$(uname)" = "Darwin" ]; then
    OPT_SIZE_BYTES=$(stat -f%z "$WASM_OPT_FILE")
  else
    OPT_SIZE_BYTES=$(stat -c%s "$WASM_OPT_FILE")
  fi
  OPT_SIZE_MB=$(python3 -c "print(f'{$OPT_SIZE_BYTES / 1048576:.2f}')")
  REDUCTION_PCT=$(python3 -c "print(f'{(1 - $OPT_SIZE_BYTES / $RAW_SIZE_BYTES) * 100:.1f}')")

  # Replace original with optimized
  mv "$WASM_OPT_FILE" "$WASM_FILE"
  echo "[✓] Optimization complete: ${OPT_SIZE_MB} MB (-${REDUCTION_PCT}%)"
  RAW_SIZE_MB="$OPT_SIZE_MB"
else
  echo "[2/5] Skipping wasm-opt (not available or cloud profile)"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Brotli Compression
# ─────────────────────────────────────────────────────────────────────────────

if [ "$NO_COMPRESS" = false ] && [ "$BROTLI_AVAILABLE" = true ]; then
  echo "[3/5] Compressing with Brotli (quality 6)..."
  brotli -6 -f -k "$WASM_FILE" -o "$WASM_BROTLI_FILE" 2>/dev/null || {
    echo "ERROR: Brotli compression failed"
    exit 1
  }

  if [ "$(uname)" = "Darwin" ]; then
    COMPRESSED_SIZE_BYTES=$(stat -f%z "$WASM_BROTLI_FILE")
  else
    COMPRESSED_SIZE_BYTES=$(stat -c%s "$WASM_BROTLI_FILE")
  fi
  COMPRESSED_SIZE_MB=$(python3 -c "print(f'{$COMPRESSED_SIZE_BYTES / 1048576:.2f}')")
  RATIO=$(python3 -c "print(f'{$RAW_SIZE_BYTES / $COMPRESSED_SIZE_BYTES:.1f}')")

  echo "[✓] Compression complete: ${COMPRESSED_SIZE_MB} MB (${RATIO}:1 ratio)"
else
  echo "[3/5] Skipping compression (--no-compress or brotli unavailable)"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Code Splitting for Cloud (Optional)
# ─────────────────────────────────────────────────────────────────────────────

if [ "$PROFILE" = "cloud" ] && [ $(python3 -c "print(1 if $RAW_SIZE_MB > $CODE_SPLIT_THRESHOLD else 0)") -eq 1 ]; then
  if command -v wasm-split &> /dev/null; then
    echo "[4/5] Code splitting (binary >4.5MB detected: ${RAW_SIZE_MB} MB)..."
    wasm-split "$WASM_FILE" \
      --export-prefix wasm4pm_core \
      --secondary-output "$OUTPUT_DIR/wasm4pm-advanced.wasm" \
      -o "$WASM_FILE.tmp" 2>/dev/null || {
      echo "WARN: wasm-split failed, skipping code splitting"
    }

    if [ -f "$WASM_FILE.tmp" ]; then
      mv "$WASM_FILE.tmp" "$WASM_FILE"
      echo "[✓] Code splitting complete"
      echo "    Core:     $WASM_FILE"
      echo "    Advanced: $OUTPUT_DIR/wasm4pm-advanced.wasm"
    fi
  else
    echo "[4/5] Skipping code splitting (wasm-split not available)"
  fi
else
  echo "[4/5] Skipping code splitting (profile=$PROFILE, size=${RAW_SIZE_MB}MB)"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Size Verification
# ─────────────────────────────────────────────────────────────────────────────

echo "[5/5] Verifying binary size against target..."

IS_PASS=$(python3 -c "print(1 if $RAW_SIZE_MB <= $TARGET_MB else 0)")
if [ "$IS_PASS" -eq 1 ]; then
  echo "[✓] PASS: ${RAW_SIZE_MB} MB ≤ ${TARGET_MB} MB target"
  EXIT_CODE=0
else
  echo "[✗] FAIL: ${RAW_SIZE_MB} MB exceeds ${TARGET_MB} MB target"
  EXIT_CODE=1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  Build Summary"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo "Profile:         $PROFILE"
echo "Raw Size:        ${RAW_SIZE_MB} MB"
if [ "$BROTLI_AVAILABLE" = true ] && [ -f "$WASM_BROTLI_FILE" ]; then
  echo "Compressed:      ${COMPRESSED_SIZE_MB} MB (${RATIO}:1)"
fi
echo "Target Limit:    ${TARGET_MB} MB"
echo "Status:          $([ $EXIT_CODE -eq 0 ] && echo "✓ PASS" || echo "✗ FAIL")"
echo ""

exit $EXIT_CODE
