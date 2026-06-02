#!/bin/bash

# Track B-1: Test Failure Triage Sampling Script
# Executes 20 representative test samples to identify failure categories
# Usage: bash TRIAGE-SAMPLING-SCRIPT.sh 2>&1 | tee triage-results.log

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create results directory
mkdir -p triage-samples
RESULTS_DIR="$REPO_ROOT/triage-samples"

echo -e "${BLUE}=== Track B-1: Test Failure Triage Sampling ===${NC}"
echo "Timestamp: $(date)"
echo "Repository root: $REPO_ROOT"
echo "Results directory: $RESULTS_DIR"
echo ""

# Function to run a single test sample
run_sample() {
  local sample_num=$1
  local package_path=$2
  local test_file=$3
  local category=$4
  local description=$5

  echo -e "${YELLOW}[Sample $sample_num/$TOTAL_SAMPLES]${NC} Category $category: $description"
  echo "  Package: $package_path"
  echo "  Test: $test_file"

  local test_path="$REPO_ROOT/$package_path"
  if [ ! -f "$test_path/$test_file" ]; then
    echo -e "${RED}  ✗ Test file not found: $test_path/$test_file${NC}"
    echo "MISSING_FILE" > "$RESULTS_DIR/sample-$sample_num-result.txt"
    return 1
  fi

  # Run the test and capture output
  local log_file="$RESULTS_DIR/sample-$sample_num.log"
  echo "  Running test..."

  cd "$test_path"
  if npm test -- "$test_file" > "$log_file" 2>&1; then
    echo -e "${GREEN}  ✓ Test passed${NC}"
    echo "PASSED" > "$RESULTS_DIR/sample-$sample_num-result.txt"
  else
    # Analyze the error
    local error_msg=$(tail -30 "$log_file")
    echo -e "${RED}  ✗ Test failed${NC}"

    # Categorize the error
    if echo "$error_msg" | grep -qi "is not a function"; then
      echo "WASM_EXPORT_MISSING" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: WASM export missing or incorrect"
    elif echo "$error_msg" | grep -qi "\.payload"; then
      echo "PAYLOAD_ENVELOPE_ERROR" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Output not wrapped in payload envelope"
    elif echo "$error_msg" | grep -qi "command not found\|unrecognized command"; then
      echo "CLI_COMMAND_MISSING" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: CLI command not registered"
    elif echo "$error_msg" | grep -qi "beforeEach\|beforeAll"; then
      echo "SETUP_FAILURE" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Test setup/beforeEach failed"
    elif echo "$error_msg" | grep -qi "Cannot find module\|ERR!.*not installed"; then
      echo "DEPENDENCY_MISSING" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Cross-package dependency unresolved"
    elif echo "$error_msg" | grep -qi "validation failed\|Zod\|schema"; then
      echo "SCHEMA_VALIDATION_ERROR" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Schema validation failed"
    elif echo "$error_msg" | grep -qi "undefined.*algorithm\|not.*registry"; then
      echo "ALGORITHM_REGISTRY_ERROR" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Algorithm registry/feature flag issue"
    elif echo "$error_msg" | grep -qi "span.*not found\|OtelCapture"; then
      echo "OTEL_SPAN_MISSING" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: OTEL span not emitted"
    elif echo "$error_msg" | grep -qi "ENOENT\|no such file"; then
      echo "FIXTURE_FILE_MISSING" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Test fixture file not found"
    elif echo "$error_msg" | grep -qi "not mocked\|vi\.mock"; then
      echo "MOCK_CONFIGURATION_ERROR" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Mock not configured properly"
    elif echo "$error_msg" | grep -qi "timeout\|ETIMEDOUT"; then
      echo "TIMEOUT_ERROR" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Test or async operation timed out"
    elif echo "$error_msg" | grep -qi "expect.*toMatch"; then
      echo "OUTPUT_FORMAT_ERROR" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Likely: Output formatting doesn't match regex"
    else
      echo "UNKNOWN_ERROR" > "$RESULTS_DIR/sample-$sample_num-result.txt"
      echo "  Error message: $(echo "$error_msg" | head -3)"
    fi
  fi

  cd "$REPO_ROOT"
  echo ""
}

# Define 20 samples
TOTAL_SAMPLES=20

echo -e "${YELLOW}Scheduling $TOTAL_SAMPLES test samples...${NC}"
echo ""

# Sample 1: WASM Missing (Category A)
run_sample 1 "apps/wasm4pm" "src/__tests__/autoprocess-e2e.test.ts" "A" "WASM export missing (autonomic_execute_cycle)"

# Sample 2: Payload Envelope (Category B)
run_sample 2 "apps/wasm4pm" "src/__tests__/algorithms-cli.test.ts" "B" "Payload envelope for JSON output"

# Sample 3: CLI Command Wiring (Category C)
run_sample 3 "apps/wasm4pm" "src/__tests__/prolog8-cli.test.ts" "C" "CLI command registration (wpm prolog8)" || true

# Sample 4: Test Setup Failure (Category D)
run_sample 4 "packages/agents" "src/__tests__/execute-learn-contracts.test.ts" "D" "Test setup/beforeEach failure" || true

# Sample 5: Cross-Package Dependency (Category E)
run_sample 5 "packages/kernel" "__tests__/backend-registry.test.ts" "E" "Cross-package dependency resolution" || true

# Sample 6: Module Import Resolution (Category E)
run_sample 6 "packages/ml" "src/__tests__/feature-quality.test.ts" "E" "Module import resolution" || true

# Sample 7: Schema Validation (Category F)
run_sample 7 "packages/config" "src/__tests__/config-validation.test.ts" "F" "Zod schema validation" || true

# Sample 8: OTEL Span Coverage (Category H)
run_sample 8 "packages/observability" "src/__tests__/otel-span-verification.test.ts" "H" "OTEL span emission" || true

# Sample 9: Engine Bootstrap (Category D)
run_sample 9 "packages/engine" "src/engine.test.ts" "D" "Engine bootstrap/initialization" || true

# Sample 10: Cognition WASM Integration (Category A)
run_sample 10 "packages/cognition" "src/__tests__/cognition-wasm.integration.test.ts" "A" "WASM initialization in cognition" || true

# Sample 11: Receipt Schema (Category F)
run_sample 11 "packages/contracts" "src/__tests__/receipt.test.ts" "F" "Receipt schema validation" || true

# Sample 12: Swarm Cross-Package (Category E)
run_sample 12 "packages/swarm" "src/__tests__/marketplace-passport.test.ts" "E" "Swarm cross-package coupling" || true

# Sample 13: Algorithm Selection (Category G)
run_sample 13 "apps/wasm4pm" "src/__tests__/algorithm-selector.test.ts" "G" "Algorithm registry/feature flags" || true

# Sample 14: Doctor Command Wiring (Category C)
run_sample 14 "apps/wasm4pm" "src/__tests__/doctor.test.ts" "C" "Doctor command CLI wiring" || true

# Sample 15: Fixture Loading (Category I)
run_sample 15 "packages/testing" "__tests__/integration.test.ts" "I" "Test fixture file loading" || true

# Sample 16: Batch CLI (Category K)
run_sample 16 "apps/wasm4pm" "src/__tests__/batch-cli.test.ts" "K" "Async/timeout issues" || true

# Sample 17: Classifiers Dependency (Category E)
run_sample 17 "packages/ml" "src/__tests__/classifiers.test.ts" "E" "ML module dependency resolution" || true

# Sample 18: Output Formatting (Category L)
run_sample 18 "apps/wasm4pm" "src/__tests__/output.test.ts" "L" "Output formatting (human vs JSON)" || true

# Sample 19: Supabase Sync (Category J)
run_sample 19 "packages/supabase" "src/__tests__/sync.test.ts" "J" "Mock/spy configuration" || true

# Sample 20: OTEL Span Coverage Agents (Category H)
run_sample 20 "packages/agents" "src/__tests__/otel-span-coverage.test.ts" "H" "Agent OTEL observability" || true

# Analyze results
echo -e "${BLUE}=== Triage Results Summary ===${NC}"
echo ""

declare -A category_counts
category_counts["WASM_EXPORT_MISSING"]=0
category_counts["PAYLOAD_ENVELOPE_ERROR"]=0
category_counts["CLI_COMMAND_MISSING"]=0
category_counts["SETUP_FAILURE"]=0
category_counts["DEPENDENCY_MISSING"]=0
category_counts["SCHEMA_VALIDATION_ERROR"]=0
category_counts["ALGORITHM_REGISTRY_ERROR"]=0
category_counts["OTEL_SPAN_MISSING"]=0
category_counts["FIXTURE_FILE_MISSING"]=0
category_counts["MOCK_CONFIGURATION_ERROR"]=0
category_counts["TIMEOUT_ERROR"]=0
category_counts["OUTPUT_FORMAT_ERROR"]=0
category_counts["UNKNOWN_ERROR"]=0
category_counts["PASSED"]=0
category_counts["MISSING_FILE"]=0

for i in $(seq 1 $TOTAL_SAMPLES); do
  if [ -f "$RESULTS_DIR/sample-$i-result.txt" ]; then
    result=$(cat "$RESULTS_DIR/sample-$i-result.txt")
    ((category_counts[$result]++)) || true
  fi
done

echo "Sample Results by Category:"
for category in "${!category_counts[@]}"; do
  count=${category_counts[$category]}
  if [ $count -gt 0 ]; then
    echo "  $category: $count samples"
  fi
done

echo ""
echo "Details:"
echo "  PASSED: ${category_counts[PASSED]} (out of $TOTAL_SAMPLES)"
echo "  FAILED: $((TOTAL_SAMPLES - ${category_counts[PASSED]}))"
echo ""

echo "Estimated Impact (extrapolating to ~1200 tests):"
echo "  If WASM issues affect 25% of failures: ~75-150 tests affected"
echo "  If Envelope issues affect 25% of failures: ~75-150 tests affected"
echo "  If Dependency issues affect 15% of failures: ~45-90 tests affected"
echo "  If Setup issues affect 15% of failures: ~45-90 tests affected"
echo ""

echo -e "${BLUE}=== Next Steps ===${NC}"
echo "1. Review error logs in: $RESULTS_DIR/"
echo "2. Identify top 3 failure categories from samples"
echo "3. Deep-dive into root causes for those categories"
echo "4. Implement fixes by category priority"
echo ""

echo -e "${GREEN}Triage sampling complete!${NC}"
echo "Results saved to: $RESULTS_DIR/"
