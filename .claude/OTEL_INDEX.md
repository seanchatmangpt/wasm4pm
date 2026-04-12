# OTEL Coverage System — Documentation Index

Complete reference for the OTEL span coverage mandate implementation in pictl.

---

## Quick Navigation

**I just want to...**

- **View current coverage** → Run: `./scripts/verify-otel-coverage.sh --verbose`
- **Add spans to functions** → Read: `.claude/OTEL_IMPLEMENTATION_GUIDE.md`
- **Understand the system** → Read: `.claude/OTEL_ARCHITECTURE.md`
- **Get a quick reference** → Read: `.claude/OTEL_SUMMARY.md`
- **See the requirements** → Read: `.claude/OTEL_COVERAGE.md`

---

## All Documentation Files

### User-Facing Documents

| File | Purpose | Audience | Length | Start Here? |
|------|---------|----------|--------|------------|
| `.claude/OTEL_SUMMARY.md` | One-page quick reference | All developers | 150 lines | ✅ YES |
| `.claude/OTEL_COVERAGE.md` | Mandate requirements & enforcement | All developers | 400 lines | ✅ For details |
| `.claude/OTEL_IMPLEMENTATION_GUIDE.md` | Step-by-step how-to with examples | Developers instrumenting | 600 lines | ✅ For implementation |
| `.claude/OTEL_ARCHITECTURE.md` | System design & technical deep dive | Maintainers | 500 lines | For maintainers |
| `.claude/OTEL_INDEX.md` | This file — documentation index | All developers | — | For navigation |

### Generated Artifacts

| File | Purpose | Updated | Format |
|------|---------|---------|--------|
| `.pictl/otel-coverage.json` | Coverage metrics & tracking | Per scan | JSON |
| `.pictl/otel-coverage.md` | Coverage dashboard | Per scan | Markdown |

---

## Tool Documentation

### Scanner Script
- **File:** `scripts/verify-otel-coverage.sh`
- **Language:** Bash + Node.js
- **Purpose:** Generate coverage metrics
- **Usage:** `./scripts/verify-otel-coverage.sh --threshold=80 --verbose`
- **Output:** JSON + Markdown reports
- **Exit:** 0 (success) or 1 (below threshold)

### Pre-Commit Hook
- **File:** `.claude/hooks/otel-coverage.sh`
- **Language:** Bash + Node.js
- **Purpose:** Block commits with missing spans on NEW functions
- **Installation:** `ln -s ../../.claude/hooks/otel-coverage.sh .git/hooks/pre-commit`
- **Trigger:** `git commit`
- **Exit:** 0 (allow) or 1 (block)

### ESLint Rule
- **File:** `packages/observability/src/eslint-rules/require-span-for-public.js`
- **Language:** JavaScript (ESLint API)
- **Purpose:** Real-time IDE feedback
- **Rule ID:** `pictl-observability/require-span-for-public`
- **Usage:** `npm run lint` or `npm run lint -- --fix`
- **Severity:** Warn (escalate to error in Phase 2)

### ESLint Plugin
- **File:** `packages/observability/src/eslint-plugin.js`
- **Language:** JavaScript
- **Purpose:** Load custom ESLint rules
- **Config:** `.eslintrc.cjs`

---

## Common Tasks

### Task: View current coverage
```bash
./scripts/verify-otel-coverage.sh --verbose
cat .pictl/otel-coverage.md
cat .pictl/otel-coverage.json | jq '.coverage'
```
See: `.claude/OTEL_SUMMARY.md` (section: Quick Start)

### Task: Add spans to a function
```bash
# Read examples
cat .claude/OTEL_IMPLEMENTATION_GUIDE.md

# Implement function with Instrumentation call
# Verify scanner recognizes it
./scripts/verify-otel-coverage.sh --verbose

# Commit
git add packages/config/src/hash.ts
git commit -m "feat(config): add OTEL spans to hash module"
```
See: `.claude/OTEL_IMPLEMENTATION_GUIDE.md` (section: Step-by-Step Example)

### Task: Install pre-commit hook
```bash
ln -s ../../.claude/hooks/otel-coverage.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```
Test with: `git commit -m "test"` on a file with new public functions

### Task: Check ESLint warnings
```bash
npm run lint -- packages/config/src/
npm run lint -- --fix  # Attempt auto-fix
```

### Task: Track progress over time
```bash
watch -n 5 './scripts/verify-otel-coverage.sh'
```

### Task: Export metrics for dashboard
```bash
cat .pictl/otel-coverage.json | jq '.by_package | to_entries[] | [.key, .value.coverage] | @csv'
```

---

## Instrumentation Patterns

All patterns documented in: `.claude/OTEL_IMPLEMENTATION_GUIDE.md`

**State Change:**
```typescript
Instrumentation.createStateChangeEvent(traceId, from, to, requiredAttrs)
```

**Algorithm:**
```typescript
Instrumentation.createAlgorithmStartedEvent(traceId, name, requiredAttrs)
Instrumentation.createAlgorithmCompletedEvent(traceId, spanId, name, status, requiredAttrs)
```

**Error:**
```typescript
Instrumentation.createErrorEvent(traceId, code, message, severity, requiredAttrs)
```

**Progress:**
```typescript
Instrumentation.createProgressEvent(traceId, progress, requiredAttrs, {message?})
```

**ML:**
```typescript
Instrumentation.createMlAnalysisEvent(traceId, type, task, method, requiredAttrs)
```

**I/O:**
```typescript
Instrumentation.createSourceStartedEvent(traceId, kind, requiredAttrs)
Instrumentation.createSinkStartedEvent(traceId, kind, requiredAttrs)
```

See: `.claude/OTEL_IMPLEMENTATION_GUIDE.md` (section: Instrumentation Patterns by Function Type)

---

## Baseline Metrics

Generated: 2026-04-12 via `./scripts/verify-otel-coverage.sh`

```
Total Public Functions: 596
Instrumented: 0
Coverage: 0%

By Package:
  config:        0/37   (0%)
  contracts:     0/102  (0%)
  engine:        0/81   (0%)
  kernel:        0/37   (0%)
  ml:            0/19   (0%)
  observability: 0/48   (0%)
  planner:       0/27   (0%)
  swarm:         0/29   (0%)
  testing:       0/216  (0%)
```

See: `.pictl/otel-coverage.json` (machine-readable)  
See: `.pictl/otel-coverage.md` (human-readable)

---

## Enforcement Roadmap

### Phase 1: Enforcement ✅ COMPLETE
- Scanner
- Pre-commit hook
- ESLint rule
- Documentation

### Phase 2: Coverage Ramp (Planned)
- Drive to 50% coverage
- Auto-fix injection
- Semantic analysis

### Phase 3: Conformance (Planned)
- Weaver integration
- Schema validation
- Typing

### Phase 4: Observability (Planned)
- OTEL collector
- Jaeger tracing
- Live dashboard

---

## Merge Checklist

When submitting PR with new/modified public functions:

- [ ] ESLint: `npm run lint` passes
- [ ] Scanner: `./scripts/verify-otel-coverage.sh` shows coverage improvement
- [ ] Pre-commit: Hook allows commit (or not installed)
- [ ] Spans: All new exports have Instrumentation calls
- [ ] Event types: Correct type for each function (state/algo/error/progress/ml/io)
- [ ] Attributes: All required OTEL attrs populated
- [ ] Errors: Error spans have status="error" + code + message
- [ ] Nesting: Parent spans set where applicable
- [ ] Commit message: References coverage improvement
- [ ] Dashboard: Auto-updated (no manual action needed)

See: `.claude/OTEL_COVERAGE.md` (section: Merge Checklist)

---

## Troubleshooting

**Problem: "Coverage still 0% after adding spans"**  
→ See: `.claude/OTEL_IMPLEMENTATION_GUIDE.md` (section: Troubleshooting)

**Problem: "ESLint rule not showing warnings"**  
→ See: `.claude/OTEL_IMPLEMENTATION_GUIDE.md` (section: Troubleshooting)

**Problem: "Pre-commit hook not running"**  
→ See: `.claude/OTEL_SUMMARY.md` (section: Troubleshooting)

**Problem: "What span type should I use?"**  
→ See: `.claude/OTEL_IMPLEMENTATION_GUIDE.md` (section: Instrumentation Patterns by Function Type)

---

## References

- OTEL Specification: https://opentelemetry.io/docs/specs/protocol/
- Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/
- Instrumentation API: `packages/observability/src/instrumentation.ts`
- Test Harness: `packages/testing/src/harness/otel-capture.ts`

---

## Files at a Glance

```
.claude/
├── OTEL_SUMMARY.md               ← START HERE (1 page)
├── OTEL_COVERAGE.md              ← Requirements & enforcement
├── OTEL_IMPLEMENTATION_GUIDE.md   ← How-to & examples
├── OTEL_ARCHITECTURE.md          ← System design
├── OTEL_INDEX.md                 ← This file
└── hooks/
    └── otel-coverage.sh          ← Pre-commit enforcement

.pictl/
├── otel-coverage.json            ← Metrics (machine-readable)
└── otel-coverage.md              ← Dashboard (human-readable)

scripts/
└── verify-otel-coverage.sh       ← Coverage scanner

packages/observability/src/
├── eslint-rules/
│   └── require-span-for-public.js ← ESLint rule
└── eslint-plugin.js              ← Plugin wrapper

.eslintrc.cjs                      ← Configuration (updated)
```

---

## Command Summary

| Command | Purpose | Output |
|---------|---------|--------|
| `./scripts/verify-otel-coverage.sh` | Generate coverage report | JSON + Markdown |
| `./scripts/verify-otel-coverage.sh --verbose` | Show all missing functions | Console output |
| `./scripts/verify-otel-coverage.sh --threshold=90` | Use different threshold | Console output |
| `npm run lint` | Check for violations | ESLint report |
| `npm run lint -- --fix` | Auto-fix where possible | Fixed files |
| `./.claude/hooks/otel-coverage.sh` | Run pre-commit check manually | Pass/fail |
| `cat .pictl/otel-coverage.json \| jq` | View metrics as JSON | JSON output |
| `cat .pictl/otel-coverage.md` | View dashboard | Markdown table |
| `watch -n 5 './scripts/verify-otel-coverage.sh'` | Watch progress | Real-time updates |

---

## Getting Help

1. **Quick answers** → `.claude/OTEL_SUMMARY.md`
2. **How-to guidance** → `.claude/OTEL_IMPLEMENTATION_GUIDE.md`
3. **System details** → `.claude/OTEL_ARCHITECTURE.md`
4. **Requirements** → `.claude/OTEL_COVERAGE.md`
5. **Examples** → `.claude/OTEL_IMPLEMENTATION_GUIDE.md` (patterns section)

---

**Version:** 1.0  
**Last Updated:** 2026-04-12  
**Status:** Production Ready  
**Enforcement:** Active (merge-blocking at <80% coverage)
