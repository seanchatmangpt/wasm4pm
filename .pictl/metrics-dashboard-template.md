# pictl Kaizen Metrics Dashboard (Template)

This is a template. To generate the live dashboard:

```bash
bash scripts/weekly-metrics-report.sh
```

The generated dashboard will be saved to: `.pictl/metrics-dashboard.md`

---

## Sample Output Structure

### 1. Executive Summary Table
- Current vs Target for all 7 metrics
- Trend indicators (↗ improving, ↘ degrading, → flat)
- Status colors (✅ green, 🟨 yellow, 🔴 red)

### 2. Detailed Metrics (One Section Per Metric)
For each metric:
- Definition
- Current value
- 7-day average
- Trend direction
- Action items
- Recent failures/incidents

### 3. Weekly Trends (Past 4 Weeks)
- Historical averages for comparison
- Improvement opportunities
- Risk factors

### 4. Integration with CI/CD
- How metrics are collected automatically
- When they're aggregated
- Which hooks trigger collection

---

## Key Metrics Definitions

### Test Pass Rate (Target: 100%)
**Description:** Percentage of tests passing across all packages.
- **Collection:** Parses vitest and cargo test output
- **Red Flag:** <95%
- **Yellow Flag:** <100%
- **Action:** Debug failing tests, check for flaky tests

### Compiler Warnings (Target: 0)
**Description:** Total warnings from cargo clippy, tsc, eslint.
- **Collection:** Counts warning lines in compiler output
- **Red Flag:** ≥5 warnings
- **Yellow Flag:** ≥1 warning
- **Action:** Fix all warnings before merge

### Build Time (Target: <60s)
**Description:** Full clean build duration (includes WASM compilation).
- **Collection:** `time { pnpm build }`
- **Yellow Flag:** >60 seconds
- **Action:** Profile build, identify bottlenecks

### OTEL Span Coverage (Target: 100%)
**Description:** % of public APIs with OpenTelemetry instrumentation.
- **Collection:** Count `export function` + `export const` vs `Instrumentation.create*`
- **Yellow Flag:** <100%
- **Action:** Add spans to missing packages

### TPS Violation Density (Target: 0/KLOC)
**Description:** Toyota Production System violations per 1000 lines of code.
- **Violations Tracked:**
  - Silent fallbacks (catch/rescue with no re-throw)
  - Missing error handling (unhandled async)
  - Speculative features (TODO/FIXME for features)
  - Undocumented timeouts (await without timeout_ms)
- **Red Flag:** >2/KLOC
- **Yellow Flag:** >0/KLOC
- **Action:** Review commits with `fix(tps):` prefix

### MTTR (Target: <1 minute)
**Description:** Mean Time To Recovery from failure.
- **Collection:** Approximated from fix commits
- **Red Flag:** >5 minutes
- **Action:** Improve observability, error messages, logging

### Test Determinism (Target: 100%)
**Description:** % of tests that pass consistently across 3 consecutive runs.
- **Collection:** Run suite 3 times, compare results
- **Yellow Flag:** <99%
- **Action:** Identify and fix flaky tests

---

## How to Interpret the Dashboard

### Red Flags (Immediate Action)
Stop work and fix:
- Test pass rate <95%
- Compiler warnings ≥5
- MTTR >5 minutes
- TPS violations >2/KLOC

### Yellow Flags (Plan for Next Sprint)
Add to sprint backlog:
- Test pass rate <100%
- Compiler warnings ≥1
- Build time >60s
- OTEL coverage <90%
- TPS violations >0/KLOC
- Test determinism <99%

### Green (Keep Improving)
- Test pass rate = 100%
- Compiler warnings = 0
- Build time <60s
- OTEL coverage = 100%
- TPS violations = 0/KLOC
- MTTR <1min
- Test determinism = 100%

---

## Weekly Kaizen Actions

Every week:
1. **Monday:** Review metrics dashboard
2. **Tuesday:** Pick one metric below target
3. **Wednesday:** Root-cause analysis
4. **Thursday:** Implement minimal fix
5. **Friday:** Measure improvement

---

## Files

| File | Purpose |
|------|---------|
| `.pictl/metrics.json` | Raw metric data (JSON, append-only) |
| `.pictl/build-times.log` | Build time history (CSV) |
| `.pictl/metrics-dashboard.md` | Weekly aggregated report (generated) |
| `.pictl/metrics-dashboard-template.md` | This file (reference) |
| `.claude/hooks/metrics-track.sh` | Post-commit collection script |
| `.claude/hooks/pre-push-metrics.sh` | Pre-push gate (red/yellow/green) |
| `scripts/weekly-metrics-report.sh` | Report generator |

---

## Integration Points

**On Every Commit:**
- `.git/hooks/post-commit` calls `metrics-track.sh`
- Metrics collected and persisted to `.pictl/metrics.json`
- Build time appended to `.pictl/build-times.log`

**Before Every Push (Optional):**
- `.git/hooks/pre-push` calls `pre-push-metrics.sh`
- Blocks push if red flags detected
- Shows yellow/green status summary

**Weekly (Manual or Scheduled):**
- Run `bash scripts/weekly-metrics-report.sh`
- Generates `.pictl/metrics-dashboard.md`
- Share with team for Kaizen planning

---

## Next Steps

1. Enable metrics collection: `cp .claude/hooks/metrics-track.sh .git/hooks/post-commit && chmod +x .git/hooks/post-commit`
2. Make a test commit: `git commit --allow-empty -m "test: collect metrics"`
3. Check collection: `cat .pictl/metrics.json | jq '.historical_data[-1]'`
4. Generate dashboard: `bash scripts/weekly-metrics-report.sh`
5. Review metrics: `cat .pictl/metrics-dashboard.md`

---

**Toyota Production System Applied to Software:** Eliminate muda (waste), enable kaizen (continuous improvement), verify at gemba (actual place), make defects visible.
