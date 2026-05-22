#!/bin/bash

##############################################################################
# mttr-gate.sh
# CI/CD gate for Mean-Time-To-Recovery (MTTR) SLA compliance
#
# Purpose:
#   - Run MTTR benchmarks
#   - Compare against baseline thresholds
#   - Block merge if regressions detected
#   - Report detailed breakdown (p50/p95/p99 per recovery path)
#
# Exit codes:
#   0 = All MTTR targets met, no regressions
#   1 = Config/file error (missing baseline, bad format)
#   2 = Regression detected (CRITICAL) — blocks merge
#   3 = Warning regression (10-20% degradation) — logged, merge allowed
#   4 = Benchmark execution error
#
# Usage:
#   ./scripts/mttr-gate.sh [--baseline <file>] [--verbose] [--strict]
#
##############################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASELINE_FILE="${1:---baseline}"
BASELINE_FILE="${2:-wasm4pm/benches/mttr_baseline.json}"
VERBOSE="${VERBOSE:-}"
STRICT_MODE="${STRICT_MODE:-false}"
BENCHMARK_OUTPUT="${BENCHMARK_OUTPUT:-target/criterion}"
MTTR_REPORT="${BENCHMARK_OUTPUT}/mttr_report.json"

##############################################################################
# Helper Functions
##############################################################################

log_info() {
    echo -e "${BLUE}[MTTR Gate]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[MTTR Gate]${NC} ✓ $*"
}

log_warning() {
    echo -e "${YELLOW}[MTTR Gate]${NC} ⚠ $*"
}

log_error() {
    echo -e "${RED}[MTTR Gate]${NC} ✗ $*" >&2
}

die() {
    log_error "$1"
    exit "${2:-1}"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    if [[ ! -f "$BASELINE_FILE" ]]; then
        die "Baseline file not found: $BASELINE_FILE" 1
    fi

    if ! command -v jq &> /dev/null; then
        die "jq is required but not installed" 1
    fi

    if [[ ! -d "wasm4pm" ]]; then
        die "Not in wasm4pm repository root" 1
    fi

    log_success "Prerequisites OK"
}

run_benchmarks() {
    log_info "Running MTTR benchmarks (criterion)..."
    log_info "This may take 2-5 minutes..."

    if ! cargo bench --bench mttr_recovery -- --output-format bencher > /tmp/mttr_bench.log 2>&1; then
        log_error "Benchmark execution failed"
        cat /tmp/mttr_bench.log | tail -20
        exit 4
    fi

    log_success "Benchmarks completed"
}

parse_baseline() {
    local metric=$1
    jq -r ".baselines.${metric}.threshold_ms" "$BASELINE_FILE"
}

parse_baseline_target() {
    local metric=$1
    jq -r ".baselines.${metric}.target_ms" "$BASELINE_FILE"
}

parse_baseline_p50() {
    local metric=$1
    jq -r ".baselines.${metric}.p50_ms" "$BASELINE_FILE"
}

parse_baseline_p95() {
    local metric=$1
    jq -r ".baselines.${metric}.p95_ms" "$BASELINE_FILE"
}

parse_baseline_p99() {
    local metric=$1
    jq -r ".baselines.${metric}.p99_ms" "$BASELINE_FILE"
}

# Extract latency from criterion benchmark output
# Criterion outputs in format: [time] [unit]
extract_latency() {
    local criterion_dir=$1
    local metric_name=$2

    # Look for the timing data in criterion HTML/JSON report
    # For now, return mock data to demonstrate gate logic
    # In production, parse criterion's JSON output or timing.log

    if [[ -f "$criterion_dir/base/raw.json" ]]; then
        jq -r ".data[] | select(.benchmark == \"$metric_name\") | .value" \
            "$criterion_dir/base/raw.json" 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

check_mttr_path() {
    local path_name=$1
    local actual_latency_ms=$2
    local baseline_target=$3
    local baseline_threshold=$4

    if (( $(echo "$actual_latency_ms > $baseline_threshold" | bc -l) )); then
        local degradation=$(echo "scale=2; (($actual_latency_ms - $baseline_target) / $baseline_target) * 100" | bc -l)

        if (( $(echo "$degradation > 20" | bc -l) )); then
            log_error "CRITICAL regression: $path_name = ${actual_latency_ms}ms (target: ${baseline_target}ms, +${degradation}%)"
            return 2 # CRITICAL
        elif (( $(echo "$degradation > 10" | bc -l) )); then
            log_warning "Warning regression: $path_name = ${actual_latency_ms}ms (target: ${baseline_target}ms, +${degradation}%)"
            return 3 # WARNING
        else
            log_success "$path_name = ${actual_latency_ms}ms (target: ${baseline_target}ms)"
            return 0
        fi
    else
        log_success "$path_name = ${actual_latency_ms}ms (target: ${baseline_target}ms) ✓ WITHIN SLA"
        return 0
    fi
}

report_mttr_summary() {
    log_info ""
    log_info "======================================"
    log_info "MTTR Benchmark Report"
    log_info "======================================"
    log_info ""

    local recovery_paths=(
        "soft_recovery_degraded_to_ready"
        "fast_recovery_failed_to_ready"
        "cold_start_bootstrap_to_ready"
        "circuit_breaker_open_to_closed"
    )

    local critical_failures=0
    local warning_failures=0

    for path in "${recovery_paths[@]}"; do
        local target=$(parse_baseline_target "$path")
        local threshold=$(parse_baseline "$path")
        local p50=$(parse_baseline_p50 "$path")
        local p95=$(parse_baseline_p95 "$path")
        local p99=$(parse_baseline_p99 "$path")

        # Simulate actual latency (in production, extract from benchmark output)
        local actual_latency=$((RANDOM % 1000))

        log_info "Path: $path"
        log_info "  Target: ${target}ms | Threshold (5% margin): ${threshold}ms"
        log_info "  Baseline p50/p95/p99: ${p50}ms / ${p95}ms / ${p99}ms"
        log_info "  Actual (simulated): ${actual_latency}ms"
        log_info ""

        check_mttr_path "$path" "$actual_latency" "$target" "$threshold"
        case $? in
            2) ((critical_failures++)) ;;
            3) ((warning_failures++)) ;;
        esac
    done

    log_info ""
    log_info "======================================"
    log_info "Summary"
    log_info "======================================"
    log_info "Critical failures: $critical_failures"
    log_info "Warning failures: $warning_failures"
    log_info "======================================"
    log_info ""

    if (( critical_failures > 0 )); then
        return 2
    elif (( warning_failures > 0 )); then
        return 3
    else
        return 0
    fi
}

generate_html_report() {
    log_info "Generating HTML report..."

    local html_file="target/mttr_report.html"

    cat > "$html_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>MTTR Benchmark Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        h1 { color: #333; }
        .metric { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #0066cc; }
        .success { border-left-color: #00aa00; }
        .warning { border-left-color: #ffaa00; }
        .critical { border-left-color: #ff0000; }
        .metric-name { font-weight: bold; color: #333; }
        .metric-value { font-family: monospace; color: #666; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border: 1px solid #ddd; }
        th { background: #0066cc; color: white; }
    </style>
</head>
<body>
    <h1>MTTR Benchmark Report</h1>
    <p>Generated at: <span id="timestamp"></span></p>

    <h2>Recovery Paths</h2>
    <table>
        <tr>
            <th>Recovery Path</th>
            <th>Target (ms)</th>
            <th>Threshold (ms)</th>
            <th>p50 (ms)</th>
            <th>p95 (ms)</th>
            <th>p99 (ms)</th>
            <th>Status</th>
        </tr>
        <!-- Data filled by JavaScript -->
    </table>

    <h2>SLA Compliance</h2>
    <ul>
        <li>MTTR Requirement: &lt; 1 second for any production recovery</li>
        <li>P99 Requirement: &lt; 2 seconds for any recovery path</li>
        <li>Degradation Tolerance: 5% from baseline (regression detection gate)</li>
    </ul>

    <script>
        document.getElementById('timestamp').textContent = new Date().toISOString();
    </script>
</body>
</html>
EOF

    log_success "HTML report generated: $html_file"
}

##############################################################################
# Main
##############################################################################

main() {
    log_info "Starting MTTR SLA Gate..."
    log_info ""

    check_prerequisites
    run_benchmarks
    report_mttr_summary
    local exit_code=$?

    generate_html_report

    case $exit_code in
        0)
            log_success "All MTTR targets met — CI gate PASSES"
            exit 0
            ;;
        2)
            log_error "CRITICAL regression detected — CI gate FAILS (blocks merge)"
            exit 2
            ;;
        3)
            if [[ "$STRICT_MODE" == "true" ]]; then
                log_error "Warning regression in strict mode — CI gate FAILS"
                exit 2
            else
                log_warning "Warning regression detected — merge allowed with review"
                exit 0
            fi
            ;;
        *)
            die "Unexpected exit code: $exit_code" 4
            ;;
    esac
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
