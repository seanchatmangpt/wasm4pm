#!/usr/bin/env bash
# build-all.sh — Full cognition layer build pipeline.
# Orchestrates: Rust native check → WASM check → wasm-pack (nodejs + bundler)
#               → TS boundary build → CLI build.
# Per architecture diagrams #11 (Phase 1 Tear-Down/Rebuild) and #12 (Rust-to-TS Build Pipeline).
#
# Usage:
#   bash crates/wasm4pm-cognition/scripts/build-all.sh
#   bash crates/wasm4pm-cognition/scripts/build-all.sh --skip-ts
#   bash crates/wasm4pm-cognition/scripts/build-all.sh --skip-wasm-pack

set -euo pipefail

SKIP_TS="${1:-}"
SKIP_WASM_PACK="${2:-}"
ROOT="$(git rev-parse --show-toplevel)"

echo "=== Cognition Build Pipeline ==="
echo "  Root: $ROOT"
echo

# ── Step 1: Native type-check ─────────────────────────────────────────────────
echo "[1/6] Native cargo check..."
cargo check -p wasm4pm-cognition 2>&1 | sed 's/^/       /'
echo "      OK"

# ── Step 2: WASM type-check ───────────────────────────────────────────────────
echo "[2/6] WASM cargo check (wasm32-unknown-unknown)..."
cargo check -p wasm4pm-cognition \
    --features wasm \
    --target wasm32-unknown-unknown 2>&1 | sed 's/^/       /'
echo "      OK"

# ── Step 3: wasm-pack nodejs ──────────────────────────────────────────────────
if [ "$SKIP_WASM_PACK" = "--skip-wasm-pack" ]; then
    echo "[3/6] wasm-pack nodejs... SKIPPED (--skip-wasm-pack)"
else
    echo "[3/6] wasm-pack build --target nodejs..."
    (cd "$ROOT/crates/wasm4pm-cognition" && \
        wasm-pack build --target nodejs --features wasm --out-dir pkg 2>&1 | sed 's/^/       /')
    echo "      OK — pkg/ written"
fi

# ── Step 4: wasm-pack bundler ─────────────────────────────────────────────────
if [ "$SKIP_WASM_PACK" = "--skip-wasm-pack" ]; then
    echo "[4/6] wasm-pack bundler... SKIPPED (--skip-wasm-pack)"
else
    echo "[4/6] wasm-pack build --target bundler..."
    (cd "$ROOT/crates/wasm4pm-cognition" && \
        wasm-pack build --target bundler --features wasm --out-dir pkg-bundler 2>&1 | sed 's/^/       /')
    echo "      OK — pkg-bundler/ written"
fi

# ── Step 5: TS boundary build ───────────────────────────────────────────────────
if [ "$SKIP_TS" = "--skip-ts" ]; then
    echo "[5/6] TS boundary build... SKIPPED (--skip-ts)"
elif [ -f "$ROOT/packages/cognition/package.json" ]; then
    echo "[5/6] Building @wasm4pm/cognition TS boundary..."
    (cd "$ROOT/packages/cognition" && pnpm build 2>&1 | sed 's/^/       /')
    echo "      OK"
else
    echo "[5/6] TS boundary (packages/cognition) not yet present — SKIP"
fi

# ── Step 6: CLI build ─────────────────────────────────────────────────────────
if [ "$SKIP_TS" = "--skip-ts" ]; then
    echo "[6/6] CLI build... SKIPPED (--skip-ts)"
elif [ -f "$ROOT/apps/wasm4pm/package.json" ]; then
    echo "[6/6] Building wpm CLI (apps/wasm4pm)..."
    (cd "$ROOT/apps/wasm4pm" && pnpm build 2>&1 | sed 's/^/       /')
    echo "      OK"
else
    echo "[6/6] CLI (apps/wasm4pm) not found — SKIP"
fi

echo
echo "=== Cognition Build Pipeline: COMPLETE ==="
