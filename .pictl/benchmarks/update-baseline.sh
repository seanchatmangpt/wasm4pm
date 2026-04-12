#!/bin/bash
# Update benchmark baselines after main branch merge
# Stores results in .pictl/benchmarks/baselines/ with timestamp and git metadata
# Usage: bash .pictl/benchmarks/update-baseline.sh [--ci]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../" && pwd)"
BASELINES_DIR="$SCRIPT_DIR/baselines"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
GIT_HASH=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
CI_MODE="${1:-}"

# Create baselines directory if it doesn't exist
mkdir -p "$BASELINES_DIR"

echo "=== Updating Benchmark Baselines ==="
echo "Timestamp:  $TIMESTAMP"
echo "Git Hash:   $GIT_HASH"
echo "Branch:     $GIT_BRANCH"
echo "CI Mode:    ${CI_MODE:-(native)}"
echo ""

# Save metadata for this baseline run
METADATA_FILE="$BASELINES_DIR/${TIMESTAMP}_metadata.json"
cat > "$METADATA_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "git_hash": "$GIT_HASH",
  "git_branch": "$GIT_BRANCH",
  "ci_mode": "${CI_MODE:-(native)}",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "Metadata saved to: $METADATA_FILE"

# Run benchmarks with appropriate settings
cd "$REPO_ROOT"

if [ "$CI_MODE" == "--ci" ]; then
  echo "Running benchmarks in CI mode (reduced profile time)..."
  make bench-ci
else
  echo "Running full benchmark suite..."
  make bench-rust
fi

# Criterion stores results in target/criterion/
# Extract and save per-algorithm results
CRITERION_DIR="$REPO_ROOT/wasm4pm/target/criterion"

if [ ! -d "$CRITERION_DIR" ]; then
  echo "Warning: Criterion directory not found at $CRITERION_DIR"
  exit 1
fi

# Collect all benchmark results into a consolidated JSON
BASELINE_FILE="$BASELINES_DIR/main-${TIMESTAMP}.json"

echo "Collecting benchmark results..."

# Function to extract metrics from Criterion benchmark directories
collect_benchmark_metrics() {
  local benchmark_name="$1"
  local benchmark_dir="$2"

  if [ ! -d "$benchmark_dir" ]; then
    echo "  Skipping $benchmark_name (not found)"
    return 0
  fi

  echo "  Processing $benchmark_name..."

  # Find all benchmark.json files in the directory (Criterion's output)
  if [ -f "$benchmark_dir/benchmark.json" ]; then
    cat "$benchmark_dir/benchmark.json"
  elif [ -f "$benchmark_dir/raw.json" ]; then
    cat "$benchmark_dir/raw.json"
  fi
}

# Aggregate all results
{
  echo "{"
  echo "  \"baseline_info\": {"
  echo "    \"timestamp\": \"$TIMESTAMP\","
  echo "    \"git_hash\": \"$GIT_HASH\","
  echo "    \"git_branch\": \"$GIT_BRANCH\","
  echo "    \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
  echo "  },"
  echo "  \"benchmarks\": ["

  # List all benchmark groups
  first=true
  for group_dir in "$CRITERION_DIR"/*; do
    if [ -d "$group_dir" ]; then
      group_name=$(basename "$group_dir")

      # Skip the "report" directory
      if [ "$group_name" == "report" ]; then
        continue
      fi

      if [ "$first" = true ]; then
        first=false
      else
        echo ","
      fi

      echo "    {"
      echo "      \"group\": \"$group_name\","
      echo "      \"results\": ["

      # Process sub-benchmarks
      result_first=true
      if [ -f "$group_dir/benchmark.json" ]; then
        if [ "$result_first" = true ]; then
          result_first=false
        else
          echo ","
        fi
        cat "$group_dir/benchmark.json" | jq '.' 2>/dev/null || echo "{}"
      fi

      echo "      ]"
      echo "    }"
    fi
  done

  echo "  ]"
  echo "}"
} > "$BASELINE_FILE"

echo ""
echo "Baseline file saved: $BASELINE_FILE"

# Create symlink to latest baseline
LATEST_LINK="$BASELINES_DIR/main-latest.json"
rm -f "$LATEST_LINK"
ln -s "$(basename "$BASELINE_FILE")" "$LATEST_LINK"
echo "Symlink created: $LATEST_LINK -> $(basename "$BASELINE_FILE")"

# Extract summary statistics
echo ""
echo "=== Baseline Summary ==="
if command -v jq &> /dev/null; then
  echo "Benchmark groups found:"
  jq -r '.benchmarks[].group' "$BASELINE_FILE" | sort | uniq

  # Count benchmarks per group
  echo ""
  echo "Benchmark counts:"
  jq -r '.benchmarks | length' "$BASELINE_FILE"
else
  echo "jq not found; skipping summary statistics"
fi

echo ""
echo "Baseline update complete!"
echo "Store baseline file in version control: git add .pictl/benchmarks/baselines/"
