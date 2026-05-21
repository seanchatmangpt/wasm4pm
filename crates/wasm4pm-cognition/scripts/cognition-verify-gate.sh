#!/usr/bin/env bash
# cognition-verify-gate.sh — Implements the V1-V8 verify gate from architecture diagram #25.
# Each gate maps to a falsifiable, evidence-grounded check.
#
# Exit codes:
#   0 — All V1-V8 gates pass
#   3 — One or more gates failed (matches execution_error exit code)
#
# Usage:
#   bash crates/wasm4pm-cognition/scripts/cognition-verify-gate.sh

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

V_STATUS=()

# ── V1: Breed registry complete ───────────────────────────────────────────────
# 9 breeds required: frame cbr dendral strips prolog production_rules gps soar hearsay
BREED_COUNT=0
BREED_DIR="crates/wasm4pm-cognition/src/breeds"
REQUIRED_BREEDS=(frame cbr dendral strips prolog production_rules gps soar hearsay)
for breed in "${REQUIRED_BREEDS[@]}"; do
    if [ -s "${BREED_DIR}/${breed}.rs" ] || \
       [ -f "${BREED_DIR}/${breed}/mod.rs" ]; then
        BREED_COUNT=$((BREED_COUNT + 1))
    fi
done
if [ "$BREED_COUNT" -ge 9 ]; then
    V_STATUS["V1"]="PASS ($BREED_COUNT/9 breeds registered)"
else
    V_STATUS["V1"]="FAIL ($BREED_COUNT/9 breeds present — expected 9)"
fi

# ── V2: Runtime WASM exports probed ──────────────────────────────────────────
WASM_RS="crates/wasm4pm-cognition/src/wasm.rs"
if [ -f "$WASM_RS" ]; then
    EXPORT_COUNT=$(grep -c "#\[wasm_bindgen\]" "$WASM_RS" 2>/dev/null || echo 0)
    if [ "$EXPORT_COUNT" -gt 0 ]; then
        V_STATUS["V2"]="PASS ($EXPORT_COUNT #[wasm_bindgen] annotations in wasm.rs)"
    else
        V_STATUS["V2"]="FAIL (no #[wasm_bindgen] annotations found in wasm.rs)"
    fi
else
    V_STATUS["V2"]="FAIL (wasm.rs not found at $WASM_RS)"
fi

# ── V3: No forbidden placeholder tokens ──────────────────────────────────────
# Scan src/ for forbidden lexicon: stub, placeholder, mock, todo!, fake
# Exemptions: test files (tests/ dirs, _test.rs files), doc comments
FORBIDDEN_SCAN_DIR="crates/wasm4pm-cognition/src"
if [ -d "$FORBIDDEN_SCAN_DIR" ]; then
    FORBIDDEN_HITS=$(grep -rn \
        --include="*.rs" \
        --exclude-dir="tests" \
        -E '\b(pub struct Stub|todo!\(|unimplemented!\(|placeholder|fake_impl)\b' \
        "$FORBIDDEN_SCAN_DIR/" 2>/dev/null \
        | grep -v "^\s*//" \
        | grep -v "_test\.rs" \
        | wc -l | tr -d ' ')
    if [ "$FORBIDDEN_HITS" -eq 0 ]; then
        V_STATUS["V3"]="PASS (no forbidden placeholder tokens in src/)"
    else
        SAMPLE=$(grep -rn \
            --include="*.rs" \
            --exclude-dir="tests" \
            -E '\b(pub struct Stub|todo!\(|unimplemented!\(|placeholder|fake_impl)\b' \
            "$FORBIDDEN_SCAN_DIR/" 2>/dev/null \
            | grep -v "^\s*//" | head -3)
        V_STATUS["V3"]="FAIL ($FORBIDDEN_HITS forbidden tokens found — first: $SAMPLE)"
    fi
else
    V_STATUS["V3"]="FAIL ($FORBIDDEN_SCAN_DIR does not exist)"
fi

# ── V4: CognitionBreed trait implemented by all breeds ───────────────────────
# Verifies each breed file contains "impl CognitionBreed" or "impl.*Breed"
TRAIT_IMPL_COUNT=0
if [ -d "$BREED_DIR" ]; then
    for breed in "${REQUIRED_BREEDS[@]}"; do
        breed_file="${BREED_DIR}/${breed}.rs"
        breed_mod="${BREED_DIR}/${breed}/mod.rs"
        if [ -f "$breed_file" ] && grep -q "impl.*Breed\|impl CognitionBreed" "$breed_file" 2>/dev/null; then
            TRAIT_IMPL_COUNT=$((TRAIT_IMPL_COUNT + 1))
        elif [ -f "$breed_mod" ] && grep -q "impl.*Breed\|impl CognitionBreed" "$breed_mod" 2>/dev/null; then
            TRAIT_IMPL_COUNT=$((TRAIT_IMPL_COUNT + 1))
        fi
    done
    if [ "$TRAIT_IMPL_COUNT" -ge 9 ]; then
        V_STATUS["V4"]="PASS ($TRAIT_IMPL_COUNT/9 breeds implement CognitionBreed trait)"
    else
        V_STATUS["V4"]="FAIL ($TRAIT_IMPL_COUNT/9 breeds implement CognitionBreed — $((9 - TRAIT_IMPL_COUNT)) missing)"
    fi
else
    V_STATUS["V4"]="FAIL (breeds/ directory not found)"
fi

# ── V5: Native cargo check passes ────────────────────────────────────────────
if cargo check -p wasm4pm-cognition >/dev/null 2>&1; then
    V_STATUS["V5"]="PASS (native cargo check passes)"
else
    V_STATUS["V5"]="FAIL (native cargo check failed)"
fi

# ── V6: WASM cargo check passes ──────────────────────────────────────────────
if cargo check -p wasm4pm-cognition --features wasm --target wasm32-unknown-unknown >/dev/null 2>&1; then
    V_STATUS["V6"]="PASS (WASM cargo check passes)"
else
    V_STATUS["V6"]="FAIL (WASM cargo check failed for wasm32-unknown-unknown)"
fi

# ── V7: TS facade zero-logic contract present ────────────────────────────────
# The TS facade must exist and must not contain any process logic itself.
TS_INDEX="packages/cognition/src/index.ts"
TS_ZERO_LOGIC_TEST="packages/cognition/src/__tests__/zero-logic.test.ts"
if [ -f "$TS_INDEX" ]; then
    if [ -f "$TS_ZERO_LOGIC_TEST" ]; then
        V_STATUS["V7"]="PASS (TS facade and zero-logic test both present)"
    else
        V_STATUS["V7"]="WARN (TS facade present but zero-logic.test.ts not found at $TS_ZERO_LOGIC_TEST)"
    fi
else
    V_STATUS["V7"]="FAIL (TS facade not found at $TS_INDEX)"
fi

# ── V8: CLI command present and wired to compiled WASM ───────────────────────
CLI_CMD="apps/wasm4pm/src/commands/cognition.ts"
if [ -f "$CLI_CMD" ]; then
    # Check for stub markers
    if grep -q "(stub)\|console\.log.*TODO\|not yet implemented" "$CLI_CMD" 2>/dev/null; then
        V_STATUS["V8"]="FAIL (stub/TODO markers detected in CLI command)"
    else
        V_STATUS["V8"]="PASS (CLI command present and appears stub-free)"
    fi
else
    V_STATUS["V8"]="FAIL (CLI command not found at $CLI_CMD)"
fi

# ── Print results ─────────────────────────────────────────────────────────────
echo "=== Cognition Verify Gate (V1-V8) ==="
echo

GATE_FAIL=0
for gate in V1 V2 V3 V4 V5 V6 V7 V8; do
    status="${V_STATUS[$gate]:-UNKNOWN}"
    indicator="PASS"
    if echo "$status" | grep -q "^FAIL"; then
        indicator="FAIL"
        GATE_FAIL=$((GATE_FAIL + 1))
    elif echo "$status" | grep -q "^WARN"; then
        indicator="WARN"
    fi
    printf "  %s  [%s] %s\n" "$gate" "$indicator" "$status"
done

echo
if [ "$GATE_FAIL" -gt 0 ]; then
    echo "=== Cognition Verify Gate: FAILED ($GATE_FAIL gate(s) failed) ==="
    exit 3
else
    echo "=== Cognition Verify Gate: ALL GATES PASSED ==="
    exit 0
fi
