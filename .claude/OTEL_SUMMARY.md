# OTEL Span Coverage Mandate — Quick Reference

**Objective:** Prevent shipping untraceable code by enforcing OTEL spans on all public functions.

**Current Status:** 0/596 functions instrumented (0%)  
**Target:** 100% coverage | **Merge Gate Threshold:** 80%  
**Enforcement:** Active (scanner + pre-commit hook + ESLint)

---

## Files Created

### Enforcement Mechanisms
- **Scanner:** `scripts/verify-otel-coverage.sh` — Generate coverage report
- **Pre-commit Hook:** `.claude/hooks/otel-coverage.sh` — Block commits with missing spans
- **ESLint Rule:** `packages/observability/src/eslint-rules/require-span-for-public.js` — Real-time feedback
- **Plugin Wrapper:** `packages/observability/src/eslint-plugin.js` — Load custom rule

### Configuration
- **ESLint Config:** `.eslintrc.cjs` — Updated to include pictl-observability plugin
- **Coverage Dashboard (JSON):** `.pictl/otel-coverage.json` — Metrics & tracking
- **Coverage Dashboard (MD):** `.pictl/otel-coverage.md` — Human-readable summary

### Documentation
- **Mandate Document:** `.claude/OTEL_COVERAGE.md` — Requirements, patterns, checklist
- **Implementation Guide:** `.claude/OTEL_IMPLEMENTATION_GUIDE.md` — Step-by-step examples
- **Architecture Document:** `.claude/OTEL_ARCHITECTURE.md` — System design & components
- **This Summary:** `.claude/OTEL_SUMMARY.md` — Quick reference

---

## Quick Start

### 1. View Current Coverage
```bash
./scripts/verify-otel-coverage.sh --verbose
cat .pictl/otel-coverage.md
```

### 2. Add Spans to a Function
See `.claude/OTEL_IMPLEMENTATION_GUIDE.md` for examples.

**Pattern:**
```typescript
import { Instrumentation } from '@pictl/observability';

export function myFunction(requiredAttrs) {
  const { event, otelEvent } = Instrumentation.createProgressEvent(
    requiredAttrs['trace.id'],
    50,
    requiredAttrs,
    { message: 'Processing...' }
  );
  
  // ... implementation
  return result;
}
```

### 3. Verify Before Commit
```bash
npm run lint         # ESLint warns on missing spans
git commit           # Pre-commit hook checks new functions
./scripts/verify-otel-coverage.sh --threshold=80  # Verify coverage
```

---

## Enforcement Points

| Mechanism | When | Level | Action |
|-----------|------|-------|--------|
| **ESLint Rule** | `npm run lint` | Warn | Alerts developer in IDE |
| **Pre-commit Hook** | `git commit` | Error | Blocks commit if new functions lack spans |
| **Coverage Scanner** | Manual or CI | Error | Blocks merge if <80% |

---

## Key Patterns

### State Change
```typescript
Instrumentation.createStateChangeEvent(traceId, from, to, requiredAttrs)
```

### Algorithm Execution
```typescript
Instrumentation.createAlgorithmStartedEvent(traceId, name, requiredAttrs)
```

### Error Handling
```typescript
Instrumentation.createErrorEvent(traceId, code, message, severity, requiredAttrs)
```

### Progress
```typescript
Instrumentation.createProgressEvent(traceId, 0-100, requiredAttrs, {message})
```

### ML Operations
```typescript
Instrumentation.createMlAnalysisEvent(traceId, type, task, method, requiredAttrs)
```

### I/O Operations
```typescript
Instrumentation.createSourceStartedEvent(traceId, kind, requiredAttrs)
Instrumentation.createSinkStartedEvent(traceId, kind, requiredAttrs)
```

---

## Merge Checklist

- [ ] New public functions have Instrumentation calls
- [ ] ESLint: `npm run lint` passes
- [ ] Scanner: `./scripts/verify-otel-coverage.sh` shows improvement
- [ ] Pre-commit: No violations when committing
- [ ] Spans use correct event type
- [ ] All required OTEL attributes populated
- [ ] Error spans have status="error" + errorCode + errorMessage
- [ ] Commit message references coverage improvement
- [ ] Dashboard files updated (auto-generated)

---

## Troubleshooting

**"Coverage is still 0% after adding spans"**
→ Scanner looks for `Instrumentation.create*` in function body  
→ Verify spans are at function level, not in helper functions

**"ESLint rule not showing warnings"**
→ Run: `npm run lint -- packages/config/src/`  
→ Check `.eslintrc.cjs` has `pictl-observability` plugin

**"Pre-commit hook not running"**
→ Install hook: `ln -s ../../.claude/hooks/otel-coverage.sh .git/hooks/pre-commit`  
→ Make executable: `chmod +x .git/hooks/pre-commit`

---

## Documentation Index

1. **Quick Start** → This file (`.claude/OTEL_SUMMARY.md`)
2. **Requirements** → `.claude/OTEL_COVERAGE.md`
3. **How-To Guide** → `.claude/OTEL_IMPLEMENTATION_GUIDE.md`
4. **System Design** → `.claude/OTEL_ARCHITECTURE.md`
5. **Live Dashboard** → `.pictl/otel-coverage.md`

---

## Current Baseline

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

**Target milestones:**
- Week 1: 10% (60 functions) — foundation packages
- Week 2: 25% (150 functions) — core engines
- Week 3: 50% (300 functions) — analysis & planning
- Week 4: 75% (450 functions) — utilities
- Week 5: 100% (596 functions) — all functions

---

## Relevant Commands

```bash
# View coverage report
./scripts/verify-otel-coverage.sh --verbose

# Lint and fix
npm run lint -- --fix

# Run tests
npm test

# Pre-commit check manually
./.claude/hooks/otel-coverage.sh

# Export coverage to JSON
cat .pictl/otel-coverage.json | jq .

# Track progress over time
watch -n 5 './scripts/verify-otel-coverage.sh'
```

---

## Phase Roadmap

### Phase 1: Enforcement (Active)
- ✅ Pre-commit hook
- ✅ ESLint rule
- ✅ Coverage scanner
- ✅ Documentation

### Phase 2: Coverage Ramp (Planned)
- [ ] Drive to 50% coverage
- [ ] Auto-fix template injection
- [ ] Semantic analysis (TypeScript AST)

### Phase 3: Conformance (Planned)
- [ ] Weaver semantic convention validation
- [ ] Span attribute schema checking
- [ ] Jaeger tracing integration

### Phase 4: Observability (Planned)
- [ ] Live OTEL collector integration
- [ ] Tracing dashboard
- [ ] Span query interface

---

**Version:** 1.0  
**Last Updated:** 2026-04-12  
**Status:** Baseline capture complete, enforcement active  
**Merge-Blocking:** Yes (threshold: 80%)
