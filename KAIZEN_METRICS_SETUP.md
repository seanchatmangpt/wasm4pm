# pictl Kaizen Metrics Tracking — Complete Setup & Operations Guide

**Version:** 1.0  
**Last Updated:** 2026-04-12  
**Philosophy:** Continuous improvement via visible metrics (Toyota Production System)

---

## Overview

Kaizen metrics tracking automates the collection and reporting of 8 key quality indicators for the pictl project:

1. **Test Pass Rate** (target: 100%) — Are tests passing?
2. **Compiler Warnings** (target: 0) — Any code quality issues?
3. **Build Time** (target: <60s) — Is the build getting slower?
4. **OTEL Span Coverage** (target: 100%) — Are all APIs instrumented?
5. **TPS Violation Density** (target: 0/KLOC) — How much waste (muda) exists?
6. **MTTR** (target: <1min) — How fast do we recover from failures?
7. **Test Determinism** (target: 100%) — Are tests flaky or stable?
8. **Lines of Code** (informational) — How large is the codebase?

Metrics are collected automatically on every commit and aggregated weekly for trend analysis.

---

## Files & Structure

### Core Files

| File | Purpose | Format |
|------|---------|--------|
| `.pictl/metrics.json` | Raw metrics data (append-only) | JSON |
| `.pictl/metrics.json` → `historical_data` | Timestamped snapshots (one per commit) | JSON array |
| `.pictl/build-times.log` | Build time history for trend analysis | CSV |
| `.pictl/metrics-dashboard.md` | Weekly aggregated report | Markdown |
| `.pictl/metrics-dashboard-template.md` | Dashboard template & reference | Markdown |
| `.claude/hooks/metrics-track.sh` | Post-commit collection script | Bash |
| `.claude/hooks/pre-push-metrics.sh` | Pre-push gate (optional) | Bash |
| `scripts/weekly-metrics-report.sh` | Weekly aggregation & dashboard generation | Bash |

### Directories

```
pictl/
├── .pictl/
│   ├── metrics.json                   # Raw data (append-only)
│   ├── build-times.log                # Build time history (CSV)
│   ├── metrics-dashboard.md           # Generated weekly report
│   ├── metrics-dashboard-template.md  # Reference template
│   └── benchmarks/                    # (Existing)
├── .claude/
│   ├── hooks/
│   │   ├── metrics-track.sh           # Post-commit metric collection
│   │   └── pre-push-metrics.sh        # Pre-push metrics gate (optional)
│   └── HOOKS.md                       # Hook documentation
├── scripts/
│   └── weekly-metrics-report.sh       # Report generator
└── KAIZEN_METRICS_SETUP.md            # This file
```

---

## Setup Instructions

### Step 1: Enable Automatic Collection (Post-Commit Hook)

This is **required** for metrics to be collected.

```bash
# Copy the metrics tracking script to git hooks
cp .claude/hooks/metrics-track.sh .git/hooks/post-commit

# Make it executable
chmod +x .git/hooks/post-commit

# Verify it works
git commit --allow-empty -m "test: validate metrics hook"

# Check that metrics were collected
cat .pictl/metrics.json | jq '.historical_data[-1]'
```

Expected output (JSON object with all metrics):
```json
{
  "timestamp": "2026-04-12T00:46:05Z",
  "git_commit_hash": "5e82275",
  "test_pass_rate": 95,
  "compiler_warnings": 0,
  "build_time_ms": 45000,
  "otel_span_coverage": 85,
  "tps_violation_density": 0.5,
  "mttr": 3,
  "test_determinism": 98,
  "locs": 15240
}
```

### Step 2: Generate Weekly Dashboard (Manual or Scheduled)

To generate the weekly report:

```bash
bash scripts/weekly-metrics-report.sh

# Verify it was created
cat .pictl/metrics-dashboard.md | head -50

# OR generate at a specific output path
bash scripts/weekly-metrics-report.sh /custom/path/dashboard.md
```

The dashboard shows:
- Executive summary table (current vs target for all metrics)
- Detailed analysis for each metric
- Trends (↗ improving, ↘ degrading, → flat)
- Status indicators (✅ green, 🟨 yellow, 🔴 red)
- Weekly historical averages (past 4 weeks)
- Action items per metric

### Step 3 (Optional): Enable Pre-Push Metrics Gate

To block commits with critical issues:

```bash
# Copy the pre-push metrics gate
cp .claude/hooks/pre-push-metrics.sh .git/hooks/pre-push

# Make it executable
chmod +x .git/hooks/pre-push

# Test it (will show red/yellow/green status)
git push origin your-branch  # Will check metrics before pushing
```

Red flags (blocking):
- Test pass rate <95%
- Compiler warnings ≥5
- MTTR >5 minutes
- TPS violations >2/KLOC

---

## Understanding the Metrics

### 1. Test Pass Rate (Target: 100%)

**What it measures:** Percentage of tests passing in vitest (TypeScript) and cargo (Rust).

**Interpretation:**
- ✅ 100% — All tests passing, healthy
- 🟨 95-99% — Some test failures, need immediate fix
- 🔴 <95% — Many failures, critical issue

**How to improve:**
1. Run locally: `pnpm test` (TypeScript) or `cargo test` (Rust)
2. Identify failing tests by name
3. Debug root cause (not the symptom)
4. Fix and re-run until 100% pass

**Action items:**
- Commit includes test failure: run tests locally before committing
- Flaky test (passes sometimes): check test isolation, remove timing assumptions
- Test timeout: increase timeout or improve performance

---

### 2. Compiler Warnings (Target: 0)

**What it measures:** Total warnings from TypeScript compiler (tsc) and Rust clippy.

**Interpretation:**
- ✅ 0 — No warnings, clean code
- 🟨 1-4 — Minor issues, should fix soon
- 🔴 ≥5 — Many issues, critical quality problem

**How to improve:**
```bash
# TypeScript warnings
tsc --noEmit

# Rust warnings
cd wasm4pm && cargo clippy --all-targets

# Fix issues indicated by compiler
```

**Common warnings:**
- TypeScript: unused variables, implicit any, missing return type
- Rust: unused imports, clippy suggestions

---

### 3. Build Time (Target: <60 seconds)

**What it measures:** Duration of full clean build (pnpm build) in milliseconds.

**Interpretation:**
- ✅ <60s — Fast feedback loop, good
- 🟨 60-90s — Acceptable but slow
- 🔴 >90s — Developer experience impact

**How to improve:**
1. Measure current build time: `time pnpm build`
2. Profile bottlenecks: check which package takes longest
3. Common culprits:
   - Large node_modules (reinstall with `pnpm install`)
   - No incremental build (check tsconfig.json)
   - Missing build cache (check vitest config)

---

### 4. OTEL Span Coverage (Target: 100%)

**What it measures:** Percentage of public APIs with OpenTelemetry instrumentation calls.

**Interpretation:**
- ✅ 100% — All APIs emit spans for observability
- 🟨 <100% — Some APIs missing instrumentation
- 🔴 <80% — Major observability gap

**How to improve:**
```bash
# Find all public functions
find packages -name "*.ts" -not -path "*/node_modules/*" -not -path "*/__tests__/*" \
  -exec grep -h "export function\|export const\|export class" {} + | wc -l

# Find functions with Instrumentation.create*
find packages -name "*.ts" -not -path "*/node_modules/*" \
  -exec grep -l "Instrumentation.create" {} + | wc -l

# Add spans to missing APIs
# Example:
import { Instrumentation } from '@pictl/observability';

export function myPublicAPI(input: string) {
  return Instrumentation.createSpan('my.api', {}, () => {
    // Implementation
    return result;
  });
}
```

---

### 5. TPS Violation Density (Target: 0/KLOC)

**What it measures:** Toyota Production System violations per 1000 lines of code.

**Violation types:**
- **Silent Fallbacks** (highest priority): `catch { }` with no error handling
- **Missing Error Handling**: `await` or `Promise` without `.catch()`
- **Speculative Features**: `TODO` or `FIXME` for future features (YAGNI waste)
- **Undocumented Timeouts**: Blocking operations without `timeout_ms` (deadlock risk)

**Interpretation:**
- ✅ 0 — Zero waste, excellent discipline
- 🟨 0-1/KLOC — Minimal waste, acceptable
- 🔴 >2/KLOC — Significant waste, refactor required

**How to improve:**
```bash
# Find silent fallbacks
find packages -name "*.ts" -exec grep -n "catch\|rescue" {} +

# Example fix (WRONG):
try {
  await risky_operation();
} catch (e) {
  // Silent! Hides defect
}

# Example fix (RIGHT):
try {
  await risky_operation();
} catch (e) {
  logger.error('Operation failed', e);
  throw e;  // Let supervisor handle
}
```

See `~/.claude/rules/toyota-production.md` for full muda elimination principles.

---

### 6. MTTR: Mean Time To Recovery (Target: <1 minute)

**What it measures:** Average time from failure detection to fix deployment.

**Interpretation:**
- ✅ <1 min — Fast recovery, good observability
- 🟨 1-5 min — Acceptable recovery time
- 🔴 >5 min — Slow response, missing observability

**How to improve:**
1. Add OTEL spans (see metric 4)
2. Write clear error messages (not cryptic codes)
3. Add unit tests that fail fast when code breaks
4. Document recovery procedures

---

### 7. Test Determinism (Target: 100%)

**What it measures:** Percentage of tests that pass consistently across 3 consecutive runs.

**Interpretation:**
- ✅ 100% — All tests deterministic, reliable CI
- 🟨 95-99% — Some flaky tests, need investigation
- 🔴 <95% — Severely flaky, CI unreliable

**How to improve (flaky test diagnosis):**
```bash
# Run test 10 times to detect flakiness
for i in {1..10}; do
  pnpm test --grep "test_name" || echo "FAILED on run $i"; done

# If flaky, check for:
# 1. Timing assumptions (use fake clocks)
# 2. Random seeds (seed RNG deterministically)
# 3. Shared state (isolate each test)
# 4. External dependencies (mock external APIs)
```

---

### 8. Lines of Code (Informational)

**What it measures:** Total LOC (Rust + TypeScript, excluding tests and node_modules).

**Use for:** Trend analysis, code complexity estimates.

**Interpretation:**
- Growing steadily: normal feature development
- Large jump: major feature or refactoring
- Declining: code cleanup or consolidation

---

## Integration Points

### Automatic Collection

**Trigger:** After every `git commit`  
**Hook:** `.git/hooks/post-commit` → `.claude/hooks/metrics-track.sh`  
**Output:** Appends to `.pictl/metrics.json` + `.pictl/build-times.log`

```bash
$ git commit -m "feat: add new API"
# Metrics automatically collected...
# ✓ Test Pass Rate: 98%
# ✓ Compiler Warnings: 0
# ✓ Build Time: 44234ms
# ... etc
```

### Weekly Aggregation

**Trigger:** Manual or scheduled (e.g., Friday EOD)  
**Script:** `bash scripts/weekly-metrics-report.sh`  
**Output:** `.pictl/metrics-dashboard.md`

```bash
# Generate report
bash scripts/weekly-metrics-report.sh

# Or view in terminal
cat .pictl/metrics-dashboard.md | less
```

### Pre-Push Gate (Optional)

**Trigger:** Before `git push`  
**Hook:** `.git/hooks/pre-push` → `.claude/hooks/pre-push-metrics.sh`  
**Behavior:**
- Shows red/yellow/green status
- Blocks push if red flags detected
- Allows push if all green/yellow

```bash
$ git push origin branch
pictl Pre-Push Metrics Gate
==============================

Passing Metrics:
  ✅ Test Pass Rate: 100%
  ✅ Compiler Warnings: 0

Action Items (Yellow Flags):
  🟨 OTEL Coverage: 87% < 100%

✅ Pre-Push Metrics Gate: PASS
All metrics within acceptable ranges. Push allowed.
```

---

## Weekly Kaizen Cycle

Every week (typically Monday-Friday):

| Day | Activity | Owner |
|-----|----------|-------|
| **Mon** | Review metrics dashboard from previous week | Team |
| **Tue** | Identify one metric below target | Team |
| **Wed** | Root-cause analysis (gemba: why?) | Developer |
| **Thu** | Implement minimal fix (kaizen) | Developer |
| **Fri** | Measure improvement, update metrics | Developer |

### Example Week

```
Monday:  Review dashboard
         Test Pass Rate: 98% (target: 100%)
         TPS Violations: 1.2/KLOC (target: 0)
         → Pick TPS violations (higher impact)

Tuesday: Root-cause analysis
         git log --grep="fix(tps)" → find violations
         Grep for silent fallbacks in packages/
         Find 3 catch blocks without error handling

Wednesday: Implement fix
         Add error logging and re-throw to 3 locations
         Run `pnpm test` to verify no regression

Thursday:  Test again
         Run tests 10x to check determinism
         All tests passing, deterministic

Friday:   Measure
         New TPS density: 0.5/KLOC (was 1.2)
         Improvement: 58% reduction
         Next week: find other violations
```

---

## Troubleshooting

### Metrics Collection Not Working

**Symptom:** `.pictl/metrics.json` not being updated after commits

**Diagnosis:**
```bash
# 1. Check hook exists and is executable
ls -la .git/hooks/post-commit

# 2. Check hook runs manually
CLAUDE_PROJECT_DIR=. bash .git/hooks/post-commit

# 3. Check jq is installed
which jq
```

**Fix:**
```bash
# Re-enable hook
cp .claude/hooks/metrics-track.sh .git/hooks/post-commit
chmod +x .git/hooks/post-commit

# Test with empty commit
git commit --allow-empty -m "test: metrics"
```

### Dashboard Report Empty or Broken

**Symptom:** `metrics-dashboard.md` is empty or missing sections

**Diagnosis:**
```bash
# Check metrics.json has data
cat .pictl/metrics.json | jq '.historical_data | length'  # Should be >0

# Check jq and perl are available
which jq perl
```

**Fix:**
```bash
# Regenerate dashboard
bash scripts/weekly-metrics-report.sh

# Or manually populate with defaults
cat .pictl/metrics-dashboard-template.md > .pictl/metrics-dashboard.md
```

### Pre-Push Gate Blocking Legitimate Pushes

**Symptom:** `git push` blocked despite code being ready

**Solutions:**
1. Check red/yellow flags reported
2. Fix issues (see metric sections above)
3. Re-run metrics collection: `CLAUDE_PROJECT_DIR=. bash .claude/hooks/metrics-track.sh`
4. Try push again

**To disable pre-push gate temporarily:**
```bash
# Remove pre-push hook
rm .git/hooks/pre-push

# Or bypass (not recommended)
git push --no-verify
```

---

## Files Checklist

### After Setup

- [ ] `.git/hooks/post-commit` exists and is executable
- [ ] `.pictl/metrics.json` has `historical_data` array with ≥1 entry
- [ ] `.pictl/build-times.log` exists (CSV header + entries)
- [ ] `.pictl/metrics-dashboard.md` generated (at least 100 lines)
- [ ] `scripts/weekly-metrics-report.sh` is executable
- [ ] `.claude/hooks/metrics-track.sh` is executable

### Optional (Pre-Push Gate)

- [ ] `.git/hooks/pre-push` exists and is executable (if enabled)

---

## Contributing to Metrics

### Adding a New Metric

1. **Add to schema** (`.pictl/metrics.json` → `schema.metrics`)
2. **Add collection function** (`.claude/hooks/metrics-track.sh`)
3. **Add to report** (`.pictl/metrics-dashboard-template.md`)
4. **Add to weekly aggregation** (`.scripts/weekly-metrics-report.sh`)
5. **Document** (this file)

### Reporting Issues

If metrics collection fails, check:
1. Hook exit code: `bash .git/hooks/post-commit; echo $?` (should be 0)
2. Permissions: `ls -la .pictl/metrics.json` (should be writable)
3. jq installation: `which jq` (required for JSON manipulation)

---

## Further Reading

- **Toyota Production System:** See `~/.claude/rules/toyota-production.md`
- **TPS Violations:** See `~/.claude/rules/critical-constraints.md` (muda definition)
- **Evidence Standards:** See `~/.claude/rules/verification.md` (proof artifacts)
- **OTEL Instrumentation:** See `packages/observability/src/instrumentation.ts`

---

**Last Updated:** 2026-04-12  
**Maintained by:** Sean Chatman  
**License:** MIT (pictl project)
