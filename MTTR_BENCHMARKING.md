# MTTR Benchmarking Suite

**Mean-Time-To-Recovery (MTTR) Critical Infrastructure for SLA Compliance**

## Overview

The MTTR benchmarking suite measures recovery latency across 4 critical recovery paths in the wasm4pm engine. MTTR compliance is a **hard SLA requirement** — recovery must happen fast to prevent cascading failures and user-facing incidents.

**Critical Constraint (from `CLAUDE.md`):**
```
MTIR must be <1 second.
Do NOT hardcode MTIR values. Always measure via StateMachine.getTransitionHistory().
```

## Recovery Paths Measured

### 1. Soft Recovery: `degraded → ready`

**Mechanism:** `Engine.recover()` → `WasmLoader.softReset()`

**Target:** 50ms | **Threshold (5% margin):** 52.5ms  
**p50/p95/p99:** 15ms / 45ms / 48ms

**Operations:**
- Validate current state (degraded)
- Clear error buffer
- Reset status tracker
- Preserve compiled WASM binary (cheap rollback)
- Transition to ready state

**Characteristics:**
- Fastest recovery path
- Does NOT reload/recompile WASM
- Suitable for transient errors

### 2. Fast Recovery: `failed → ready`

**Mechanism:** Direct state transition with WASM preservation

**Target:** 800ms | **Threshold (5% margin):** 840ms  
**p50/p95/p99:** 200ms / 700ms / 790ms

**Operations:**
- Check WASM module status
- Roll back via `WasmLoader.softReset()`
- Reinitialize kernel
- Clear all error state
- Transition to ready

**Characteristics:**
- Second-fastest recovery path
- WASM binary preserved (no fetch/compile)
- Suitable for kernel initialization failures
- **MTTR compliance buffer:** 40ms margin for SLA

### 3. Cold Start: `bootstrapping → ready`

**Mechanism:** Full bootstrap with WASM load

**Target:** 5000ms | **Threshold (5% margin):** 5250ms  
**p50/p95/p99:** 2500ms / 4800ms / 4950ms

**Operations:**
- Load WASM binary from network/disk (heaviest)
- Compile WASM module
- Initialize kernel
- Validate all systems
- Transition to ready state

**Characteristics:**
- Slowest recovery path
- Includes full WASM fetch/compile overhead
- Dominated by network + compilation time
- Suitable for complete engine restart

### 4. Circuit Breaker: `open → closed`

**Mechanism:** State machine recovery via timeout + probe

**Target:** 500ms | **Threshold (5% margin):** 525ms  
**p50/p95/p99:** 100ms / 450ms / 490ms

**Operations:**
- Detect failure threshold in closed state
- Transition to open state
- Wait for configured timeout (half-open delay)
- Transition to half-open state
- Perform probe request
- Transition to closed state (if probe succeeds)

**Characteristics:**
- Independent circuit breaker state machine
- Does NOT depend on engine state
- Protects against cascading failures
- Timeout is configurable (default: 30s)

## Running Benchmarks

### Prerequisites

```bash
cd /Users/sac/wasm4pm

# Install criterion if not present
cargo add --build criterion --features html_reports

# Verify baseline file exists
ls wasm4pm/benches/mttr_baseline.json
```

### Full Benchmark Suite

Run all 4 recovery path benchmarks (takes 2-5 minutes):

```bash
cd wasm4pm
cargo bench --bench mttr_recovery
```

**Output:**
- Text report in terminal
- HTML reports in `target/criterion/mttr_recovery/`
- Statistical summaries: p50/p95/p99 latencies per path

### Single Recovery Path

Benchmark one recovery path:

```bash
# Soft recovery only
cargo bench --bench mttr_recovery -- soft_recovery_degraded_to_ready

# Fast recovery only
cargo bench --bench mttr_recovery -- fast_recovery_failed_to_ready
```

### With CI Gate

Run benchmarks and compare against baseline (automatic regression detection):

```bash
./scripts/mttr-gate.sh
```

**Exit codes:**
- `0` = All MTTR targets met, no regressions
- `2` = CRITICAL regression detected (blocks merge)
- `3` = Warning regression (logged, merge allowed with review)
- `4` = Benchmark execution error

## Interpreting Results

### Understanding Criterion Output

Criterion reports for each benchmark:
```
soft_recovery_degraded_to_ready
                        time:   [12.345 ms 13.456 ms 14.567 ms]
                        slope  [12.234 ms 13.345 ms 14.456 ms]
```

**Fields:**
- First value = lower 95% confidence bound
- Middle value = median (p50)
- Last value = upper 95% confidence bound

### Latency Percentiles

The suite records:
- **p50** = 50th percentile (median)
- **p95** = 95th percentile (slow outliers)
- **p99** = 99th percentile (very slow outliers)

**Rule of thumb:**
- p50 should be close to target (baseline ±5%)
- p95 should be 1-2x the target
- p99 should be 1-3x the target

### Regression Detection

**Automatic checks (CI gate):**

1. **Critical Regression (>20% degradation)**
   - Blocks merge (exit code 2)
   - Example: soft_recovery target 50ms → actual 61ms (22% increase)
   - Action: Investigate root cause, optimize recovery path

2. **Warning Regression (10-20% degradation)**
   - Logged as warning (exit code 3)
   - Merge allowed with maintainer review
   - Example: fast_recovery target 800ms → actual 880ms (10% increase)
   - Action: Monitor closely in production, schedule optimization

3. **Within Tolerance (<10% degradation)**
   - Acceptable variation (normal OS scheduler variance)
   - Merge proceeds automatically

## Updating Baselines

When optimizations improve recovery latency:

```bash
# 1. Run benchmarks
cargo bench --bench mttr_recovery

# 2. Verify improvements are stable (run 3 times)
cargo bench --bench mttr_recovery
cargo bench --bench mttr_recovery

# 3. Update baseline with new p50/p95/p99 values
# Edit: wasm4pm/benches/mttr_baseline.json
# Update: baselines.<recovery_path>.p50_ms, .p95_ms, .p99_ms

# 4. Run gate to confirm
./scripts/mttr-gate.sh
```

**Important:** Only update baselines AFTER confirming improvements across 3 consecutive runs (statistically significant).

## SLA Requirements

From `critical-constraints.md`:

| Metric | Requirement | Definition |
|--------|-------------|-----------|
| MTTR | <1 second | Mean time across all recovery operations |
| p99 | <2 seconds | 99th percentile latency (very slow outlier) |
| Margin | 5% | Tolerance for baseline comparison |
| Degradation (critical) | >20% | Blocks merge |
| Degradation (warning) | 10-20% | Logged warning, merge allowed |

## Integration with CI/CD

The MTTR gate is integrated into the pre-merge pipeline:

```yaml
# .github/workflows/ci.yml (example)
- name: MTTR SLA Gate
  run: ./scripts/mttr-gate.sh
  env:
    BASELINE_FILE: wasm4pm/benches/mttr_baseline.json
```

**Triggers on:**
- Every commit to feature branch
- Every PR to main

**Fails merge if:**
- Any recovery path exceeds threshold + 5% margin
- Benchmark execution fails
- Baseline file is missing or corrupt

## Troubleshooting

### Benchmark runs slower than baseline

**Symptoms:**
```
Critical regression: soft_recovery_degraded_to_ready = 65ms (target: 50ms, +30%)
```

**Causes:**
1. **System load** — background processes consuming CPU
2. **WASM compilation** — first run may be slower
3. **Criterion warmup** — requires multiple iterations
4. **Code regression** — actual performance degradation

**Solutions:**
```bash
# 1. Kill background processes
killall chrome java node

# 2. Run warmup manually (3 times)
cargo bench --bench mttr_recovery --no-run
cargo bench --bench mttr_recovery

# 3. Check for code changes affecting recovery path
git diff HEAD~1 packages/engine/src/lifecycle.ts
git diff HEAD~1 packages/engine/src/engine.ts

# 4. Profile with detailed measurements
RUST_LOG=debug cargo bench --bench mttr_recovery -- --verbose
```

### Criterion output is incomplete

**Symptoms:**
```
error: no benchmark target named 'mttr_recovery' found
```

**Solutions:**
```bash
# Verify benchmark is registered in Cargo.toml
grep "mttr_recovery" wasm4pm/Cargo.toml

# Rebuild and try again
cargo clean
cargo build --benches

# Run with explicit path
cargo bench --bench mttr_recovery --release
```

### CI gate script fails with "jq not found"

**Solutions:**
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq

# Verify
jq --version
```

## Performance Tuning

To improve recovery latency:

### 1. Soft Recovery (degraded → ready)

**Current target:** 50ms

**Optimization opportunities:**
- Async error buffer clearing (currently synchronous)
- Cache status tracker state (avoid recomputation)
- Batch multiple recovery attempts

**Estimated improvement:** 5-10ms

### 2. Fast Recovery (failed → ready)

**Current target:** 800ms

**Optimization opportunities:**
- Lazy kernel re-initialization (skip unnecessary checks)
- Parallel WASM validation and kernel init
- Skip redundant state transitions

**Estimated improvement:** 100-200ms

### 3. Cold Start (bootstrapping → ready)

**Current target:** 5000ms

**Optimization opportunities:**
- Parallel WASM fetch + kernel init (currently sequential)
- WASM binary caching (browser cache headers)
- Lazy initialization (defer non-critical setup)

**Estimated improvement:** 500-1000ms

### 4. Circuit Breaker (open → closed)

**Current target:** 500ms

**Optimization opportunities:**
- Exponential backoff for timeout (currently fixed)
- Probe in parallel with timeout countdown
- Preemptive probe before half-open transition

**Estimated improvement:** 50-100ms

## References

- **Source:** `wasm4pm/benches/mttr_recovery.rs` — Criterion benchmarks
- **Baseline:** `wasm4pm/benches/mttr_baseline.json` — SLA thresholds
- **CI Gate:** `scripts/mttr-gate.sh` — Automated regression detection
- **Tests:** `wasm4pm/tests/mttr_recovery_paths_tests.rs` — Integration tests
- **Docs:** `critical-constraints.md` § MTTR Requirements
- **Measurement:** `packages/engine/src/lifecycle.ts::StateMachine.getMTTR()`

## FAQ

**Q: Why <1 second for MTTR?**  
A: Industry standard for high-availability systems. Exceeding 1s increases risk of cascading failures.

**Q: Can we trade off accuracy for latency?**  
A: No. Recovery must be both fast AND correct. Use metamorphic tests to verify behavior under pressure.

**Q: Should baseline be environment-specific?**  
A: Yes. Separate baselines for CI (cloud), dev (laptop), and prod (hardware) are recommended (future work).

**Q: How often should we run benchmarks?**  
A: Every PR (pre-merge). Weekly long-running tests for stability trends.

**Q: What if recovery takes >2s (p99)?**  
A: Blocks merge. File incident, investigate root cause, optimize or revert.
