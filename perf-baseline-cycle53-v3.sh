#!/bin/bash
# Performance baseline measurement for wasm4pm Cycle 53 (v3)
# Simplified timing approach using bc and basic arithmetic

set -e
cd /Users/sac/wasm4pm

OUTPUT_FILE=".wasm4pm/perf-baseline-cycle53.json"
mkdir -p .wasm4pm

# WPM CLI wrapper
WPM="node apps/wasm4pm/dist/cli.js"

# Helper: measure command execution time
measure_workflow() {
  local name=$1
  local cmd=$2
  local log_file=$3
  local log_size=$4

  echo "Measuring: $name (log: ~$log_size events)..." >&2

  local start=$(date +%s)
  local start_ns=$(date +%s%N)

  # Run command and suppress output
  eval "$cmd" > /tmp/wpm_output.txt 2>&1 || true

  local end=$(date +%s)
  local end_ns=$(date +%s%N)

  # Calculate elapsed in milliseconds using pure bash arithmetic
  local elapsed_s=$((end - start))
  local elapsed_ms=$((elapsed_s * 1000))

  # If less than 1 second, try nanosecond calculation carefully
  if [ $elapsed_s -eq 0 ]; then
    # Both in nanoseconds, need to extract digits carefully
    local start_s_part="${start_ns:0:10}"
    local start_ns_part="${start_ns:10:9}"
    local end_s_part="${end_ns:0:10}"
    local end_ns_part="${end_ns:10:9}"

    if [ "$end_s_part" = "$start_s_part" ]; then
      # Same second, just subtract nanoseconds
      local ns_diff=$((end_ns_part - start_ns_part))
      elapsed_ms=$((ns_diff / 1000000))
      if [ $elapsed_ms -lt 1 ]; then
        elapsed_ms=1
      fi
    fi
  fi

  # Return JSON
  cat <<EOF
{
  "name": "$name",
  "log_file": "$log_file",
  "log_size_events": $log_size,
  "elapsed_ms": $elapsed_ms,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

echo "=== wasm4pm Performance Baseline — Cycle 53 ===" >&2
echo "Repository: /Users/sac/wasm4pm" >&2
echo "Build date: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
echo "" >&2

# Check WASM binary
WASM_SIZE=$(ls -l wasm4pm/pkg/wasm4pm_bg.wasm 2>/dev/null | awk '{print $5}' || echo "0")
WASM_SIZE_MB=$(printf "%.2f" $(echo "scale=2; $WASM_SIZE / 1024 / 1024" | bc))

echo "WASM Binary Metrics:" >&2
echo "  Size: ${WASM_SIZE_MB}MB ($WASM_SIZE bytes)" >&2
echo "" >&2

# Measure WASM initialization time
echo "Measuring WASM initialization..." >&2
init_start=$(date +%s)
$WPM status --format json > /dev/null 2>&1 || true
init_end=$(date +%s)
WASM_INIT_MS=$((((init_end - init_start) + 1) * 1000))
echo "  Init time: ~${WASM_INIT_MS}ms" >&2
echo "" >&2

# Array for results
declare -a RESULTS

echo "=== Phase 1: Discovery (small, medium, large logs) ===" >&2
RESULTS+=("$(measure_workflow 'wpm run (small ~111 events)' "$WPM run data/AN1-example.xes --format json" 'data/AN1-example.xes' '111')")
RESULTS+=("$(measure_workflow 'wpm run (medium ~18K events)' "$WPM run data/PrepaidTravelCost.xes --format json" 'data/PrepaidTravelCost.xes' '18246')")
RESULTS+=("$(measure_workflow 'wpm run (large ~86K events)' "$WPM run data/PermitLog.xes --format json" 'data/PermitLog.xes' '86581')")
echo "" >&2

echo "=== Phase 2: Algorithm Comparison ===" >&2
RESULTS+=("$(measure_workflow 'wpm compare (3 algorithms)' "$WPM compare dfg,heuristic_miner,alpha_plus_plus -i data/PrepaidTravelCost.xes --format json" 'data/PrepaidTravelCost.xes' '18246')")
echo "" >&2

echo "=== Phase 3: Conformance Analysis ===" >&2
RESULTS+=("$(measure_workflow 'wpm conformance' "$WPM conformance -i data/AN1-example.xes --format json" 'data/AN1-example.xes' '111')")
echo "" >&2

echo "=== Phase 4: Status & Utility Commands ===" >&2
RESULTS+=("$(measure_workflow 'wpm status' "$WPM status --format json" 'N/A' '0')")
RESULTS+=("$(measure_workflow 'wpm doctor' "$WPM doctor --format json" 'N/A' '0')")
echo "" >&2

# Write JSON report
cat > "$OUTPUT_FILE" <<EOF
{
  "baseline_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cycle": 53,
  "repository": "/Users/sac/wasm4pm",
  "git_branch": "$(git -C /Users/sac/wasm4pm rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "git_commit": "$(git -C /Users/sac/wasm4pm rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
  "wasm_metrics": {
    "binary_size_bytes": $WASM_SIZE,
    "binary_size_mb": "$WASM_SIZE_MB",
    "init_time_ms": $WASM_INIT_MS
  },
  "workflow_measurements": [
$(
  for i in "${!RESULTS[@]}"; do
    echo "${RESULTS[$i]}"
    if [ $((i + 1)) -lt ${#RESULTS[@]} ]; then
      echo ","
    fi
  done
)
  ],
  "total_workflows_measured": ${#RESULTS[@]}
}
EOF

echo "✓ Baseline report saved to: $OUTPUT_FILE" >&2
echo "" >&2

# Print summary
echo "=== PERFORMANCE BASELINE SUMMARY ===" >&2
jq '.' "$OUTPUT_FILE" | head -80 >&2
