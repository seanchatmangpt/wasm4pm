#!/usr/bin/env bash
# Build wasm4pm WASM for a specific deployment profile with optimization and compression.
#
# Usage:
#   bash scripts/build-profile.sh <profile> [--no-compress] [--dry-run]
#
# Profiles: mobile, iot, edge, fog, browser
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

# Size targets (MB) — match CLAUDE.md documented targets
case "$PROFILE" in
  mobile)  TARGET_MB=0.6 ;;
  iot)     TARGET_MB=1.2 ;;
  edge)    TARGET_MB=1.7 ;;
  fog)     TARGET_MB=2.2 ;;
  browser) TARGET_MB=3.0 ;;
  *)       TARGET_MB=3.0 ;;
esac

# Code splitting threshold (MB) — only relevant for very large profiles
CODE_SPLIT_THRESHOLD=3.5

# Map profile to cargo features and wasm-opt flags
case "$PROFILE" in
  mobile)
    FEATURES="mobile"
    WASM_OPT_LEVEL="-Oz"
    DESCRIPTION="~500KB target: minimal features for mobile devices (conformance-basic + hand-rolled stats)"
    ;;
  iot)
    FEATURES="iot"
    WASM_OPT_LEVEL="-Oz"
    DESCRIPTION="~1MB target: basic discovery + conformance for IoT devices"
    ;;
  edge)
    FEATURES="edge"
    WASM_OPT_LEVEL="-Os"
    DESCRIPTION="~1.5MB target: advanced discovery + streaming-basic for CDN workers / edge servers"
    ;;
  fog)
    FEATURES="fog"
    WASM_OPT_LEVEL="-O2"
    DESCRIPTION="~2MB target: all features except POWL, full ML + streaming for fog gateways"
    ;;
  browser)
    FEATURES="browser"
    WASM_OPT_LEVEL="-Oz"
    DESCRIPTION="~2.7MB target: all 38 algorithms, full features for web browsers (DEFAULT)"
    ;;
  *)
    echo "ERROR: Unknown profile '$PROFILE'. Choose: mobile, iot, edge, fog, browser"
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
# Step 2: Build WASM with wasm-pack
# ─────────────────────────────────────────────────────────────────────────────

echo "[1/5] Building WASM with wasm-pack (profile: $PROFILE, features: $FEATURES)..."
mkdir -p "$OUTPUT_DIR"

# wasm-pack build with profile-specific features
cd "$PROJECT_ROOT/wasm4pm"
RUSTFLAGS="${RUSTFLAGS:-} -C target-feature=+simd128" \
  wasm-pack build --target web --out-dir "$OUTPUT_DIR" --out-name wasm4pm --release --mode no-install -- --features "$FEATURES" --quiet

# wasm-pack for --target web produces wasm4pm_bg.wasm, rename it to wasm4pm.wasm
# to maintain compatibility with the rest of the script and simplify the bundle.
# We also need to patch the generated JS to point to the renamed WASM file.
if [ -f "$OUTPUT_DIR/wasm4pm_bg.wasm" ]; then
  mv "$OUTPUT_DIR/wasm4pm_bg.wasm" "$WASM_FILE"
  # Use python to perform the replacement in the JS file to avoid sed/awk as per project standards
  python3 -c "import sys; content = open('$OUTPUT_DIR/wasm4pm.js').read(); open('$OUTPUT_DIR/wasm4pm.js', 'w').write(content.replace('wasm4pm_bg.wasm', 'wasm4pm.wasm'))"
fi

if [ ! -f "$WASM_FILE" ]; then
  echo "ERROR: wasm-pack build failed, WASM file not found at $WASM_FILE"
  exit 1
fi

echo "[✓] WASM built and patched: $WASM_FILE"

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
  echo "[2/5] Optimizing with wasm-opt $WASM_OPT_LEVEL --enable-simd..."
  wasm-opt "$WASM_OPT_LEVEL" --enable-simd "$WASM_FILE" -o "$WASM_OPT_FILE" 2>/dev/null || {
    echo "WARN: wasm-opt optimization failed (likely due to toolchain/instruction compatibility), using unoptimized raw binary"
    WASM_OPT_FILE=""
  }

  if [ -n "$WASM_OPT_FILE" ] && [ -f "$WASM_OPT_FILE" ]; then
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
    echo "    Skipped wasm-opt fallback to raw WASM size: ${RAW_SIZE_MB} MB"
  fi
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

if [ $(python3 -c "print(1 if $RAW_SIZE_MB > $CODE_SPLIT_THRESHOLD else 0)") -eq 1 ]; then
  if command -v wasm-split &> /dev/null; then
    echo "[4/5] Code splitting (binary >${CODE_SPLIT_THRESHOLD}MB detected: ${RAW_SIZE_MB} MB)..."
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
  echo "[4/5] Skipping code splitting (size=${RAW_SIZE_MB}MB below ${CODE_SPLIT_THRESHOLD}MB threshold)"
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
