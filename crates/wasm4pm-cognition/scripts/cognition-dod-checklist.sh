#!/usr/bin/env bash
# cognition-dod-checklist.sh — Definition of Done checklist for the cognition layer.
# Implements the 10-item DoD from architecture diagram #39.
#
# Exit codes:
#   0 — All 10 DoD items satisfied
#   1 — One or more items failed
#
# Usage:
#   bash crates/wasm4pm-cognition/scripts/cognition-dod-checklist.sh

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

TOTAL=0
PASSED=0
FAILED=0

check() {
    local item_num="$1"
    local description="$2"
    local result="$3"   # "pass" or "fail: <reason>"
    TOTAL=$((TOTAL + 1))
    if [ "$result" = "pass" ]; then
        PASSED=$((PASSED + 1))
        printf "  [PASS] DoD-%02d  %s\n" "$item_num" "$description"
    else
        FAILED=$((FAILED + 1))
        local reason="${result#fail: }"
        printf "  [FAIL] DoD-%02d  %s\n             Reason: %s\n" "$item_num" "$description" "$reason"
    fi
}

echo "=== Cognition Definition of Done Checklist ==="
echo "    Diagram: #39"
echo "    Root: $ROOT"
echo

# ── DoD-01: Real Rust crate exists (not a placeholder package.json or empty dir) ──
CRATE_TOML="crates/wasm4pm-cognition/Cargo.toml"
if [ -f "$CRATE_TOML" ] && grep -q '\[package\]' "$CRATE_TOML"; then
    check 1 "Real Rust crate exists" "pass"
else
    check 1 "Real Rust crate exists" "fail: $CRATE_TOML missing or has no [package] section"
fi

# ── DoD-02: All breeds are Rust modules in src/breeds/ ─────────────────────────
BREED_DIR="crates/wasm4pm-cognition/src/breeds"
REQUIRED_BREEDS=(frame cbr dendral strips prolog production_rules gps soar hearsay)
MISSING_BREEDS=()
for breed in "${REQUIRED_BREEDS[@]}"; do
    if [ ! -s "${BREED_DIR}/${breed}.rs" ] && [ ! -f "${BREED_DIR}/${breed}/mod.rs" ]; then
        MISSING_BREEDS+=("$breed")
    fi
done
if [ "${#MISSING_BREEDS[@]}" -eq 0 ]; then
    check 2 "All 9 breeds are Rust modules (frame,cbr,dendral,strips,prolog,production_rules,gps,soar,hearsay)" "pass"
else
    check 2 "All 9 breeds are Rust modules" "fail: missing breeds: ${MISSING_BREEDS[*]}"
fi

# ── DoD-03: Common breed trait (CognitionBreed) exists ─────────────────────────
TRAIT_FILE=""
for candidate in \
    "crates/wasm4pm-cognition/src/breeds/mod.rs" \
    "crates/wasm4pm-cognition/src/traits.rs" \
    "crates/wasm4pm-cognition/src/cognition.rs" \
    "crates/wasm4pm-cognition/src/lib.rs"; do
    if [ -f "$candidate" ] && grep -q "trait.*Breed\|pub trait CognitionBreed" "$candidate" 2>/dev/null; then
        TRAIT_FILE="$candidate"
        break
    fi
done
if [ -n "$TRAIT_FILE" ]; then
    check 3 "Common breed trait (CognitionBreed) exists" "pass"
else
    check 3 "Common breed trait (CognitionBreed) exists" "fail: no file found containing 'trait.*Breed' or 'pub trait CognitionBreed'"
fi

# ── DoD-04: wasm-bindgen exports exist in src/wasm.rs ──────────────────────────
WASM_RS="crates/wasm4pm-cognition/src/wasm.rs"
if [ -f "$WASM_RS" ]; then
    EXPORT_COUNT=$(grep -c "#\[wasm_bindgen\]" "$WASM_RS" 2>/dev/null || echo 0)
    EXPECTED_EXPORTS=(cognition_run cognition_verify cognition_replay system_build system_verify)
    MISSING_EXPORTS=()
    for exp in "${EXPECTED_EXPORTS[@]}"; do
        if ! grep -q "pub fn ${exp}" "$WASM_RS"; then
            MISSING_EXPORTS+=("$exp")
        fi
    done
    if [ "${#MISSING_EXPORTS[@]}" -eq 0 ]; then
        check 4 "wasm-bindgen exports exist in src/wasm.rs ($EXPORT_COUNT annotations)" "pass"
    else
        check 4 "wasm-bindgen exports exist in src/wasm.rs" "fail: missing exports: ${MISSING_EXPORTS[*]}"
    fi
else
    check 4 "wasm-bindgen exports exist in src/wasm.rs" "fail: $WASM_RS does not exist"
fi

# ── DoD-05: TS facade is thin (delegates; has zero-logic.test.ts) ───────────────
TS_INDEX="packages/cognition/src/index.ts"
TS_ZERO_LOGIC="packages/cognition/src/__tests__/zero-logic.test.ts"
if [ -f "$TS_INDEX" ] && [ -f "$TS_ZERO_LOGIC" ]; then
    check 5 "TS facade is thin (zero-logic.test.ts present)" "pass"
elif [ -f "$TS_INDEX" ]; then
    check 5 "TS facade is thin (zero-logic.test.ts present)" "fail: index.ts present but zero-logic.test.ts missing at $TS_ZERO_LOGIC"
else
    check 5 "TS facade is thin (zero-logic.test.ts present)" "fail: TS facade missing at $TS_INDEX"
fi

# ── DoD-06: No forbidden placeholder tokens in src/ ────────────────────────────
SRC_DIR="crates/wasm4pm-cognition/src"
if [ -d "$SRC_DIR" ]; then
    FORBIDDEN=$(grep -rn \
        --include="*.rs" \
        --exclude-dir="tests" \
        -E '\b(pub struct Stub|todo!\(|unimplemented!\(|fake_impl)\b' \
        "$SRC_DIR/" 2>/dev/null \
        | grep -v "^\s*//" \
        | wc -l | tr -d ' ')
    if [ "$FORBIDDEN" -eq 0 ]; then
        check 6 "No forbidden placeholder tokens in src/ (stub/todo!/unimplemented!/fake_impl)" "pass"
    else
        check 6 "No forbidden placeholder tokens" "fail: $FORBIDDEN forbidden tokens found in $SRC_DIR"
    fi
else
    check 6 "No forbidden placeholder tokens in src/" "fail: $SRC_DIR does not exist"
fi

# ── DoD-07: Capability probe passes (cognition-doctor.sh exits 0) ───────────────
DOCTOR_SCRIPT="crates/wasm4pm-cognition/scripts/cognition-doctor.sh"
if [ -f "$DOCTOR_SCRIPT" ]; then
    if bash "$DOCTOR_SCRIPT" >/dev/null 2>&1; then
        check 7 "Capability probe passes (cognition-doctor.sh exits 0)" "pass"
    else
        check 7 "Capability probe passes (cognition-doctor.sh exits 0)" "fail: cognition-doctor.sh exited non-zero (run it directly for details)"
    fi
else
    check 7 "Capability probe passes (cognition-doctor.sh exits 0)" "fail: $DOCTOR_SCRIPT not found"
fi

# ── DoD-08: Verify emits receipt ────────────────────────────────────────────────
# Check that cognition_verify in wasm.rs returns a JSON object containing a receipt field
if [ -f "$WASM_RS" ]; then
    if grep -A 20 "pub fn cognition_verify" "$WASM_RS" 2>/dev/null | grep -q "receipt\|run_id\|combined_hash"; then
        check 8 "Verify emits receipt (cognition_verify returns receipt structure)" "pass"
    else
        check 8 "Verify emits receipt (cognition_verify returns receipt structure)" "fail: cognition_verify in wasm.rs does not reference receipt/run_id/combined_hash"
    fi
else
    check 8 "Verify emits receipt" "fail: $WASM_RS does not exist"
fi

# ── DoD-09: Replay works (run + receipt + replay roundtrip) ─────────────────────
# Check that cognition_replay is wired to accept a receipt_id and returns combined_hash
if [ -f "$WASM_RS" ]; then
    if grep -q "pub fn cognition_replay" "$WASM_RS" && \
       grep -A 10 "pub fn cognition_replay" "$WASM_RS" 2>/dev/null | grep -q "receipt_id\|combined_hash\|run_id"; then
        check 9 "Replay works (cognition_replay accepts receipt_id + returns combined_hash)" "pass"
    else
        check 9 "Replay works (cognition_replay accepts receipt_id + returns combined_hash)" "fail: cognition_replay not found or missing receipt_id/combined_hash in signature"
    fi
else
    check 9 "Replay works" "fail: $WASM_RS does not exist"
fi

# ── DoD-10: CLI uses compiled WASM (no console.log stubs) ───────────────────────
CLI_CMD="apps/wasm4pm/src/commands/cognition.ts"
if [ -f "$CLI_CMD" ]; then
    if grep -q "(stub)\|console\.log.*not yet\|console\.log.*TODO\|throw new Error.*not implemented" "$CLI_CMD" 2>/dev/null; then
        check 10 "CLI uses compiled WASM (no console.log stubs)" "fail: stub/TODO markers detected in $CLI_CMD"
    else
        check 10 "CLI uses compiled WASM (no console.log stubs)" "pass"
    fi
else
    check 10 "CLI uses compiled WASM (no console.log stubs)" "fail: $CLI_CMD does not exist"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "=== Cognition DoD Summary ==="
printf "    Passed: %d / %d\n" "$PASSED" "$TOTAL"
printf "    Failed: %d / %d\n" "$FAILED" "$TOTAL"
echo

if [ "$FAILED" -gt 0 ]; then
    echo "=== Cognition DoD: NOT SATISFIED ($FAILED/$TOTAL items failed) ==="
    exit 1
else
    echo "=== Cognition DoD: SATISFIED (all $TOTAL items passed) ==="
    exit 0
fi
