# OTEL Span Coverage Mandate

**Status:** Enforcement Active | **Target Coverage:** 100% | **Merge Gate Threshold:** 80%

## Overview

All public functions in `packages/*/src/**/*.ts` MUST emit OTEL spans via `Instrumentation.create*Event()` before they can be merged.

This mandate prevents shipping untraceable code and ensures observability is built-in, not retrofitted.

**Current Status:**
```
Coverage: 0/596 public functions (0%)
Target:   100% (merge-blocking at <80%)
```

See `.pictl/otel-coverage.json` and `.pictl/otel-coverage.md` for live dashboard.

---

## Enforcement Mechanisms

### 1. Pre-Commit Hook (`.claude/hooks/otel-coverage.sh`)

**Blocks commits** when new public functions added without spans.

```bash
# Triggered automatically on git commit
# Scans newly-staged TypeScript files
# Checks for Instrumentation calls in exported functions
# Blocks commit if violations found
```

**Install:**
```bash
ln -s ../../.claude/hooks/otel-coverage.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**When it blocks:**
```
❌ OTEL SPAN COVERAGE VIOLATION

New public functions must have Instrumentation calls.

  packages/engine/src/new-file.ts:15
    → export function analyzeTrace() { ... }
  
  packages/engine/src/new-file.ts:32
    → export const processEvent = () => { ... }

Fix by adding Instrumentation.create*() call at function start.
```

### 2. ESLint Rule (`pictl-observability/require-span-for-public`)

**Warns** when public functions lack spans during linting.

```bash
# Run linting
npm run lint
npm run lint -- --fix  # Attempts auto-fix
```

**When it warns:**
```
packages/config/src/resolver.ts:42:1  warn  Public function "resolveConfig" must have an 
Instrumentation call. Add Instrumentation.createSpan() or similar at the start of the function.
```

**Configure in `.eslintrc.cjs`:**
```javascript
rules: {
  'pictl-observability/require-span-for-public': 'warn', // Elevate to 'error' when ready
}
```

### 3. Verification Script (`scripts/verify-otel-coverage.sh`)

**Scans** entire codebase and generates coverage report.

```bash
# Run coverage scan
./scripts/verify-otel-coverage.sh --threshold=80 --verbose

# Example output:
# ✅ engine: 2/81 (2%)
# ❌ config: 0/37 (0%)
# ❌ contracts: 0/102 (0%)
# 
# 📊 OVERALL: 2/596 (0%)
# ❌ Coverage 0% is below threshold of 80%
```

**Options:**
- `--threshold=N` — Set coverage threshold (default: 80)
- `--verbose` — Show detailed list of missing functions
- `--fix` — Attempt auto-fix (reserved for future)

**Exit codes:**
- `0` — Coverage meets threshold
- `1` — Coverage below threshold
- `2` — Scanning error

---

## How to Add OTEL Spans

### Pattern 1: State Change (Engine operations)

```typescript
import { Instrumentation, RequiredOtelAttributes } from '@pictl/observability';

export async function updateEngineState(
  currentState: string,
  nextState: string,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createStateChangeEvent(
    requiredAttrs['trace.id'],
    currentState,
    nextState,
    requiredAttrs,
    { reason: 'planning_completed' }
  );

  // ... implementation
  return otelEvent;
}
```

### Pattern 2: Algorithm Execution

```typescript
export async function runAlgorithm(
  algorithmName: string,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createAlgorithmStartedEvent(
    requiredAttrs['trace.id'],
    algorithmName,
    requiredAttrs,
    { stepId: 'step_1' }
  );

  try {
    // ... run algorithm
  } finally {
    // Emit completion event
    const completed = Instrumentation.createAlgorithmCompletedEvent(
      requiredAttrs['trace.id'],
      otelEvent.span_id,
      algorithmName,
      'OK',
      requiredAttrs
    );
  }
}
```

### Pattern 3: Error Event

```typescript
export function handleError(
  errorCode: string,
  errorMessage: string,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createErrorEvent(
    requiredAttrs['trace.id'],
    errorCode,
    errorMessage,
    'error',
    requiredAttrs,
    { context: { component: 'resolver' } }
  );

  // ... error handling
}
```

### Pattern 4: Generic Progress

```typescript
export function reportProgress(
  progress: number,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createProgressEvent(
    requiredAttrs['trace.id'],
    progress,
    requiredAttrs,
    { message: 'Processing algorithm 2/5' }
  );
}
```

### Pattern 5: ML Operations

```typescript
export function trainModel(
  mlTask: string,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createMlAnalysisEvent(
    requiredAttrs['trace.id'],
    'MlModelTraining',
    mlTask,
    'training',
    requiredAttrs,
    { modelType: 'random-forest', confidence: 0.92 }
  );
}
```

---

## Available Instrumentation Methods

From `packages/observability/src/instrumentation.ts`:

| Method | Purpose | Event Type |
|--------|---------|------------|
| `createStateChangeEvent()` | Track state transitions | StateChange |
| `createPlanGeneratedEvent()` | Track plan generation | PlanGenerated |
| `createAlgorithmStartedEvent()` | Track algorithm start | AlgorithmStarted |
| `createAlgorithmCompletedEvent()` | Track algorithm completion | AlgorithmCompleted |
| `createSourceStartedEvent()` | Track source read start | SourceStarted |
| `createSourceCompletedEvent()` | Track source read completion | SourceCompleted |
| `createSinkStartedEvent()` | Track sink write start | SinkStarted |
| `createSinkCompletedEvent()` | Track sink write completion | SinkCompleted |
| `createProgressEvent()` | Track progress (0-100) | Progress |
| `createErrorEvent()` | Track errors | Error |
| `createMlAnalysisEvent()` | Track ML operations | MlModelTraining/MlPredictionMade/etc |

---

## Merge Checklist

Before merging any PR that adds/modifies public functions:

- [ ] Run `./scripts/verify-otel-coverage.sh` — verify coverage >= 80%
- [ ] Run `npm run lint` — no ESLint warnings on new functions
- [ ] Pre-commit hook passes — new functions have spans
- [ ] Instrumentation calls use correct event type (state/algorithm/error/progress/ml)
- [ ] All OTEL attributes are populated (service.name, run.id, trace.id, span.id)
- [ ] Spans are properly nested (parent_span_id set where applicable)
- [ ] Error spans have status="error" + errorCode + errorMessage
- [ ] Update `.pictl/otel-coverage.json` and `.pictl/otel-coverage.md` if coverage changes
- [ ] Coverage report committed (automation will update on every `verify-otel-coverage.sh` run)

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Enforcement** | Active | Pre-commit hook + ESLint rule + scanner |
| **Phase 2: Coverage** | Planned | Drive to 50% coverage (300+ functions instrumented) |
| **Phase 3: Weaver Conformance** | Planned | Ensure span names match semantic convention schema |
| **Phase 4: Tracing Dashboard** | Planned | Real-time observability dashboard (Jaeger integration) |
| **Phase 5: Automated Fixes** | Planned | AI-assisted span injection for common patterns |

---

## Exemptions

Functions that do NOT require spans:

1. **Type definitions**: `export type X = ...`
2. **Interfaces**: `export interface X { ... }`
3. **Pure utility functions** <10 lines with no side effects (rare)
4. **Test helpers** in `packages/testing/src/`

To exempt a function, add ESLint disable comment:

```typescript
// eslint-disable-next-line pictl-observability/require-span-for-public
export function simpleUtility() {
  return 42;
}
```

---

## References

- OTEL Specification: https://opentelemetry.io/docs/spec/
- Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/
- pictl Observability Package: `packages/observability/src/`
- Scanner Implementation: `scripts/verify-otel-coverage.sh`
- Hook Implementation: `.claude/hooks/otel-coverage.sh`

---

**Last Updated:** 2026-04-12  
**Enforcement Level:** Active  
**Merge-Blocking Threshold:** Coverage < 80%
