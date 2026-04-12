#!/bin/bash
# pictl Pre-Push Metrics Gate — Red/Yellow/Green Delta Display
# Checks metrics deltas since last push and displays color-coded status
# Blocks push if red flags detected
#
# Called by: git hook (manual setup required in .git/hooks/pre-push)
# Exit code: 0 (allow push), 1 (block push with red flags)

set -e

PICTL_DIR="${CLAUDE_PROJECT_DIR:-.}"
METRICS_FILE="$PICTL_DIR/.pictl/metrics.json"

if [[ ! -f "$METRICS_FILE" ]]; then
  echo "⚠️  Metrics file not found. Skipping pre-push gate." >&2
  exit 0  # Non-blocking
fi

if ! command -v jq &>/dev/null; then
  echo "⚠️  jq not found. Skipping pre-push gate." >&2
  exit 0
fi

# Helper: Get metric value
get_metric() {
  local metric=$1
  local index=${2:--1}  # Default to latest
  jq -r ".historical_data[$index].$metric // null" "$METRICS_FILE" 2>/dev/null || echo "null"
}

# Helper: Compare and flag
check_red_flag() {
  local metric=$1
  local current=$2
  local threshold=$3

  case "$metric" in
    test_pass_rate)
      if (( $(echo "$current < 95" | bc -l) )); then
        return 0  # Red flag
      fi
      ;;
    compiler_warnings)
      if (( $(echo "$current >= 5" | bc -l) )); then
        return 0  # Red flag
      fi
      ;;
    mttr)
      if (( $(echo "$current > 5" | bc -l) )); then
        return 0  # Red flag
      fi
      ;;
    tps_violation_density)
      if (( $(echo "$current > 2" | bc -l) )); then
        return 0  # Red flag
      fi
      ;;
  esac

  return 1  # No red flag
}

# Helper: Compare and flag (yellow)
check_yellow_flag() {
  local metric=$1
  local current=$2
  local threshold=$3

  case "$metric" in
    test_pass_rate)
      if (( $(echo "$current < 100" | bc -l) )); then
        return 0  # Yellow flag
      fi
      ;;
    compiler_warnings)
      if (( $(echo "$current >= 1" | bc -l) )); then
        return 0  # Yellow flag
      fi
      ;;
    build_time_ms)
      if (( $(echo "$current > 60000" | bc -l) )); then
        return 0  # Yellow flag
      fi
      ;;
    otel_span_coverage)
      if (( $(echo "$current < 100" | bc -l) )); then
        return 0  # Yellow flag
      fi
      ;;
    tps_violation_density)
      if (( $(echo "$current > 0" | bc -l) )); then
        return 0  # Yellow flag
      fi
      ;;
    test_determinism)
      if (( $(echo "$current < 99" | bc -l) )); then
        return 0  # Yellow flag
      fi
      ;;
  esac

  return 1  # No yellow flag
}

# === MAIN CHECK ===

echo ""
echo "pictl Pre-Push Metrics Gate"
echo "=============================="
echo ""

declare -a red_flags
declare -a yellow_flags
declare -a green_metrics

# Get latest metrics
test_pass=$(get_metric "test_pass_rate")
warnings=$(get_metric "compiler_warnings")
build_ms=$(get_metric "build_time_ms")
otel_cov=$(get_metric "otel_span_coverage")
tps_dens=$(get_metric "tps_violation_density")
mttr=$(get_metric "mttr")
det=$(get_metric "test_determinism")

# Check test pass rate
if [[ "$test_pass" != "null" ]]; then
  if check_red_flag "test_pass_rate" "$test_pass"; then
    red_flags+=("🔴 Test Pass Rate: $test_pass% < 95% (CRITICAL)")
  elif check_yellow_flag "test_pass_rate" "$test_pass"; then
    yellow_flags+=("🟨 Test Pass Rate: $test_pass% < 100%")
  else
    green_metrics+=("✅ Test Pass Rate: $test_pass%")
  fi
fi

# Check compiler warnings
if [[ "$warnings" != "null" ]]; then
  if check_red_flag "compiler_warnings" "$warnings"; then
    red_flags+=("🔴 Compiler Warnings: $warnings ≥ 5 (CRITICAL)")
  elif check_yellow_flag "compiler_warnings" "$warnings"; then
    yellow_flags+=("🟨 Compiler Warnings: $warnings ≥ 1")
  else
    green_metrics+=("✅ Compiler Warnings: $warnings")
  fi
fi

# Check build time
if [[ "$build_ms" != "null" ]]; then
  local build_sec=$(echo "scale=1; $build_ms / 1000" | bc)
  if check_yellow_flag "build_time_ms" "$build_ms"; then
    yellow_flags+=("🟨 Build Time: ${build_sec}s > 60s")
  else
    green_metrics+=("✅ Build Time: ${build_sec}s")
  fi
fi

# Check OTEL coverage
if [[ "$otel_cov" != "null" ]]; then
  if check_yellow_flag "otel_span_coverage" "$otel_cov"; then
    yellow_flags+=("🟨 OTEL Coverage: $otel_cov% < 100%")
  else
    green_metrics+=("✅ OTEL Coverage: $otel_cov%")
  fi
fi

# Check TPS violations
if [[ "$tps_dens" != "null" ]]; then
  if check_red_flag "tps_violation_density" "$tps_dens"; then
    red_flags+=("🔴 TPS Violations: $tps_dens/KLOC > 2 (CRITICAL)")
  elif check_yellow_flag "tps_violation_density" "$tps_dens"; then
    yellow_flags+=("🟨 TPS Violations: $tps_dens/KLOC > 0")
  else
    green_metrics+=("✅ TPS Violations: $tps_dens/KLOC")
  fi
fi

# Check MTTR
if [[ "$mttr" != "null" ]]; then
  if check_red_flag "mttr" "$mttr"; then
    red_flags+=("🔴 MTTR: $mttr min > 5 min (CRITICAL)")
  else
    green_metrics+=("✅ MTTR: $mttr min")
  fi
fi

# Check test determinism
if [[ "$det" != "null" ]]; then
  if check_yellow_flag "test_determinism" "$det"; then
    yellow_flags+=("🟨 Test Determinism: $det% < 99%")
  else
    green_metrics+=("✅ Test Determinism: $det%")
  fi
fi

# === OUTPUT ===

# Green metrics
if [[ ${#green_metrics[@]} -gt 0 ]]; then
  echo "Passing Metrics:"
  for metric in "${green_metrics[@]}"; do
    echo "  $metric"
  done
  echo ""
fi

# Yellow flags (warnings)
if [[ ${#yellow_flags[@]} -gt 0 ]]; then
  echo "Action Items (Yellow Flags):"
  for flag in "${yellow_flags[@]}"; do
    echo "  $flag"
  done
  echo ""
fi

# Red flags (blocking)
if [[ ${#red_flags[@]} -gt 0 ]]; then
  echo "BLOCKING ISSUES (Red Flags):"
  for flag in "${red_flags[@]}"; do
    echo "  $flag"
  done
  echo ""
  echo "❌ Push BLOCKED. Fix red flag issues before retry."
  echo ""
  echo "Recovery Steps:"
  for flag in "${red_flags[@]}"; do
    case "$flag" in
      *"Test Pass Rate"*)
        echo "  1. Run: pnpm test"
        echo "  2. Fix failing tests"
        echo "  3. Verify: pnpm test (all passing)"
        ;;
      *"Compiler Warnings"*)
        echo "  1. Run: cargo clippy --all-targets (Rust)"
        echo "  2. Run: tsc --noEmit (TypeScript)"
        echo "  3. Run: pnpm lint (ESLint)"
        echo "  4. Fix all warnings"
        ;;
      *"TPS Violations"*)
        echo "  1. Review: grep -r 'catch\|rescue' packages/ | head -10"
        echo "  2. Fix silent fallbacks: add error handling"
        echo "  3. Verify: pnpm test (all passing)"
        ;;
      *"MTTR"*)
        echo "  1. Review recent failures: git log --oneline -5"
        echo "  2. Add observability: grep -r 'TODO\|FIXME' packages/"
        echo "  3. Improve error messages and logging"
        ;;
    esac
  done
  echo ""
  exit 1  # Block push
fi

# All metrics pass
echo "✅ Pre-Push Metrics Gate: PASS"
echo "All metrics within acceptable ranges. Push allowed."
echo ""
exit 0
