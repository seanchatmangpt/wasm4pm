# Benchmark Regression Detection — Quick Reference

## 30-Second Overview

Performance regression detection that **prevents merge if >5% slowdown**. Automatic on PRs.

| Step | Command | Who | When |
|------|---------|-----|------|
| 1. Establish baseline | `make bench && bash .pictl/benchmarks/update-baseline.sh` | Maintainer | Once on main |
| 2. Check regression | `make bench-regression` | Contributor | Before push |
| 3. Update baseline | `bash .pictl/benchmarks/update-baseline.sh` | CI/CD | After merge |

## Command Reference

### For Contributors (Feature Branch)

```bash
# Before pushing your changes:
make bench-regression

# Output: ✅ No regressions  OR  ❌ Regression: algo X regressed 8%

# If regression is real (you optimized), great!
# If regression is unintended, fix it or document why it's worth it
git commit -m "feat: new filtering [PERF-JUSTIFIED]"
# Then explain in PR description why 5-8% slowdown is acceptable
```

### For Maintainers (Main Branch)

```bash
# After PR merges to main:
git pull origin main
make bench
bash .pictl/benchmarks/update-baseline.sh
git add .pictl/benchmarks/baselines/
git commit -m "chore: update benchmark baselines"
git push origin main
```

### For Analysis Anytime

```bash
# View trend summary
make bench-trends

# Specific algorithm (last 7 days)
python3 .pictl/benchmarks/plot-trends.py --algorithm dfg --days 7 --format ascii

# Export as JSON for external tools
python3 .pictl/benchmarks/plot-trends.py --algorithm dfg --format json > dfg.json
```

## Key Files

| File | Purpose |
|------|---------|
| `.pictl/benchmarks/baselines/main-latest.json` | Current baseline (symlink) |
| `.pictl/benchmarks/regression-report.md` | Latest regression report |
| `.pictl/benchmarks/trends.json` | Historical trend data |
| `.github/workflows/bench-regression.yml` | Automatic PR checks (GitHub Actions) |
| `Makefile` | CLI targets: `make bench-regression`, etc. |

## Thresholds

| Delta | Status | Action |
|-------|--------|--------|
| >5% slower | ❌ FAIL | Block merge, need justification |
| 2-5% slower | ⚠️ WARN | Log warning, allow merge |
| <2% | ✅ PASS | Accept (normal variance) |
| Faster | 📈 GOOD | Document optimization |

## First-Time Setup (5 minutes)

```bash
# 1. Switch to main
git checkout main

# 2. Run benchmarks (takes 15-30 min)
make bench

# 3. Save baseline
bash .pictl/benchmarks/update-baseline.sh

# 4. Commit
git add .pictl/benchmarks/baselines/
git commit -m "chore: establish benchmark baselines"
git push origin main

# Done! Regression detection now active on all PRs
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Baseline not found" | Run on main: `make bench && bash .pictl/benchmarks/update-baseline.sh` |
| "Permission denied" | `chmod +x .pictl/benchmarks/*.sh .pictl/benchmarks/*.py` |
| "Regression >10% but I changed nothing" | System load variance. Run 3x to verify. |
| "Need to ignore a regression" | Add `[PERF-JUSTIFIED]` to commit message + explain in PR |
| "How do I see the report?" | `.pictl/benchmarks/regression-report.md` or GitHub PR comment |

## Documentation Map

| Document | Use When |
|----------|----------|
| **QUICK_REFERENCE.md** | Need quick answer (you are here) |
| **SETUP.md** | Setting up for the first time |
| **README.md** | Want complete reference guide |
| **IMPLEMENTATION_SUMMARY.md** | Want technical details |

## Validate Everything Works

```bash
bash .pictl/benchmarks/validate-setup.sh
# Expected: ✅ All checks passed! (22/22)
```

---

## What Happens on a PR

1. ✅ GitHub Actions runs regression check automatically
2. ✅ Compares your code to main baseline
3. ✅ Comments on PR with results
4. ✅ If >5% regression → blocks merge
5. ✅ If <5% or improvement → allows merge

## Responding to Regression Comment

### Scenario A: Unintended Regression

```
GitHub comment: "⚠️ dfg algorithm regressed 8%"

Fix: Optimize the code, push new commit
→ Regression check re-runs automatically
→ Merge allowed when within threshold
```

### Scenario B: Intentional Trade-off

```
GitHub comment: "❌ heuristic_miner regressed 6% (soundness checks)"

Fix: Add [PERF-JUSTIFIED] to commit message:
git commit -m "feat: add constraint checking [PERF-JUSTIFIED]"

Then in PR description:
"Regression is worth it because: adds soundness guarantee, 
prevents invalid models. 6% performance cost acceptable."

Maintainer: Approves in PR review ✓
```

## Make Commands

```bash
make bench                      # Full benchmark suite
make bench-rust                 # Criterion benchmarks only
make bench-ci                   # Fast CI mode
make bench-regression           # Check regression on PR
make bench-baseline-update      # Save new baseline (main)
make bench-baseline-update-ci   # Save baseline (CI mode)
make bench-trends               # Show trend summary
make clean-bench                # Cleanup results
make help                       # All targets
```

## Common Patterns

### Pattern 1: Normal PR (No Regressions)

```
1. Feature branch: code changes
2. Run: make bench-regression
3. Result: ✅ All benchmarks passed
4. Push: git push origin feature-branch
5. PR created → auto-comment: ✅ No regressions
6. Merge: allowed ✓
```

### Pattern 2: Intentional Trade-off

```
1. Feature branch: add soundness checks (slower)
2. Run: make bench-regression
3. Result: ❌ Regression: 7%
4. Commit: git commit -m "feat: soundness [PERF-JUSTIFIED]"
5. PR description: "Worth it because: prevents bugs"
6. Maintainer: Reviews and approves
7. Merge: allowed ✓
```

### Pattern 3: Performance Optimization

```
1. Feature branch: optimize algorithm
2. Run: make bench-regression
3. Result: 📈 Improvement: 15%
4. Push and create PR
5. Auto-comment: 📈 15% improvement! 🎉
6. Merge: allowed ✓
7. Maintainer: After merge, update baseline
8. Result: New baseline reflects faster algorithm
```

---

## Advanced (Optional)

### Customize Thresholds

Edit `.pictl/benchmarks/detect-regression.sh` lines 12-14:
```bash
REGRESSION_THRESHOLD=5.0
WARNING_THRESHOLD=2.0
IMPROVEMENT_THRESHOLD=2.0
```

### View Raw Baseline Data

```bash
jq . .pictl/benchmarks/baselines/main-latest.json

# Filter for specific algorithm:
jq '.benchmarks[] | select(.group=="discovery/dfg")' main-latest.json
```

### Export Trends for External Tools

```bash
# JSON export
python3 .pictl/benchmarks/plot-trends.py --format json > trends.json

# Filter + export
python3 .pictl/benchmarks/plot-trends.py --algorithm dfg --days 30 --format json > dfg_30day.json
```

---

## Support

For more details, see:
- **Setup:** `.pictl/benchmarks/SETUP.md`
- **Full Guide:** `.pictl/benchmarks/README.md`
- **Technical:** `.pictl/benchmarks/IMPLEMENTATION_SUMMARY.md`
- **Help:** `make help | grep bench`

---

**Last Updated:** 2026-04-11  
**Status:** ✅ Production Ready
