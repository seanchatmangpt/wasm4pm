# Benchmark Regression Detection — Setup Guide

## 1. One-Time Main Branch Setup

This establishes the performance baseline for all future PRs.

```bash
# Switch to main
git checkout main

# Download datasets (if not already done)
make bench-data

# Run full benchmark suite (takes 15-30 minutes)
make bench

# Save baseline with git metadata
bash .pictl/benchmarks/update-baseline.sh

# Verify baseline was created
ls -lh .pictl/benchmarks/baselines/
# Should show: main-20260411_120000.json and main-latest.json (symlink)

# Commit to repository
git add .pictl/benchmarks/baselines/
git commit -m "chore: establish benchmark baselines for regression detection"
git push origin main
```

**That's it!** Regression detection is now active on all PRs.

## 2. For Contributors: Check Your PR

```bash
# Switch to feature branch
git checkout my-feature

# Make your changes
# ... edit code ...

# Before pushing, run regression check
make bench-regression

# Output will show:
# ✅ No regressions detected
# OR
# ❌ Regression detected: algorithm X regressed 8%
```

### If regression is detected:

**Option A: Fix the performance issue**
```bash
# Profile the code to find bottleneck
cd wasm4pm
cargo flamegraph --release --bench fast_algorithms

# Optimize and retry
make bench-regression
```

**Option B: Justify the regression**
```bash
# If regression is due to new feature (worth the tradeoff):
git commit --amend -m "feat: add filtering [PERF-JUSTIFIED]"

# In PR description, explain:
"""
## Performance Trade-off

Algorithm X regressed 5% due to added constraint checking.

**Why it's worth it:**
- Prevents invalid models (adds soundness guarantee)
- Reduces post-processing steps downstream
- Trade: 5% slower, but guarantees correctness
"""

# Maintainer reviews and approves in PR comments
```

## 3. For Maintainers: After Merging PR

```bash
# PR merged to main. Update baseline.
git checkout main
git pull origin main

# Run updated benchmarks
make bench

# Save new baseline
bash .pictl/benchmarks/update-baseline.sh

# Commit
git add .pictl/benchmarks/baselines/
git commit -m "chore: update benchmark baselines after <feature description>"
git push origin main
```

**Note:** This can be automated in CI/CD if preferred.

## 4. Verify Everything Works

```bash
# Check that baseline files exist and are valid
test -f .pictl/benchmarks/baselines/main-latest.json && echo "✅ Baseline exists" || echo "❌ Missing"

# Test regression detection (should pass on main)
make bench-regression
# Expected: "All benchmarks passed regression checks."

# View trend summary
make bench-trends
# Expected: Shows summary table (likely empty on first run, but valid format)
```

## 5. Optional: Configure GitHub Actions

The regression detection workflow (`.github/workflows/bench-regression.yml`) is already configured and will:

1. Run on every PR to `main` or `develop`
2. Compare benchmarks against main baseline
3. Comment on PR with results
4. Fail merge if >5% regression
5. Provide justification form for intentional regressions

**No additional setup required** — the workflow activates automatically once baseline exists.

## Directory Structure

After setup:

```
.pictl/benchmarks/
├── .gitkeep
├── README.md                    ← Full documentation
├── SETUP.md                     ← This file
├── detect-regression.sh         ← Run regression checks
├── update-baseline.sh           ← Save baselines
├── plot-trends.py               ← Visualize trends
├── regression-report.md         ← Latest report (auto-updated)
├── trends.json                  ← Historical data
└── baselines/
    ├── .gitkeep
    ├── main-latest.json         ← Symlink to newest main baseline
    ├── main-20260411_120000.json ← Timestamped baseline
    └── 20260411_120000_metadata.json ← Git info
```

## Quick Reference

| Task | Command |
|------|---------|
| Establish baseline (once) | `bash .pictl/benchmarks/update-baseline.sh` |
| Check for regressions (PR) | `make bench-regression` |
| Update baseline (after merge) | `bash .pictl/benchmarks/update-baseline.sh` |
| View trends (anytime) | `make bench-trends` |
| Full benchmarks | `make bench` |
| CI mode (fast) | `make bench-ci` |
| Help | `make help` |

## Troubleshooting Setup

**Problem: "baseline/main-latest.json not found"**
```bash
# Baseline doesn't exist yet. Create it:
git checkout main
make bench
bash .pictl/benchmarks/update-baseline.sh
git add .pictl/benchmarks/baselines/
git commit -m "chore: establish baselines"
git push origin main
```

**Problem: "detect-regression.sh: command not found"**
```bash
# Script not executable. Fix it:
chmod +x .pictl/benchmarks/detect-regression.sh
chmod +x .pictl/benchmarks/update-baseline.sh
chmod +x .pictl/benchmarks/plot-trends.py
```

**Problem: "make bench-regression fails with permission error"**
```bash
# Ensure .pictl/benchmarks/ directory is writable:
chmod -R u+w .pictl/benchmarks/
```

**Problem: "Baseline file is huge (>100MB)"**
```bash
# This is normal if Criterion is saving detailed analysis
# Archive old baselines to keep repo size reasonable:
mkdir -p .pictl/benchmarks/baselines/archive
find .pictl/benchmarks/baselines -name "main-*.json" -mtime +30 \
  -exec mv {} .pictl/benchmarks/baselines/archive/ \;
git add .pictl/benchmarks/baselines/
git commit -m "chore: archive old benchmarks"
```

## Next Steps

1. ✅ Run initial setup (main branch baseline)
2. ✅ Push baseline to repository
3. ✅ Create test PR with `make bench-regression`
4. ✅ Verify GitHub Actions workflow runs
5. ✅ Review regression report format
6. ✅ Configure team to use [PERF-JUSTIFIED] for intentional regressions

## Support

For detailed documentation, see:
- `.pictl/benchmarks/README.md` — Complete reference
- `.pictl/benchmarks/regression-report.md` — Latest report format
- `Makefile` — All benchmark commands

---

**Estimated time:** 20 minutes (10 min setup + 10 min benchmark run)  
**One-time cost:** Yes, then automatic on all PRs  
**Maintenance:** Update baseline after each main merge (~1 min)
