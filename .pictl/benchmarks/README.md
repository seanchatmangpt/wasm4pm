# Benchmark Regression Detection System

Automated performance regression detection for pictl. Prevents merges when algorithm performance degrades >5%.

## Quick Start

### 1. Establish Baseline (Main Branch Only)

First time setup:

```bash
git checkout main
make bench                                    # Run full benchmark suite
bash .pictl/benchmarks/update-baseline.sh     # Save baseline
git add .pictl/benchmarks/baselines/
git commit -m "chore: establish benchmark baselines"
git push origin main
```

### 2. Check for Regressions (PR Branch)

```bash
make bench-regression
```

This automatically:
- Runs fast benchmarks against current code
- Compares to main branch baseline
- Generates regression report
- Fails if >5% regression detected

### 3. View Trends

```bash
make bench-trends                                          # Show trend summary
python3 .pictl/benchmarks/plot-trends.py --algorithm dfg  # Specific algorithm
python3 .pictl/benchmarks/plot-trends.py --days 7         # Last 7 days
```

## System Architecture

```
.pictl/benchmarks/
├── baselines/                    ← Baseline storage (versioned)
│   ├── main-latest.json         (symlink to most recent main run)
│   ├── main-20260411_120000.json (timestamped results)
│   └── {timestamp}_metadata.json (git hash, branch, etc.)
├── regression-report.md          ← Latest regression report (auto-updated)
├── regression-report-{ts}.md     ← Historical reports (archived)
├── trends.json                   ← Historical trend data (JSON schema)
├── update-baseline.sh            ← Save baselines after main merge
├── detect-regression.sh          ← Check for regressions on PR
├── plot-trends.py                ← Visualize trends
└── README.md                     ← This file
```

## Workflow

### For Contributors (Feature Branch)

```bash
# Before pushing PR:
make bench-regression

# Output:
# ❌ Regression detected: dfg regressed 8%
# ⚠️ Threshold: 5%
# Solution: Provide justification or fix performance

# If regression is intentional (new feature, correctness fix):
git commit -m "feat: add filtering support [PERF-JUSTIFIED]"
# In PR description, explain why performance tradeoff is worth it
```

### For Maintainers (Main Branch)

```bash
# After merging PR to main:
git pull origin main
make bench-baseline-update      # Save new baseline
git add .pictl/benchmarks/baselines/
git commit -m "chore: update benchmark baselines after <feature>"
git push origin main

# Or in CI/CD pipeline:
# bash .pictl/benchmarks/update-baseline.sh --ci
```

### For Performance Analysis (Any Time)

```bash
# Last 30 days trend (default):
make bench-trends

# Specific algorithm, last 7 days:
python3 .pictl/benchmarks/plot-trends.py --algorithm ilp --days 7 --format ascii

# Export as JSON for external tools:
python3 .pictl/benchmarks/plot-trends.py --algorithm dfg --format json > dfg_trends.json

# Compare two algorithms:
python3 .pictl/benchmarks/plot-trends.py --algorithm dfg --days 30 --format ascii
python3 .pictl/benchmarks/plot-trends.py --algorithm heuristic_miner --days 30 --format ascii
```

## Files & Formats

### Baselines (JSON)

**File:** `.pictl/benchmarks/baselines/main-{TIMESTAMP}.json`

Structure:
```json
{
  "baseline_info": {
    "timestamp": "2026-04-11T12:34:56Z",
    "git_hash": "abc1234",
    "git_branch": "main",
    "generated_at": "2026-04-11T12:34:56Z"
  },
  "benchmarks": [
    {
      "group": "discovery/dfg",
      "results": [
        {
          "name": "cases_1000",
          "throughput_ops_per_sec": 1000.5,
          "latency_ns_per_op": 1000000
        }
      ]
    }
  ]
}
```

**Retention:** All baselines kept (no deletion) for long-term trend analysis.
**Symlink:** `main-latest.json` always points to most recent main baseline.

### Regression Report (Markdown)

**File:** `.pictl/benchmarks/regression-report.md` + `regression-report-{TIMESTAMP}.md`

Contains:
- Summary dashboard (pass/fail at a glance)
- Algorithm-by-algorithm comparison table
- Latency percentile distribution (p50, p95, p99)
- Regression history
- Visual sparklines for performance trends

Auto-updated on every benchmark run.

### Trends Database (JSON Schema)

**File:** `.pictl/benchmarks/trends.json`

Structure:
```json
{
  "metadata": {
    "version": "1.0.0",
    "last_updated": "2026-04-11T12:34:56Z",
    "baseline_established": "2026-04-01T10:00:00Z"
  },
  "data_points": [
    {
      "timestamp": "2026-04-11T12:34:56Z",
      "git_commit": "abc1234",
      "git_branch": "main",
      "algorithm": "dfg",
      "profile": "fast",
      "dataset_size": 100000,
      "metrics": {
        "throughput_ops_per_sec": 1000.5,
        "latency_ns_per_op": 1000000,
        "latency_p50_ms": 0.5,
        "latency_p95_ms": 2.1,
        "latency_p99_ms": 5.3,
        "memory_peak_mb": 128.5,
        "fitness_score": 0.95,
        "precision_score": 0.87,
        "simplicity_score": 0.92
      },
      "sample_count": 100,
      "notes": "New optimization applied"
    }
  ],
  "regressions": [
    {
      "timestamp": "2026-04-10T10:00:00Z",
      "git_commit": "def5678",
      "algorithm": "genetic_algorithm",
      "profile": "quality",
      "regression_percent": 7.5,
      "baseline_throughput": 100,
      "current_throughput": 92.5,
      "justification": "Added constraint checking for model soundness (worth the tradeoff)",
      "reviewed_by": "alice@example.com"
    }
  ],
  "improvements": [
    {
      "timestamp": "2026-04-09T15:00:00Z",
      "git_commit": "xyz9999",
      "algorithm": "heuristic_miner",
      "profile": "fast",
      "improvement_percent": 12.3,
      "baseline_throughput": 500,
      "current_throughput": 561.5,
      "optimization_description": "Parallelized dependency matrix computation"
    }
  ]
}
```

## Regression Thresholds

| Threshold | Action | Approval |
|-----------|--------|----------|
| **>5%** | ❌ FAIL merge | Maintainer review + justification |
| **2-5%** | ⚠️ WARN | Log in regression report, allow merge |
| **0-2%** | ✅ PASS | Acceptable variance |
| **Improvement >2%** | 📈 GOOD | Document in improvements log |

## Handling Regressions

### Scenario 1: Unexpected Regression

```bash
# Check if it's consistent
make bench-regression  # Run again
make bench-regression  # Third time

# If regression is consistent:
cd wasm4pm
cargo bench --release --bench fast_algorithms -- --baseline main | grep -i "regressed"

# Investigate:
git log -p -- wasm4pm/src/  # Check for recent changes
top -b -n 1              # Check system load during benchmark
ps aux | grep -i cargo   # Check for competing processes
```

### Scenario 2: Intentional Regression (Feature Addition)

```bash
# Example: Adding genetic algorithm with correctness constraints
git commit -m "feat: add sound process model constraints [PERF-JUSTIFIED]"

# In PR description:
"""
## Performance Impact

Genetic algorithm regressed 8% due to added constraint validation.

**Justification:** Constraint checking prevents unsound models (missing arcs, 
wrong transitions). The 8% performance cost is worth eliminating defects.

**Trade-off:** 1000 ops/s → 920 ops/s
**Benefit:** 0% invalid models (was 3% before)
"""

# Maintainer reviews + approves:
echo "Cost/benefit analysis is sound. Approved." >> PR_REVIEW
```

### Scenario 3: System Variance (False Positive)

If benchmark varies 3-4% between runs due to system load:

```bash
# Reduce variance with more samples:
cd wasm4pm
cargo bench --release --bench fast_algorithms -- --sample-size 100 --measurement-time 10

# Or verify in controlled environment:
killall -9 chrome spotify slack              # Close heavy apps
renice -20 $$                                # Boost process priority
make bench-regression
```

## Integration with CI/CD

### GitHub Actions: `.github/workflows/bench-regression.yml`

Runs on every PR:

1. ✅ Check if baseline exists
2. ✅ Run fast benchmarks (--profile-time 3)
3. ✅ Detect regressions against main baseline
4. ✅ Comment on PR with results
5. ✅ Fail merge if >5% regression
6. ✅ Upload report as artifact

Post-merge (main branch only):

1. ✅ Run full benchmark suite
2. ✅ Save baseline with git metadata
3. ✅ Update trends.json
4. ✅ Commit baseline to repository

### Local Pre-Commit Hook (Optional)

```bash
# .git/hooks/pre-push
if [ "$1" = "origin" ] && [[ "$2" =~ "main" ]]; then
  echo "Pre-push: Running regression check..."
  make bench-regression || {
    echo "Regression detected. Push blocked."
    echo "Fix performance or add [PERF-JUSTIFIED] to commit."
    exit 1
  }
fi
```

## Maintenance

### Archive Old Baselines

Every 12 months:

```bash
# Move baselines older than 1 year to archive/
mkdir -p .pictl/benchmarks/baselines/archive
find .pictl/benchmarks/baselines -name "main-202*.json" -type f -mtime +365 \
  -exec mv {} .pictl/benchmarks/baselines/archive/ \;

git add .pictl/benchmarks/
git commit -m "chore: archive benchmark baselines >1 year old"
```

### Update Baseline Symlink

If main-latest.json is stale:

```bash
# Check symlink
ls -l .pictl/benchmarks/baselines/main-latest.json

# Re-establish
LATEST=$(ls -t .pictl/benchmarks/baselines/main-*.json | head -1)
rm .pictl/benchmarks/baselines/main-latest.json
ln -s "$(basename "$LATEST")" .pictl/benchmarks/baselines/main-latest.json
git add .pictl/benchmarks/baselines/main-latest.json
git commit -m "chore: update main-latest symlink"
```

### Clear Trends Cache

If trends.json grows too large (>10MB):

```bash
# Keep only last 365 days
python3 .pictl/benchmarks/plot-trends.py --days 365 --format json > trends_clean.json
mv trends_clean.json trends.json
git add .pictl/benchmarks/trends.json
git commit -m "chore: archive trends older than 1 year"
```

## Commands Reference

| Command | Purpose |
|---------|---------|
| `make bench` | Full benchmark suite (Rust + WASM) |
| `make bench-rust` | Criterion benchmarks only (5 groups parallel) |
| `make bench-ci` | Fast CI mode (reduced profile time) |
| `make bench-quick` | Smoke test (compile check) |
| `make bench-baseline-update` | Save new main baseline |
| `make bench-baseline-update-ci` | Save baseline in CI mode |
| `make bench-regression` | Detect regressions on PR |
| `make bench-trends` | Show 30-day trend summary |
| `make bench-compare LABEL=main` | Compare Criterion against baseline |
| `make clean-bench` | Remove results and Criterion cache |
| `bash .pictl/benchmarks/update-baseline.sh` | Manual baseline update |
| `bash .pictl/benchmarks/detect-regression.sh` | Manual regression detection |
| `python3 .pictl/benchmarks/plot-trends.py --help` | Trend visualization options |

## Troubleshooting

**Q: "Baseline file not found"**  
A: Run on main branch: `make bench && bash .pictl/benchmarks/update-baseline.sh`

**Q: "Regression detection not enabled"**  
A: Baseline doesn't exist yet. Establish on main branch first.

**Q: "Regression >20%, but I only changed comments"**  
A: System load variance or Criterion statistical fluctuation. Run 3x to verify.

**Q: "How do I know if regression is justified?"**  
A: Ask: "Does this feature or fix provide more value than 5-10% slowdown?" If yes, justify. If no, optimize.

**Q: "Trends.json file is empty"**  
A: First baseline run populates it automatically. Run benchmarks to seed data.

**Q: "Can I ignore a regression?"**  
A: Only with explicit `[PERF-JUSTIFIED]` + maintainer approval. Default is fail-merge.

## References

- **Criterion.rs:** https://github.com/bheisler/criterion.rs
- **Benchmarking Best Practices:** https://easyperf.net/blog/
- **Performance Regression Detection:** https://github.com/results-driven-benchmarking/tools
- **Benchmark Comparison Tools:** https://github.com/torvalds/linux/tree/master/tools/perf

## Support

Issues? Questions?

- Check existing baselines: `ls -lh .pictl/benchmarks/baselines/`
- View reports: `cat .pictl/benchmarks/regression-report.md`
- Debug trends: `python3 .pictl/benchmarks/plot-trends.py --format json | jq '.data_points[] | select(.algorithm=="dfg")'`

---

**Last updated:** 2026-04-11  
**Schema version:** 1.0.0  
**Benchmark framework:** Criterion.rs + Rust Bencher output
