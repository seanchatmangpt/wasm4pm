#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Module: test-coverage.sh — 10 items
# ---------------------------------------------------------------------------

RESULTS_FILE="${1:-/tmp/test-coverage.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$SCRIPT_DIR" in
  */scripts/validators) REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)" ;;
  */scripts)            REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)" ;;
  *)                    REPO_ROOT="$SCRIPT_DIR" ;;
esac
WASM_DIR="$REPO_ROOT/wasm4pm"
cd "$REPO_ROOT"

{

# TC-1: Integration test files present
TEST_N=$(ls "$WASM_DIR/tests/"*.rs 2>/dev/null | wc -l | tr -d ' ')
TEST_INT=$(echo "$TEST_N" | tr -d '[:space:]')
if [ "$TEST_INT" -ge 5 ]; then
  echo "PASS|TC-1|$TEST_INT integration test files in wasm4pm/tests/"
else
  echo "FAIL|TC-1|Only $TEST_INT integration test files (expected 5+)"
fi

# TC-2: Reinforcement learning tests
if [ -f "$WASM_DIR/tests/reinforcement_tests.rs" ]; then
  RL_N=$(grep -c "^#\[test\]" "$WASM_DIR/tests/reinforcement_tests.rs" 2>/dev/null || echo 0)
  echo "PASS|TC-2|reinforcement_tests.rs: $RL_N test functions"
else
  echo "FAIL|TC-2|wasm4pm/tests/reinforcement_tests.rs missing"
fi

# TC-3: pm4py parity tests
if [ -f "$WASM_DIR/tests/parity_tests.rs" ]; then
  P_N=$(grep -c "^#\[test\]" "$WASM_DIR/tests/parity_tests.rs" 2>/dev/null || echo 0)
  echo "PASS|TC-3|parity_tests.rs: $P_N test functions (pm4py reference parity)"
else
  echo "FAIL|TC-3|wasm4pm/tests/parity_tests.rs missing"
fi

# TC-4: Test fixtures present
FIXTURE_DIR="$WASM_DIR/tests/fixtures"
if [ -d "$FIXTURE_DIR" ]; then
  FIX_N=$(ls "$FIXTURE_DIR" 2>/dev/null | wc -l | tr -d ' ')
  FIX_INT=$(echo "$FIX_N" | tr -d '[:space:]')
  if [ "$FIX_INT" -ge 10 ]; then
    echo "PASS|TC-4|Test fixtures: $FIX_INT files in tests/fixtures/"
  else
    echo "WARN|TC-4|Only $FIX_INT fixture files (expected 10+ for full conformance coverage)"
  fi
else
  echo "FAIL|TC-4|tests/fixtures/ directory missing"
fi

# TC-5: XES fixture for conformance vectors
FIXTURE_DIR="$WASM_DIR/tests/fixtures"
XES_N=$(ls "$FIXTURE_DIR/"*.xes 2>/dev/null | wc -l | tr -d ' ')
XES_INT=$(echo "$XES_N" | tr -d '[:space:]')
if [ "$XES_INT" -ge 1 ]; then
  echo "PASS|TC-5|XES fixture file(s) present: $XES_INT (conformance vector testing)"
else
  echo "FAIL|TC-5|No .xes fixtures in tests/fixtures/ — required for conformance vector tests"
fi

# TC-6: Library compiles for test target
# Note: cargo check --lib is used instead of cargo test --lib --no-run
# because the working tree has [[bench]] entries in Cargo.toml referencing
# non-existent bench files (performance_benchmark.rs, scalability_benchmark.rs).
# cargo test parses all manifest sections; cargo check --lib only checks lib code.
CHECK_OUT=$(cargo check --lib 2>&1 || true)
if echo "$CHECK_OUT" | grep -q "^error"; then
  FIRST_ERR=$(echo "$CHECK_OUT" | grep "^error" | head -1)
  echo "FAIL|TC-6|cargo check --lib compile error: $FIRST_ERR"
else
  echo "PASS|TC-6|cargo check --lib: compiles successfully (lib target)"
fi

# TC-7: Cargo.toml manifest integrity (bench file references)
MISSING_BENCHES=0
for BNAME in "performance_benchmark" "scalability_benchmark"; do
  if grep -q "name = \"$BNAME\"" "$WASM_DIR/Cargo.toml" 2>/dev/null; then
    if [ ! -f "$WASM_DIR/benches/$BNAME.rs" ]; then
      MISSING_BENCHES=$((MISSING_BENCHES + 1))
    fi
  fi
done
if [ "$MISSING_BENCHES" -gt 0 ]; then
  echo "FAIL|TC-7|Cargo.toml manifest defect: $MISSING_BENCHES [[bench]] entries reference non-existent .rs files (performance_benchmark, scalability_benchmark). This breaks 'cargo test'. Remove the entries or create the bench files."
else
  echo "PASS|TC-7|Cargo.toml manifest integrity: all [[bench]] entries have corresponding source files"
fi

# TC-8: GPU conformance test vectors (25 required per merge gate checklist)
GPU_TV=$(grep -rn \
  "test_input_admissible_mask_valid\|test_output_argmax_validity\|test_output_deterministic\|test_output_matches_cpu\|test_empty_admissible\|test_all_actions_admissible\|test_linucb_fresh_arms\|test_linucb_established_arms\|test_linucb_coefficient\|test_features_normalized\|test_features_unbounded\|test_single_admissible\|test_ucb1_counts\|gpu_kernel_conformance" \
  "$WASM_DIR/tests/" 2>/dev/null | wc -l | tr -d ' ')
GPU_INT=$(echo "$GPU_TV" | tr -d '[:space:]')
if [ "$GPU_INT" -ge 25 ]; then
  echo "PASS|TC-8|GPU conformance test vectors: $GPU_INT (>= 25 required)"
elif [ "$GPU_INT" -gt 0 ]; then
  echo "FAIL|TC-8|GPU conformance test vectors partial: $GPU_INT found, 25 required by GPU_KERNEL_MERGE_GATE_CHECKLIST.md"
else
  echo "FAIL|TC-8|GPU conformance test vectors: 0 of 25 required (test_input_* + test_output_* + 13 edge cases)"
fi

# TC-9: Autonomic/self-healing tests
if [ -f "$WASM_DIR/tests/autonomic_tests.rs" ]; then
  A_N=$(grep -c "#\[test\]\|#\[tokio::test\]\|fn test_" "$WASM_DIR/tests/autonomic_tests.rs" 2>/dev/null || echo 0)
  echo "PASS|TC-9|autonomic_tests.rs: $A_N test declarations"
else
  echo "WARN|TC-9|autonomic_tests.rs not found in wasm4pm/tests/"
fi

# TC-10: TypeScript package tests
TS_N=$(find "$REPO_ROOT/packages" -name "*.test.ts" -o -name "*.spec.ts" 2>/dev/null | wc -l | tr -d ' ')
TS_INT=$(echo "$TS_N" | tr -d '[:space:]')
if [ "$TS_INT" -ge 5 ]; then
  echo "PASS|TC-10|TypeScript tests: $TS_INT test files across packages/"
else
  echo "WARN|TC-10|Only $TS_INT TypeScript test files in packages/ (expected 5+)"
fi

} | python3 -c "
import sys, json
items = []
for line in sys.stdin:
    line = line.strip()
    if not line or '|' not in line:
        continue
    parts = line.split('|', 2)
    if len(parts) == 3:
        items.append({'id': parts[1], 'status': parts[0], 'detail': parts[2]})
with open('$RESULTS_FILE', 'w') as f:
    json.dump({'test_coverage': items}, f, indent=2)
"

echo "test-coverage: $RESULTS_FILE"
