#!/bin/bash
# Performance baseline measurement for wasm4pm Cycle 53
# Measures latency, memory, and CPU across representative workflows

set -e

cd /Users/sac/wasm4pm

# Output file
OUTPUT_FILE=".wasm4pm/perf-baseline-cycle53.json"
mkdir -p .wasm4pm

# Temp files for measurements
TIMING_FILE=$(mktemp)
RESULTS_FILE=$(mktemp)

# Helper: measure command with timing and memory
measure_workflow() {
  local name=$1
  local cmd=$2
  local log_file=$3
  local log_size=$4

  echo "Measuring: $name (log: $log_file, ~$log_size events)" >&2

  # Use /usr/bin/time for resource measurement
  local start_ns=$(date +%s%N)

  # Capture output and timing
  local time_output
  time_output=$( { /usr/bin/time -v $cmd 2>&1; } || true)

  local end_ns=$(date +%s%N)
  local elapsed_ms=$(( (end_ns - start_ns) / 1000000 ))

  # Parse /usr/bin/time output
  local max_rss=$(echo "$time_output" | grep "Maximum resident set size" | awk '{print $6}' || echo "0")
  local user_time=$(echo "$time_output" | grep "User time" | awk '{print $4}' | sed 's/[^0-9.]//g' || echo "0")
  local system_time=$(echo "$time_output" | grep "System time" | awk '{print $4}' | sed 's/[^0-9.]//g' || echo "0")

  # Convert to seconds and ms
  local user_ms=$(echo "$user_time * 1000" | bc)
  local system_ms=$(echo "$system_time * 1000" | bc)

  # Return JSON
  cat <<EOF
{
  "name": "$name",
  "log_file": "$log_file",
  "log_size_events": "$log_size",
  "elapsed_ms": $elapsed_ms,
  "user_time_ms": $user_ms,
  "system_time_ms": $system_ms,
  "max_rss_kb": $max_rss,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Ensure wpm CLI is available
if ! command -v wpm &> /dev/null; then
  echo "ERROR: wpm command not found. Building TypeScript CLI..." >&2
  cd apps/wasm4pm
  npm run build
  cd /Users/sac/wasm4pm
fi

echo "Starting performance baseline measurements..." >&2
echo ""

# Array to collect all results
declare -a RESULTS

# 1. wpm run — small log (<1K events)
echo "=== Phase 1: wpm run (small, medium, large) ===" >&2
RESULTS+=("$(measure_workflow 'wpm run (small ~100 events)' 'wpm run data/AN1-example.xes --format json' 'data/AN1-example.xes' '111')")
RESULTS+=("$(measure_workflow 'wpm run (medium ~18K events)' 'wpm run data/PrepaidTravelCost.xes --format json' 'data/PrepaidTravelCost.xes' '18246')")
RESULTS+=("$(measure_workflow 'wpm run (large ~86K events)' 'wpm run data/PermitLog.xes --format json' 'data/PermitLog.xes' '86581')")

# 2. wpm compare — 3 algorithms on medium log
echo "=== Phase 2: wpm compare ===" >&2
RESULTS+=("$(measure_workflow 'wpm compare (dfg, heuristic, alpha)' 'wpm compare dfg,heuristic_miner,alpha_plus_plus -i data/PrepaidTravelCost.xes --format json' 'data/PrepaidTravelCost.xes' '18246')")

# 3. wpm conformance — fitness check
echo "=== Phase 3: wpm conformance ===" >&2
# First create a model via discovery
echo "Generating model for conformance test..." >&2
wpm run data/AN1-example.xes --algorithm dfg --format json > /tmp/model.json 2>/dev/null || true
RESULTS+=("$(measure_workflow 'wpm conformance (fitness check)' 'wpm conformance -i data/AN1-example.xes --format json' 'data/AN1-example.xes' '111')")

# 4. wpm predict — next-activity (if available)
echo "=== Phase 4: wpm predict ===" >&2
if wpm predict --help &>/dev/null; then
  RESULTS+=("$(measure_workflow 'wpm predict (next-activity)' 'wpm predict next-activity -i data/PrepaidTravelCost.xes --format json' 'data/PrepaidTravelCost.xes' '18246')")
else
  echo "wpm predict not available, skipping" >&2
fi

# 5. wpm ml — clustering, PCA, anomaly
echo "=== Phase 5: wpm ml ===" >&2
if wpm ml --help &>/dev/null; then
  RESULTS+=("$(measure_workflow 'wpm ml (cluster)' 'wpm ml cluster -i data/AN1-example.xes --format json' 'data/AN1-example.xes' '111')")
  RESULTS+=("$(measure_workflow 'wpm ml (pca)' 'wpm ml pca -i data/AN1-example.xes --format json' 'data/AN1-example.xes' '111')")
  RESULTS+=("$(measure_workflow 'wpm ml (anomaly)' 'wpm ml anomaly -i data/AN1-example.xes --format json' 'data/AN1-example.xes' '111')")
else
  echo "wpm ml not available, skipping" >&2
fi

# 6. WASM binary load time
echo "=== Phase 6: WASM binary metrics ===" >&2
WASM_SIZE=$(ls -l wasm4pm/pkg/wasm4pm_bg.wasm | awk '{print $5}')
WASM_SIZE_MB=$(echo "scale=2; $WASM_SIZE / 1024 / 1024" | bc)
echo "WASM binary size: ${WASM_SIZE_MB}MB" >&2

# Measure pure WASM initialization (wpm status is lightweight)
start_ns=$(date +%s%N)
wpm status > /dev/null 2>&1 || true
end_ns=$(date +%s%N)
WASM_INIT_MS=$(( (end_ns - start_ns) / 1000000 ))

# Build final JSON output
cat > "$OUTPUT_FILE" <<EOF
{
  "baseline_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cycle": 53,
  "repository": "/Users/sac/wasm4pm",
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
  "analysis": {
    "total_workflows": ${#RESULTS[@]},
    "measurements_complete": true
  }
}
EOF

echo "" >&2
echo "✓ Baseline saved to: $OUTPUT_FILE" >&2
echo "" >&2

# Display summary
echo "=== PERFORMANCE BASELINE SUMMARY ===" >&2
jq '.wasm_metrics' "$OUTPUT_FILE" >&2
echo "" >&2
echo "Workflows measured:" >&2
jq -r '.workflow_measurements[] | "\(.name): \(.elapsed_ms)ms (mem: \(.max_rss_kb)KB)"' "$OUTPUT_FILE" >&2

# Cleanup
rm -f "$TIMING_FILE" "$RESULTS_FILE"
