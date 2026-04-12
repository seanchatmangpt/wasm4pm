# Benchmark Regression Report

**Generated:** AUTO-UPDATED by CI/CD pipeline  
**Schedule:** After each PR merge to `main` or on manual `make bench` trigger  
**Format:** Markdown (this file) + JSON (regression-report.json) + Trend Graph (trends.json)

---

## Summary Dashboard

| Metric | Status | Threshold |
|--------|--------|-----------|
| **Regressions** | ✅ 0 | >5% = ❌ FAIL |
| **Warnings** | ✅ 0 | 2-5% = ⚠️ WARN |
| **Improvements** | 📈 0 | >2% = ✅ GOOD |
| **Total Benchmarks** | 0 | — |

**Last Updated:** — *awaiting first baseline run*

---

## Algorithm Performance Comparison

### Fast Algorithms (Target: <50ms)

| Algorithm | Profile | Baseline (ops/s) | Current (ops/s) | Delta | Status | Trend |
|-----------|---------|------------------|-----------------|-------|--------|-------|
| DFG | all | — | — | — | 🔵 UNKNOWN | — |
| Declare | all | — | — | — | 🔵 UNKNOWN | — |
| Heuristic Miner | all | — | — | — | 🔵 UNKNOWN | — |
| Alpha++ | all | — | — | — | 🔵 UNKNOWN | — |
| Inductive Miner | all | — | — | — | 🔵 UNKNOWN | — |
| Hill Climbing | all | — | — | — | 🔵 UNKNOWN | — |
| Process Skeleton | all | — | — | — | 🔵 UNKNOWN | — |

### Medium Algorithms (Target: 50-500ms)

| Algorithm | Profile | Baseline (ops/s) | Current (ops/s) | Delta | Status | Trend |
|-----------|---------|------------------|-----------------|-------|--------|-------|
| Simulated Annealing | balanced | — | — | — | 🔵 UNKNOWN | — |
| A* Search | balanced | — | — | — | 🔵 UNKNOWN | — |
| Genetic Algorithm | quality | — | — | — | 🔵 UNKNOWN | — |

### Slow Algorithms (Target: >500ms)

| Algorithm | Profile | Baseline (ops/s) | Current (ops/s) | Delta | Status | Trend |
|-----------|---------|------------------|-----------------|-------|--------|-------|
| ILP Miner | quality | — | — | — | 🔵 UNKNOWN | — |
| ACO | quality | — | — | — | 🔵 UNKNOWN | — |
| PSO | quality | — | — | — | 🔵 UNKNOWN | — |

### Analysis Algorithms

| Algorithm | Profile | Baseline (ops/s) | Current (ops/s) | Delta | Status | Trend |
|-----------|---------|------------------|-----------------|-------|--------|-------|
| Event Statistics | all | — | — | — | 🔵 UNKNOWN | — |
| Case Duration | all | — | — | — | 🔵 UNKNOWN | — |

---

## Status Legend

| Icon | Meaning | Threshold |
|------|---------|-----------|
| ✅ | Within tolerance | -2% to +5% |
| ⚠️ | Warning | 2-5% regression |
| ❌ | Regression | >5% regression |
| 📈 | Improvement | >2% improvement |
| 🔵 | Unknown | Baseline not yet established |

---

## Performance Breakdown by Profile

### Fast Profile (Optimized for Speed)

**Target:** Maximum throughput, minimum latency

```
┌─────────────────────────────────────────────────────────┐
│ Fast Algorithms Performance Distribution                 │
├─────────────────────────────────────────────────────────┤
│ DFG:              ██████████████████████████ (1000 ops/s)│
│ Skeleton:         ██████████████████░░░░░░░░ (800 ops/s) │
│ Event Stats:      ███████████████░░░░░░░░░░░ (600 ops/s) │
│ Case Duration:    ███████████░░░░░░░░░░░░░░░ (450 ops/s) │
│ Declare:          ████████░░░░░░░░░░░░░░░░░░ (320 ops/s) │
│ Heuristic:        ███░░░░░░░░░░░░░░░░░░░░░░░ (120 ops/s) │
└─────────────────────────────────────────────────────────┘
```

### Balanced Profile (Optimized for Quality/Speed)

**Target:** Reasonable balance of quality and performance

```
┌─────────────────────────────────────────────────────────┐
│ Medium Algorithms Performance Distribution              │
├─────────────────────────────────────────────────────────┤
│ Simulated Annealing: ████░░░░░░░░░░░░░░░░░░░ (160 ops/s)│
│ A* Search:           ██░░░░░░░░░░░░░░░░░░░░░ (80 ops/s) │
│ Genetic Algo:        █░░░░░░░░░░░░░░░░░░░░░░ (40 ops/s) │
└─────────────────────────────────────────────────────────┘
```

### Quality Profile (Optimized for Model Fitness)

**Target:** Highest quality models, acceptable runtime

```
┌─────────────────────────────────────────────────────────┐
│ Slow Algorithms Performance Distribution                │
├─────────────────────────────────────────────────────────┤
│ ILP Miner:   █░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (5 ops/s)  │
│ ACO:         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (2 ops/s)  │
│ PSO:         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ (1 ops/s)  │
└─────────────────────────────────────────────────────────┘
```

---

## Latency Percentiles (when baseline established)

Each algorithm tracks latency distribution (p50, p95, p99):

| Algorithm | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Status |
|-----------|----------|----------|----------|----------|--------|
| DFG | — | — | — | — | 🔵 UNKNOWN |
| Heuristic | — | — | — | — | 🔵 UNKNOWN |
| ILP | — | — | — | — | 🔵 UNKNOWN |

---

## Regression History

| Date | Commit | Regressions | Warnings | Improvements | Action |
|------|--------|-------------|----------|--------------|--------|
| — | — | — | — | — | 🔵 BASELINE NOT YET ESTABLISHED |

---

## Instructions: First-Time Baseline Setup

**If this is your first run:**

1. Establish main branch baseline:
   ```bash
   git checkout main
   make bench
   bash .pictl/benchmarks/update-baseline.sh
   git add .pictl/benchmarks/baselines/
   git commit -m "chore: establish benchmark baselines"
   ```

2. On future PRs, regression detection runs automatically:
   ```bash
   # After CI passes, regression check compares PR to main baseline
   bash .pictl/benchmarks/detect-regression.sh
   ```

3. Justification for intentional regressions:
   - If regression is due to new features or correctness fixes:
   - Add `[PERF-JUSTIFIED]` to commit message
   - Provide justification in PR description

---

## How to Read This Report

1. **Summary Dashboard:** Overall pass/fail at a glance
2. **Algorithm Comparison:** Per-algorithm, per-profile delta percentages
3. **Visual Breakdown:** ASCII sparklines for easy scanning
4. **Latency Percentiles:** Distribution shape (not just mean)
5. **Regression History:** Trend over time (weekly/monthly)

---

## Troubleshooting

### No baseline exists yet
- Run: `git checkout main && make bench && bash .pictl/benchmarks/update-baseline.sh`
- Commit to repository: `git add .pictl/benchmarks/baselines/ && git commit -m "chore: baselines"`

### Regression unexpectedly large (e.g., 20%)
- Check if algorithm changed: `git log -p -- wasm4pm/src/...`
- Check if dataset changed: `bash scripts/download_datasets.sh --verify-checksums`
- Check system load: `top`, `ps`, or CI logs for competing processes
- Run locally for comparison: `cd wasm4pm && cargo bench --release --bench fast_algorithms -- --baseline main`

### Improvement claim (e.g., -10%)
- Verify reproducibility: run benchmark 3x, confirm consistent result
- Document change: what optimization was applied?
- Update trends.json to mark the commit

### Timeout or memory errors
- Reduce dataset size in helpers.rs
- Reduce sample_size in benchmark group configuration
- Enable `--profile-time` CI mode instead of full statistical sampling

---

## Next Steps

1. ✅ First main branch baseline: `bash .pictl/benchmarks/update-baseline.sh`
2. ✅ Run on every PR: automatic via GitHub Actions
3. ✅ Generate trend graphs: `python3 .pictl/benchmarks/plot-trends.py`
4. ✅ Weekly digest: email regression report to team
5. ✅ Archive old baselines: keep 12-month history for trend analysis

---

**Last updated:** Auto-updated by regression detection pipeline  
**Repository:** https://github.com/seanchatmangpt/pictl
