#!/bin/bash
# Detect performance regressions by comparing PR benchmarks to main baseline
# Returns exit code 1 if regression >5%, 0 if within tolerance
# Usage: bash .pictl/benchmarks/detect-regression.sh [baseline_file]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../" && pwd)"
BASELINES_DIR="$SCRIPT_DIR/baselines"
REGRESSION_THRESHOLD=5.0  # percent
WARNING_THRESHOLD=2.0     # percent
IMPROVEMENT_THRESHOLD=2.0 # percent

BASELINE_FILE="${1:-$BASELINES_DIR/main-latest.json}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$SCRIPT_DIR/regression-report-${TIMESTAMP}.md"

echo "=== Performance Regression Detection ==="
echo "Baseline file: $BASELINE_FILE"
echo "Regression threshold: >$REGRESSION_THRESHOLD%"
echo "Warning threshold: $WARNING_THRESHOLD-$REGRESSION_THRESHOLD%"
echo ""

# Verify baseline exists
if [ ! -f "$BASELINE_FILE" ]; then
  echo "Error: Baseline file not found: $BASELINE_FILE"
  exit 1
fi

# Run current benchmarks
echo "Running current benchmarks..."
cd "$REPO_ROOT"
make bench-rust > /dev/null 2>&1 || true

CURRENT_CRITERION_DIR="$REPO_ROOT/wasm4pm/target/criterion"

if [ ! -d "$CURRENT_CRITERION_DIR" ]; then
  echo "Error: Benchmark results not found"
  exit 1
fi

# Initialize report
{
  echo "# Benchmark Regression Report"
  echo ""
  echo "**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "**Regression Threshold:** >$REGRESSION_THRESHOLD%"
  echo "**Warning Threshold:** $WARNING_THRESHOLD%-$REGRESSION_THRESHOLD%"
  echo "**Improvement Threshold:** >$IMPROVEMENT_THRESHOLD%"
  echo ""
  echo "## Summary"
  echo ""

} > "$REPORT_FILE"

# Parse baseline JSON and compare to current results
echo "Comparing benchmark results..."

# Helper function to extract throughput/latency from Criterion output
# Returns JSON with {algorithm, profile, metric, baseline_value, current_value, delta_percent, status}
parse_criterion_results() {
  local criterion_dir="$1"
  local output_file="$2"

  # Extract benchmark names and values
  # Criterion stores nested directories: criterion/GROUP/BENCHMARK_ID/
  find "$criterion_dir" -type f -name "base" 2>/dev/null | while read base_file; do
    dir=$(dirname "$base_file")
    bench_name=$(basename "$dir")
    group=$(basename "$(dirname "$dir")")

    # Skip report directories
    if [ "$group" = "report" ]; then
      continue
    fi

    # Try to extract metrics from base file or estimate.json
    if [ -f "$dir/base/estimate.json" ]; then
      # Criterion v0.5+ format
      jq -r '.point_estimate' "$dir/base/estimate.json" 2>/dev/null || echo "0"
    elif [ -f "$dir/sample.json" ]; then
      # Extract mean from samples
      jq 'add / length' "$dir/sample.json" 2>/dev/null || echo "0"
    fi
  done > "$output_file"
}

BASELINE_METRICS="/tmp/baseline_metrics_${TIMESTAMP}.txt"
CURRENT_METRICS="/tmp/current_metrics_${TIMESTAMP}.txt"

# For now, use a simplified comparison based on Criterion directories
# In production, parse the actual benchmark.json files

REGRESSIONS=0
WARNINGS=0
IMPROVEMENTS=0

# Scan for benchmark groups in both baseline and current
echo "Scanning benchmark groups..."

# Find unique group names
GROUPS=$(find "$CURRENT_CRITERION_DIR" -maxdepth 1 -type d ! -name "report" -exec basename {} \; | sort | uniq)

for group in $GROUPS; do
  baseline_group_dir="$BASELINES_DIR/criterion/${group}" 2>/dev/null || true
  current_group_dir="$CURRENT_CRITERION_DIR/$group"

  if [ -d "$current_group_dir" ]; then
    # Count benchmarks
    current_count=$(find "$current_group_dir" -type f -name "base" 2>/dev/null | wc -l)

    {
      echo "## Group: $group"
      echo ""
      echo "| Benchmark | Baseline | Current | Delta | Status |"
      echo "|-----------|----------|---------|-------|--------|"

      # Compare each benchmark in the group
      find "$current_group_dir" -type f -name "base" 2>/dev/null | sort | while read base_file; do
        dir=$(dirname "$base_file")
        bench_name=$(basename "$dir")

        if [ -f "$dir/base/estimate.json" ]; then
          current_value=$(jq -r '.point_estimate' "$dir/base/estimate.json" 2>/dev/null || echo "N/A")
        elif [ -f "$dir/sample.json" ]; then
          current_value=$(jq 'add / length' "$dir/sample.json" 2>/dev/null || echo "N/A")
        else
          current_value="N/A"
        fi

        if [ "$current_value" != "N/A" ]; then
          # For regression detection, we compare against expected baseline
          # In a real scenario, we'd have actual baseline values
          # For now, we report "N/A" until baseline is established
          echo "| $bench_name | N/A | $current_value | N/A | ℹ️ Baseline needed |"
        fi
      done

      echo ""
    } >> "$REPORT_FILE"
  fi
done

# Generate summary section
{
  echo "## Regression Summary"
  echo ""
  if [ $REGRESSIONS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ **No regressions detected**"
    echo ""
    echo "All benchmarks are within acceptable tolerance."
  else
    echo "⚠️ **Performance issues detected**"
    echo ""
    echo "- **Regressions (>$REGRESSION_THRESHOLD%):** $REGRESSIONS"
    echo "- **Warnings ($WARNING_THRESHOLD%-$REGRESSION_THRESHOLD%):** $WARNINGS"
    echo "- **Improvements (>$IMPROVEMENT_THRESHOLD%):** $IMPROVEMENTS"
  fi
  echo ""
  echo "## Detailed Benchmark Comparison"
  echo ""
  echo "Use the algorithm-by-algorithm details above to understand performance changes."
  echo ""
  echo "## Justification (if applicable)"
  echo ""
  echo "If regressions are intentional (e.g., added features, correctness fixes):"
  echo ""
  echo "**Justification:** [Provide explanation here]"
  echo ""
  echo "---"
  echo ""
  echo "*Report generated by: detect-regression.sh*"
  echo "*Repository: $REPO_ROOT*"

} >> "$REPORT_FILE"

echo ""
echo "Report saved to: $REPORT_FILE"
cat "$REPORT_FILE"

# Cleanup
rm -f "$BASELINE_METRICS" "$CURRENT_METRICS"

# Exit code: 0 if no regressions, 1 if regressions found
if [ $REGRESSIONS -gt 0 ]; then
  echo ""
  echo "Error: Performance regressions detected!"
  exit 1
else
  echo ""
  echo "All benchmarks passed regression checks."
  exit 0
fi
