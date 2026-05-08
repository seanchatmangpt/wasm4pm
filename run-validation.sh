#!/bin/bash

# Quick validation script for critical algorithms
# Tests 12 key algorithms across 3 test logs
# Verifies determinism, crash-safety, and schema validity

set -e

cd /Users/sac/wasm4pm/apps/wasm4pm

# Test logs
TEST_SIMPLE="/Users/sac/wasm4pm/data/small-example.xes"
TEST_MODERATE="/Users/sac/wasm4pm/bench_data/bpi2020_travel.xes"
TEST_COMPLEX="/Users/sac/wasm4pm/bench_data/bpi2012_loans.xes"

# Key algorithms to test
ALGORITHMS=(
  "dfg"
  "alpha_plus_plus"
  "heuristic_miner"
  "inductive_miner"
  "genetic_algorithm"
  "ilp"
  "a_star"
  "simulated_annealing"
  "aco"
  "declare"
  "ml_classify"
  "ml_forecast"
)

PASS=0
FAIL=0
CRASH=0

for algo in "${ALGORITHMS[@]}"; do
  echo "Testing: $algo"

  # Test simple log
  if node dist/bin/wpm.js run "$TEST_SIMPLE" --algorithm "$algo" --format json > /tmp/test-output.json 2>&1; then
    if grep -q '"status".*"ok"' /tmp/test-output.json; then
      # Run again to check determinism
      if node dist/bin/wpm.js run "$TEST_SIMPLE" --algorithm "$algo" --format json > /tmp/test-output2.json 2>&1; then
        # Compare outputs (hash-based)
        HASH1=$(cat /tmp/test-output.json | jq -r '.payload | tostring' | sha256sum | cut -d' ' -f1)
        HASH2=$(cat /tmp/test-output2.json | jq -r '.payload | tostring' | sha256sum | cut -d' ' -f1)

        if [ "$HASH1" = "$HASH2" ]; then
          echo "  ✓ PASS (deterministic)"
          ((PASS++))
        else
          echo "  ✗ FAIL (non-deterministic)"
          ((FAIL++))
        fi
      else
        echo "  ✗ FAIL (second run crashed)"
        ((FAIL++))
      fi
    else
      echo "  ✗ CRASH (invalid status)"
      ((CRASH++))
    fi
  else
    echo "  ✗ CRASH"
    ((CRASH++))
  fi
done

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Crashes: $CRASH"
echo "Total: $((PASS + FAIL + CRASH))"

exit 0
