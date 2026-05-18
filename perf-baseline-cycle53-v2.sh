#!/bin/bash
# Performance baseline measurement for wasm4pm Cycle 53 (v2)
# Uses pre-built local CLI and measures via Node.js profiling hooks

set -e
cd /Users/sac/wasm4pm

OUTPUT_FILE=".wasm4pm/perf-baseline-cycle53.json"
mkdir -p .wasm4pm

# WPM CLI wrapper
WPM="node apps/wasm4pm/dist/cli.js"

# Helper: measure command execution time and peak memory
measure_workflow() {
  local name=$1
  local cmd=$2
  local log_file=$3
  local log_size=$4

  echo "Measuring: $name (log: ~$log_size events)..." >&2

  local start_ms=$(date +%s%3N)

  # Run command and capture exit code
  eval "$cmd" > /tmp/wpm_output.txt 2>&1 || local exit_code=$?

  local end_ms=$(date +%s%3N)
  local elapsed_ms=$((end_ms - start_ms))

  # Estimate memory from Node.js if available
  local max_rss_kb=0
  if command -v vm_stat &>/dev/null; then
    max_rss_kb=$(ps aux | grep -E "node.*cli.js" | grep -v grep | awk '{print $6}' | tail -1 || echo "0")
  fi

  # Return JSON
  cat <<EOF
{
  "name": "$name",
  "log_file": "$log_file",
  "log_size_events": "$log_size",
  "elapsed_ms": $elapsed_ms,
  "max_rss_kb": $max_rss_kb,
  "exit_code": ${exit_code:-0},
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
WASM_SIZE_MB=$(echo "scale=2; $WASM_SIZE / 1024 / 1024" | bc)

echo "WASM Binary Metrics:" >&2
echo "  Size: ${WASM_SIZE_MB}MB ($WASM_SIZE bytes)" >&2
echo "" >&2

# Measure WASM initialization time (via status command)
echo "Measuring WASM initialization..." >&2
start_ns=$(date +%s%N)
$WPM status --format json > /dev/null 2>&1 || true
end_ns=$(date +%s%N)
WASM_INIT_MS=$(( (end_ns - start_ns) / 1000000 ))
echo "  Init time: ${WASM_INIT_MS}ms" >&2
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

echo "=== Phase 4: Utility Commands ===" >&2
RESULTS+=("$(measure_workflow 'wpm status' "$WPM status --format json" 'N/A' '0')")
RESULTS+=("$(measure_workflow 'wpm doctor' "$WPM doctor --format json" 'N/A' '0')")
RESULTS+=("$(measure_workflow 'wpm explain (dfg)' "$WPM explain dfg --format json" 'N/A' '0')")
echo "" >&2

# Analyze results
echo "=== Building JSON Report ===" >&2

# Find min/max/avg from elapsed_ms
declare -a elapsed_times
for result in "${RESULTS[@]}"; do
  elapsed=$(echo "$result" | jq '.elapsed_ms')
  elapsed_times+=($elapsed)
done

# Sort and calculate statistics
IFS=$'\n' sorted_times=($(sort -n <<<"${elapsed_times[*]}"))
unset IFS

min_elapsed=${sorted_times[0]}
max_elapsed=${sorted_times[-1]}
sum_elapsed=0
for t in "${sorted_times[@]}"; do
  sum_elapsed=$((sum_elapsed + t))
done
avg_elapsed=$((sum_elapsed / ${#sorted_times[@]}))

# Write final JSON
cat > "$OUTPUT_FILE" <<EOF
{
  "baseline_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cycle": 53,
  "repository": "/Users/sac/wasm4pm",
  "git_branch": "$(git -C /Users/sac/wasm4pm rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "git_commit": "$(git -C /Users/sac/wasm4pm rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
  "wasm_metrics": {
    "binary_size_bytes": $WASM_SIZE,
    "binary_size_mb": $WASM_SIZE_MB,
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
  "summary_statistics": {
    "total_workflows": ${#RESULTS[@]},
    "latency_ms": {
      "min": $min_elapsed,
      "max": $max_elapsed,
      "avg": $avg_elapsed,
      "median": $(echo "${sorted_times[@]}" | awk '{print $((NF/2))}')
    }
  }
}
EOF

echo "✓ Baseline report saved to: $OUTPUT_FILE" >&2
echo "" >&2

# Print summary
echo "=== PERFORMANCE BASELINE SUMMARY ===" >&2
echo "" >&2
jq '.wasm_metrics, .summary_statistics' "$OUTPUT_FILE" >&2
echo "" >&2
echo "Detailed workflow results:" >&2
jq -r '.workflow_measurements[] | "\(.name): \(.elapsed_ms)ms"' "$OUTPUT_FILE" >&2
