#!/usr/bin/env bash
# cognition-doctor.sh — Probes the cognition layer per architecture diagram #19.
# Verifies registry vs runtime truth (diagram #20).
#
# Exit codes:
#   0 — All checks pass
#   1 — One or more checks failed
#
# Usage:
#   bash crates/wasm4pm-cognition/scripts/cognition-doctor.sh

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

FAIL=0
PASS=0

pass() { echo "   PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "   FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== Cognition Doctor ==="
echo "    Root: $ROOT"
echo

# ── Check 1: Workspace member registered ──────────────────────────────────────
echo "1. Workspace member registered..."
if grep -q '"crates/wasm4pm-cognition"' Cargo.toml 2>/dev/null || \
   grep -q 'crates/wasm4pm-cognition' Cargo.toml 2>/dev/null; then
    pass "crates/wasm4pm-cognition in workspace.members"
else
    fail "crates/wasm4pm-cognition NOT found in Cargo.toml workspace.members"
fi

# ── Check 2: Native cargo check ───────────────────────────────────────────────
echo "2. Native cargo check..."
if cargo check -p wasm4pm-cognition >/dev/null 2>&1; then
    pass "native check passes"
else
    fail "native check FAILED — run: cargo check -p wasm4pm-cognition"
fi

# ── Check 3: WASM cargo check ─────────────────────────────────────────────────
echo "3. WASM cargo check (wasm32-unknown-unknown)..."
if cargo check -p wasm4pm-cognition --features wasm --target wasm32-unknown-unknown >/dev/null 2>&1; then
    pass "WASM check passes"
else
    fail "WASM check FAILED — run: cargo check -p wasm4pm-cognition --features wasm --target wasm32-unknown-unknown"
fi

# ── Check 4: All 9 breeds present (file exists and non-empty) ─────────────────
echo "4. All 9 breeds present..."
BREEDS=(frame cbr dendral strips prolog production_rules gps soar hearsay)
ALL_BREEDS_OK=1
for breed in "${BREEDS[@]}"; do
    path="crates/wasm4pm-cognition/src/breeds/${breed}.rs"
    dir_path="crates/wasm4pm-cognition/src/breeds/${breed}"
    if [ -s "$path" ]; then
        : # file exists and non-empty
    elif [ -d "$dir_path" ] && [ -f "${dir_path}/mod.rs" ]; then
        : # split into submodule with mod.rs
    else
        fail "breed missing or empty: $breed (expected $path or $dir_path/mod.rs)"
        ALL_BREEDS_OK=0
    fi
done
if [ "$ALL_BREEDS_OK" -eq 1 ]; then
    pass "all 9 breeds present (frame, cbr, dendral, strips, prolog, production_rules, gps, soar, hearsay)"
fi

# ── Check 5: No `pub struct Stub` in any breed file ───────────────────────────
echo "5. No stubs in breed implementations..."
BREED_DIR="crates/wasm4pm-cognition/src/breeds"
if [ -d "$BREED_DIR" ]; then
    if grep -rn "pub struct Stub" "$BREED_DIR/" 2>/dev/null | grep -q .; then
        fail "stub types detected in breeds/ — grep: $(grep -rn 'pub struct Stub' "$BREED_DIR/" | head -3)"
    else
        pass "no pub struct Stub in breeds/"
    fi
else
    fail "breeds/ directory does not exist at $BREED_DIR"
fi

# ── Check 6: All 8 adversarial detectors present ──────────────────────────────
echo "6. All 8 adversarial detectors present..."
DETECTORS=(stub_gate human_authority missing_evidence central_firehose self_certify bench_missing repair_weakens replay_broken)
ALL_DETECTORS_OK=1
for det in "${DETECTORS[@]}"; do
    path="crates/wasm4pm-cognition/src/autosystems/adversarial/${det}.rs"
    if [ ! -f "$path" ]; then
        fail "adversarial detector missing: ${det}.rs"
        ALL_DETECTORS_OK=0
    fi
done
if [ "$ALL_DETECTORS_OK" -eq 1 ]; then
    pass "all 8 adversarial detectors present"
fi

# ── Check 7: WASM exports present in wasm.rs ─────────────────────────────────
echo "7. WASM exports present in src/wasm.rs..."
WASM_RS="crates/wasm4pm-cognition/src/wasm.rs"
EXPECTED_EXPORTS=(cognition_show cognition_run cognition_verify cognition_replay system_build system_verify)
if [ ! -f "$WASM_RS" ]; then
    fail "$WASM_RS does not exist"
else
    ALL_EXPORTS_OK=1
    for export in "${EXPECTED_EXPORTS[@]}"; do
        if ! grep -q "pub fn ${export}" "$WASM_RS"; then
            fail "WASM export missing: $export in $WASM_RS"
            ALL_EXPORTS_OK=0
        fi
    done
    if [ "$ALL_EXPORTS_OK" -eq 1 ]; then
        pass "all 6 WASM exports present (cognition_show, cognition_run, cognition_verify, cognition_replay, system_build, system_verify)"
    fi
fi

# ── Check 8: TS facade present ────────────────────────────────────────────────
echo "8. TS facade present..."
TS_INDEX="packages/cognition/src/index.ts"
TS_INIT="packages/cognition/src/init.ts"
TS_OK=1
if [ ! -f "$TS_INDEX" ]; then
    fail "TS facade missing: $TS_INDEX"
    TS_OK=0
fi
if [ ! -f "$TS_INIT" ]; then
    fail "TS facade missing: $TS_INIT"
    TS_OK=0
fi
if [ "$TS_OK" -eq 1 ]; then
    pass "TS facade present (packages/cognition/src/index.ts + init.ts)"
fi

# ── Check 9: CLI integration present and stub-free ────────────────────────────
echo "9. CLI integration present and stub-free..."
CLI_CMD="apps/wasm4pm/src/commands/cognition.ts"
if [ ! -f "$CLI_CMD" ]; then
    fail "CLI command missing: $CLI_CMD"
else
    # Detect console.log placeholder stubs
    if grep -q "(stub)" "$CLI_CMD" 2>/dev/null; then
        fail "console.log stub detected in $CLI_CMD"
    else
        pass "CLI command present and no (stub) markers detected"
    fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "=== Cognition Doctor Summary ==="
echo "    Passed: $PASS"
echo "    Failed: $FAIL"
echo

if [ "$FAIL" -gt 0 ]; then
    echo "=== Cognition Doctor: FAILED ($FAIL check(s) failed) ==="
    exit 1
else
    echo "=== Cognition Doctor: ALL CHECKS PASSED ==="
    exit 0
fi
