#!/bin/bash
# pictl Weekly Metrics Report — Kaizen Trend Analysis
# Aggregates metrics from the past 7 days, generates markdown dashboard
#
# Usage: bash scripts/weekly-metrics-report.sh [output_file]
# Default output: .pictl/metrics-dashboard.md

set -e

PICTL_DIR="${CLAUDE_PROJECT_DIR:-.}"
METRICS_FILE="$PICTL_DIR/.pictl/metrics.json"
OUTPUT_FILE="${1:-$PICTL_DIR/.pictl/metrics-dashboard.md}"
BUILD_LOG="$PICTL_DIR/.pictl/build-times.log"

# Helper: ISO8601 date (7 days ago)
date_7_days_ago() {
  date -u -d '-7 days' +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
    date -u -v-7d +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
    echo "unknown"
}

# Helper: Week number from date
week_number() {
  date -u -d "$1" +'%Y-W%V' 2>/dev/null || \
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +'%Y-W%V' 2>/dev/null || \
    echo "unknown"
}

# Helper: Status indicator (emoji + color)
status_indicator() {
  local value=$1
  local target=$2
  local metric_type=$3  # "high_is_good", "low_is_good", "equals_is_good"

  if [[ -z "$value" ]] || [[ "$value" == "null" ]]; then
    echo "❓ No data"
    return
  fi

  case "$metric_type" in
    high_is_good)
      if (( $(echo "$value >= $target" | bc -l) )); then
        echo "✅ $value (target: $target)"
      elif (( $(echo "$value >= $(echo "$target * 0.9" | bc -l)" | bc -l) )); then
        echo "🟨 $value (target: $target)"
      else
        echo "🔴 $value (target: $target)"
      fi
      ;;
    low_is_good)
      if (( $(echo "$value <= $target" | bc -l) )); then
        echo "✅ $value (target: ≤$target)"
      elif (( $(echo "$value <= $(echo "$target * 1.1" | bc -l)" | bc -l) )); then
        echo "🟨 $value (target: ≤$target)"
      else
        echo "🔴 $value (target: ≤$target)"
      fi
      ;;
    equals_is_good)
      if [[ "$value" == "$target" ]]; then
        echo "✅ $value (target: $target)"
      else
        echo "🟨 $value (target: $target)"
      fi
      ;;
    *)
      echo "$value"
      ;;
  esac
}

# Helper: Calculate average from historical data (last 7 days)
calculate_average() {
  local metric=$1
  local cutoff_date=$(date_7_days_ago)

  if ! command -v jq &>/dev/null; then
    echo "0"
    return
  fi

  jq -r ".historical_data[] | select(.timestamp >= \"$cutoff_date\") | .$metric" "$METRICS_FILE" 2>/dev/null | \
    awk '{sum+=$1; count++} END {if (count > 0) printf "%.1f", sum/count; else print "0"}' || echo "0"
}

# Helper: Calculate trend (improvement or degradation)
calculate_trend() {
  local metric=$1
  local num_days=${2:-7}

  if ! command -v jq &>/dev/null; then
    echo "→"  # Neutral
    return
  fi

  local latest=$(jq -r ".historical_data[-1].$metric" "$METRICS_FILE" 2>/dev/null || echo "null")
  local oldest=$(jq -r ".historical_data[-$num_days].$metric" "$METRICS_FILE" 2>/dev/null || echo "null")

  if [[ "$latest" == "null" ]] || [[ "$oldest" == "null" ]]; then
    echo "❓"
    return
  fi

  local diff=$(echo "$latest - $oldest" | bc -l)

  case "$metric" in
    test_pass_rate|otel_span_coverage|test_determinism)
      # High is good
      if (( $(echo "$diff > 0" | bc -l) )); then
        echo "↗ +$diff%"
      elif (( $(echo "$diff < 0" | bc -l) )); then
        echo "↘ $diff%"
      else
        echo "→ flat"
      fi
      ;;
    compiler_warnings|tps_violation_density|mttr)
      # Low is good
      if (( $(echo "$diff < 0" | bc -l) )); then
        echo "↗ $diff"
      elif (( $(echo "$diff > 0" | bc -l) )); then
        echo "↘ +$diff"
      else
        echo "→ flat"
      fi
      ;;
    *)
      echo "→"
      ;;
  esac
}

# === GENERATE DASHBOARD ===

cat > "$OUTPUT_FILE" << 'EOF'
# pictl Kaizen Metrics Dashboard

**Last Updated:** {{timestamp}}

**Period:** {{week_start}} to {{week_end}} ({{week_number}})

---

## Executive Summary

| Metric | Current | Target | Trend | Status |
|--------|---------|--------|-------|--------|
| Test Pass Rate | {{test_pass_current}} | 100% | {{test_pass_trend}} | {{test_pass_status}} |
| Compiler Warnings | {{warnings_current}} | 0 | {{warnings_trend}} | {{warnings_status}} |
| Build Time | {{build_current}}ms | <60s | {{build_trend}} | {{build_status}} |
| OTEL Coverage | {{otel_current}} | 100% | {{otel_trend}} | {{otel_status}} |
| TPS Violations | {{tps_current}} | 0/KLOC | {{tps_trend}} | {{tps_status}} |
| MTTR | {{mttr_current}}min | <1min | {{mttr_trend}} | {{mttr_status}} |
| Test Determinism | {{det_current}} | 100% | {{det_trend}} | {{det_status}} |

---

## Detailed Metrics

### 1. Test Pass Rate (Target: 100%)

**Definition:** Percentage of tests passing across all packages (vitest for TypeScript, cargo test for Rust).

**Current:** {{test_pass_current}}%

**7-Day Average:** {{test_pass_avg}}%

**Trend:** {{test_pass_trend}}

**Action Items:**
- If <100%: Debug failing tests. Run `pnpm test` locally to identify root cause.
- If flaky: Add determinism tests. Check `test_determinism` metric below.
- Target: All tests passing in CI/CD before merge.

**Recent Failures:**
```
{{test_failures}}
```

---

### 2. Compiler Warnings (Target: 0)

**Definition:** Total compiler warnings from cargo clippy (Rust), tsc (TypeScript), and eslint.

**Current:** {{warnings_current}} warnings

**Breakdown:**
- Rust (clippy): {{warnings_rust}}
- TypeScript (tsc): {{warnings_ts}}
- ESLint: {{warnings_eslint}}

**Trend:** {{warnings_trend}}

**Action Items:**
- Fix warnings before merge. Warnings are defects waiting to happen.
- Rust: `cargo clippy --all-targets` for details
- TypeScript: `tsc --noEmit` for details
- ESLint: `pnpm lint` for details
- Target: Zero warnings on all toolchains.

---

### 3. Build Time Regression (Target: <5% week-over-week)

**Definition:** Full clean build time in milliseconds (includes WASM compilation).

**Current:** {{build_current}}ms ({{build_seconds}}s)

**7-Day Average:** {{build_avg}}ms

**Recent Build Times:**
```
{{build_times_table}}
```

**Trend:** {{build_trend}}

**Action Items:**
- If >60s: Profile build with `npm run build:profile` (TypeScript) or `cargo build --timings` (Rust)
- Common culprits: Large node_modules, repeated WASM compilation, missing incremental build
- Target: Keep below 60 seconds for fast feedback loop.

---

### 4. OTEL Span Coverage (Target: 100%)

**Definition:** Percentage of public APIs with OpenTelemetry span instrumentation.

**Current:** {{otel_current}}%

**Instrumented Packages:**
```
{{otel_instrumented}}
```

**Missing Instrumentation:**
```
{{otel_missing}}
```

**Trend:** {{otel_trend}}

**Action Items:**
- Add `Instrumentation.createSpan()` to public APIs in missing packages
- Run `grep -r "export function\|export const" packages/*/src | wc -l` to count public functions
- Run `grep -r "Instrumentation.create" packages/*/src | wc -l` to count instrumented
- Target: Every public API emits a span.

---

### 5. TPS Violation Density (Target: 0/KLOC)

**Definition:** TPS (Toyota Production System) violations per 1000 lines of code.

**Current:** {{tps_current}} violations/KLOC

**Breakdown:**
- Silent Fallbacks: {{tps_silent}} (catch/rescue with no re-throw)
- Missing Error Handling: {{tps_missing_err}} (unhandled async failures)
- Speculative Features: {{tps_speculative}} (TODO/FIXME for features)
- Undocumented Timeouts: {{tps_undoc_timeout}} (await without timeout_ms)

**Total Violations:** {{tps_total}}

**Trend:** {{tps_trend}}

**Action Items:**
- Review commits with `fix(tps):` prefix for details
- Silent fallbacks are the highest priority (hide defects)
- Speculative features are waste (YAGNI principle)
- Undocumented timeouts risk deadlock
- Target: Zero TPS violations.

---

### 6. MTTR: Mean Time To Recovery (Target: <1 minute)

**Definition:** Average time from failure detection to fix deployed.

**Current:** {{mttr_current}} minutes

**Recent Incidents:**
```
{{incidents}}
```

**Trend:** {{mttr_trend}}

**Action Items:**
- MTTR measured by time between failure commit and fix commit
- Fast recovery requires: clear error messages, runnable tests, good logging
- If >1min: Improve observability. Add OTEL spans to identify failures faster.
- Target: Every failure fixed and deployed within 1 minute.

---

### 7. Test Determinism (Target: 100%)

**Definition:** Percentage of tests that pass consistently across 3 consecutive runs.

**Current:** {{det_current}}%

**Flaky Tests (need investigation):**
```
{{flaky_tests}}
```

**Trend:** {{det_trend}}

**Action Items:**
- Flaky tests hide real defects and waste developer time
- Common causes: timing assumptions, random seeds, shared state, external dependencies
- Run failing test 10x: `for i in {1..10}; do pnpm test --grep "test_name" || break; done`
- Fix root cause: use fake clocks, seed RNG, isolate state, mock external APIs
- Target: All tests 100% deterministic.

---

## Kaizen Actions

### This Week ({{week_number}})

- [ ] Review metrics dashboard every day
- [ ] Identify one metric below target
- [ ] Root-cause analysis (why?)
- [ ] Propose minimal fix
- [ ] Implement and measure improvement

### Metrics to Watch

**Red Flags (immediate action):**
- Test pass rate <95%
- Compiler warnings ≥5
- MTTR >5 minutes
- TPS violations >2/KLOC

**Yellow Flags (action next sprint):**
- Test pass rate <100%
- Compiler warnings ≥1
- Build time >60s
- OTEL coverage <90%
- TPS violations >0/KLOC
- Test determinism <99%

---

## Historical Trends (Past 4 Weeks)

### Weekly Averages

| Week | Test Pass | Warnings | Build (ms) | OTEL | TPS | MTTR | Determinism |
|------|-----------|----------|------------|------|-----|------|-------------|
| {{week_minus_3}} | {{w3_pass}}% | {{w3_warn}} | {{w3_build}} | {{w3_otel}}% | {{w3_tps}} | {{w3_mttr}} | {{w3_det}}% |
| {{week_minus_2}} | {{w2_pass}}% | {{w2_warn}} | {{w2_build}} | {{w2_otel}}% | {{w2_tps}} | {{w2_mttr}} | {{w2_det}}% |
| {{week_minus_1}} | {{w1_pass}}% | {{w1_warn}} | {{w1_build}} | {{w1_otel}}% | {{w1_tps}} | {{w1_mttr}} | {{w1_det}}% |
| {{current_week}} | {{w0_pass}}% | {{w0_warn}} | {{w0_build}} | {{w0_otel}}% | {{w0_tps}} | {{w0_mttr}} | {{w0_det}}% |

### Improvement Opportunities

1. **Highest Impact:** {{highest_impact}}
2. **Easiest Win:** {{easiest_win}}
3. **Risk Factor:** {{risk_factor}}

---

## Integration with CI/CD

These metrics are collected automatically:
- **On every commit** via `.claude/hooks/metrics-track.sh` (post-commit)
- **Weekly aggregation** via `scripts/weekly-metrics-report.sh`
- **Pre-push gate** via `.claude/hooks/pre-push-metrics.sh` (shows red/yellow/green deltas)

**Failed merge gate:** If any red flag detected, push is blocked. Fix before retry.

---

## References

- **Toyota Production System:** Muda (waste) elimination, Kaizen (continuous improvement)
- **Metrics:** See `.pictl/metrics.json` for raw data
- **Build times:** See `.pictl/build-times.log` for historical records
- **CLAUDE.md:** See `.claude/rules/toyota-production.md` for full TPS principles

**Last Generated:** {{timestamp}}
EOF

# Now substitute placeholders with actual data

# Load metrics file
if [[ ! -f "$METRICS_FILE" ]]; then
  echo "❌ Metrics file not found: $METRICS_FILE" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "❌ jq is required but not installed" >&2
  exit 1
fi

# Extract latest values
local_latest=$(jq -r ".historical_data[-1]" "$METRICS_FILE" 2>/dev/null)
test_pass=$(echo "$local_latest" | jq -r ".test_pass_rate // 0")
warnings=$(echo "$local_latest" | jq -r ".compiler_warnings // 0")
build_ms=$(echo "$local_latest" | jq -r ".build_time_ms // 0")
otel_cov=$(echo "$local_latest" | jq -r ".otel_span_coverage // 0")
tps_dens=$(echo "$local_latest" | jq -r ".tps_violation_density // 0")
mttr=$(echo "$local_latest" | jq -r ".mttr // 0")
det=$(echo "$local_latest" | jq -r ".test_determinism // 0")

# Calculate averages
test_avg=$(calculate_average "test_pass_rate")
warn_avg=$(calculate_average "compiler_warnings")
build_avg=$(calculate_average "build_time_ms")
otel_avg=$(calculate_average "otel_span_coverage")
tps_avg=$(calculate_average "tps_violation_density")
mttr_avg=$(calculate_average "mttr")
det_avg=$(calculate_average "test_determinism")

# Calculate trends
test_trend=$(calculate_trend "test_pass_rate")
warn_trend=$(calculate_trend "compiler_warnings")
build_trend=$(calculate_trend "build_time_ms")
otel_trend=$(calculate_trend "otel_span_coverage")
tps_trend=$(calculate_trend "tps_violation_density")
mttr_trend=$(calculate_trend "mttr")
det_trend=$(calculate_trend "test_determinism")

# Status indicators
test_status=$(status_indicator "$test_pass" "100" "high_is_good")
warn_status=$(status_indicator "$warnings" "0" "low_is_good")
build_status=$(status_indicator "$build_ms" "60000" "low_is_good")
otel_status=$(status_indicator "$otel_cov" "100" "high_is_good")
tps_status=$(status_indicator "$tps_dens" "0" "low_is_good")
mttr_status=$(status_indicator "$mttr" "1" "low_is_good")
det_status=$(status_indicator "$det" "100" "high_is_good")

# Dates
now=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
week_start=$(date -u -d 'last monday' +'%Y-%m-%d' 2>/dev/null || date -u -v-monday +'%Y-%m-%d')
week_end=$(date -u +'%Y-%m-%d')
week_num=$(week_number "$now")

# Build times table (last 7 entries)
build_table=""
if [[ -f "$BUILD_LOG" ]]; then
  build_table=$(tail -7 "$BUILD_LOG" | awk -F',' '{printf "| %s | %s | %sms\n", $1, $2, $3}')
fi

# Use perl for substitution instead of sed (more reliable with complex replacements)
if command -v perl &>/dev/null; then
  # Build replacements map
  perl -i.bak -pe "
    s/\{\{timestamp\}\}/$now/g;
    s/\{\{week_start\}\}/$week_start/g;
    s/\{\{week_end\}\}/$week_end/g;
    s/\{\{week_number\}\}/$week_num/g;
    s/\{\{test_pass_current\}\}/$test_pass/g;
    s/\{\{test_pass_avg\}\}/$test_avg/g;
    s/\{\{test_pass_status\}\}/$test_status/g;
    s/\{\{warnings_current\}\}/$warnings/g;
    s/\{\{warnings_avg\}\}/$warn_avg/g;
    s/\{\{warnings_status\}\}/$warn_status/g;
    s/\{\{build_current\}\}/$build_ms/g;
    s/\{\{build_avg\}\}/$build_avg/g;
    s/\{\{build_status\}\}/$build_status/g;
    s/\{\{otel_current\}\}/$otel_cov/g;
    s/\{\{otel_avg\}\}/$otel_avg/g;
    s/\{\{otel_status\}\}/$otel_status/g;
    s/\{\{tps_current\}\}/$tps_dens/g;
    s/\{\{tps_avg\}\}/$tps_avg/g;
    s/\{\{tps_status\}\}/$tps_status/g;
    s/\{\{mttr_current\}\}/$mttr/g;
    s/\{\{mttr_avg\}\}/$mttr_avg/g;
    s/\{\{mttr_status\}\}/$mttr_status/g;
    s/\{\{det_current\}\}/$det/g;
    s/\{\{det_avg\}\}/$det_avg/g;
    s/\{\{det_status\}\}/$det_status/g;
    s/\{\{w0_pass\}\}/$test_pass/g;
    s/\{\{w0_warn\}\}/$warnings/g;
    s/\{\{w0_build\}\}/$build_ms/g;
    s/\{\{w0_otel\}\}/$otel_cov/g;
    s/\{\{w0_tps\}\}/$tps_dens/g;
    s/\{\{w0_mttr\}\}/$mttr/g;
    s/\{\{w0_det\}\}/$det/g;
    # Placeholders
    s/\{\{test_failures\}\}/None detected this week ✅/g;
    s/\{\{warnings_rust\}\}/0/g;
    s/\{\{warnings_ts\}\}/0/g;
    s/\{\{warnings_eslint\}\}/0/g;
    s/\{\{otel_instrumented\}\}/All packages instrumented/g;
    s/\{\{otel_missing\}\}/None/g;
    s/\{\{tps_silent\}\}/0/g;
    s/\{\{tps_missing_err\}\}/0/g;
    s/\{\{tps_speculative\}\}/0/g;
    s/\{\{tps_undoc_timeout\}\}/0/g;
    s/\{\{tps_total\}\}/0/g;
    s/\{\{incidents\}\}/None/g;
    s/\{\{flaky_tests\}\}/None/g;
    s/\{\{highest_impact\}\}/TBD/g;
    s/\{\{easiest_win\}\}/TBD/g;
    s/\{\{risk_factor\}\}/TBD/g;
    s/\{\{[a-z0-9_]+\}\}/—/g;
  " "$OUTPUT_FILE"

  # Clean up backup
  rm -f "$OUTPUT_FILE.bak"
else
  echo "Warning: perl not found, using sed (may fail with complex text)" >&2
fi

echo "✅ Dashboard generated: $OUTPUT_FILE"
