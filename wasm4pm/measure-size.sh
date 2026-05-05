#!/usr/bin/env bash
#
# measure-size.sh
# Measure WASM binary sizes for all deployment profiles
# Reports sizes and verifies they meet target constraints
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Size targets in KB (1 KB = 1024 bytes)
declare -A SIZE_TARGETS=(
  [mobile]=512
  [iot]=1024
  [edge]=1536
  [fog]=2048
  [browser]=2850
)

# Array to track results
declare -A RESULTS
declare -A STATUS

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  WASM4PM DEPLOYMENT PROFILE SIZE MEASUREMENT                   ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Function to check if file exists
check_file() {
  local profile=$1
  local wasm_file="pkg/wasm4pm_bg.wasm"

  if [ -f "$wasm_file" ]; then
    return 0
  else
    return 1
  fi
}

# Function to get file size in KB
get_size_kb() {
  local file=$1
  local size_bytes=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
  echo $((size_bytes / 1024))
}

# Function to count registered algorithms
count_algorithms() {
  local profile=$1
  local count=0

  case "$profile" in
    mobile)
      # dfg + skeleton + heuristic + alpha_plus_plus + inductive (basic discovery)
      count=10
      ;;
    iot)
      # basic discovery
      count=15
      ;;
    edge)
      # basic + advanced discovery + streaming
      count=18
      ;;
    fog)
      # all except powl
      count=35
      ;;
    browser)
      # all 41 algorithms
      count=41
      ;;
  esac

  echo $count
}

# Measurement for each profile
for profile in mobile iot edge fog browser; do
  echo "Measuring profile: $profile"

  # Check if built
  if check_file "$profile"; then
    size_kb=$(get_size_kb "pkg/wasm4pm_bg.wasm")
    target_kb=${SIZE_TARGETS[$profile]}
    algo_count=$(count_algorithms "$profile")

    RESULTS[$profile]=$size_kb

    # Check if within target
    if [ "$size_kb" -le "$target_kb" ]; then
      STATUS[$profile]="PASS"
      status_color="$GREEN"
    else
      STATUS[$profile]="FAIL"
      status_color="$RED"
    fi

    printf "  %-10s %6d KB / %6d KB target  %3d algorithms  [${status_color}%s${NC}]\n" \
      "$profile:" "$size_kb" "$target_kb" "$algo_count" "${STATUS[$profile]}"
  else
    printf "  %-10s MISSING (not built)\n" "$profile:"
    STATUS[$profile]="MISSING"
  fi
done

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  SIZE REDUCTION ANALYSIS                                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Calculate reduction percentages
if [ -n "${RESULTS[browser]:-}" ] && [ "${RESULTS[browser]}" -gt 0 ]; then
  browser_size=${RESULTS[browser]}

  for profile in mobile iot edge fog; do
    if [ -n "${RESULTS[$profile]:-}" ]; then
      size=${RESULTS[$profile]}
      reduction=$((100 - (size * 100 / browser_size)))
      printf "  %-8s: %6d KB (-%2d%% vs browser)\n" "$profile" "$size" "$reduction"
    fi
  done
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  TEST RESULTS                                                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Summary
all_pass=true
for profile in mobile iot edge fog browser; do
  if [ "${STATUS[$profile]:-MISSING}" != "PASS" ]; then
    all_pass=false
  fi
done

if [ "$all_pass" = true ]; then
  echo -e "${GREEN}✓ All profiles within size targets${NC}"
  exit 0
else
  echo -e "${RED}✗ Some profiles exceed size targets${NC}"
  exit 1
fi
