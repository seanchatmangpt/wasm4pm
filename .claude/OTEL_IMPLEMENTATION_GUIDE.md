# OTEL Span Coverage Implementation Guide

**Objective:** Achieve 100% OTEL span coverage across all public functions in pictl monorepo.

**Current Status:** 0/596 functions instrumented (0%)  
**Target:** 100% (merge-blocking at <80%)  
**Timeline:** Incremental instrumentation per package

---

## Quick Start

### 1. Generate Coverage Report
```bash
# See all gaps
./scripts/verify-otel-coverage.sh --verbose

# JSON output for tooling
cat .pictl/otel-coverage.json | jq '.by_package.config.missing[]'
```

### 2. Pick a Package
Start with smaller packages:
- `@pictl/observability` (48 functions) — owns Instrumentation API
- `@pictl/ml` (19 functions) — contained ML analysis
- `@pictl/kernel` (37 functions) — algorithm registry

### 3. Add Spans to Package
1. Open each file in the package
2. For each `export function` or `export const`:
   - Add Instrumentation call
   - Verify scanner recognizes it
3. Run linter: `npm run lint -- --fix`
4. Run scanner: `./scripts/verify-otel-coverage.sh`
5. Commit with message:
   ```
   feat(observability): add OTEL spans to X module
   
   Instrumented 12 public functions in packages/observability/src/
   Coverage: observability 0% → 25% (12/48)
   ```

---

## Step-by-Step Example: Instrumenting `packages/config/src/hash.ts`

**Current state:**
```typescript
export function hashConfig(config: Config): string {
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function verifyConfigHash(config: Config, hash: string): boolean {
  return hashConfig(config) === hash;
}
```

**After instrumentation:**
```typescript
import { Instrumentation, RequiredOtelAttributes } from '@pictl/observability';

export function hashConfig(
  config: Config,
  requiredAttrs?: RequiredOtelAttributes
): string {
  // Create span
  const traceId = requiredAttrs?.['trace.id'] || 'unknown';
  const { event, otelEvent } = Instrumentation.createSpan(
    traceId,
    'hashConfig',
    requiredAttrs || {
      'service.name': 'pictl',
      'run.id': 'cli',
      'trace.id': traceId,
      'span.id': Instrumentation.generateSpanId(),
    }
  );

  try {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(config))
      .digest('hex');
    return hash;
  } catch (error) {
    // Emit error span
    Instrumentation.createErrorEvent(
      traceId,
      'HASH_ERROR',
      String(error),
      'error',
      requiredAttrs || {}
    );
    throw error;
  }
}

export function verifyConfigHash(
  config: Config,
  hash: string,
  requiredAttrs?: RequiredOtelAttributes
): boolean {
  const traceId = requiredAttrs?.['trace.id'] || 'unknown';
  
  // Track verification as a check
  const { event, otelEvent } = Instrumentation.createProgressEvent(
    traceId,
    100, // Verification is instant
    requiredAttrs || {
      'service.name': 'pictl',
      'run.id': 'cli',
      'trace.id': traceId,
      'span.id': Instrumentation.generateSpanId(),
    },
    { message: `Verifying config hash: ${hash.substring(0, 8)}...` }
  );

  return hashConfig(config, requiredAttrs) === hash;
}
```

**Test with scanner:**
```bash
./scripts/verify-otel-coverage.sh

# Output:
# ✅ config: 2/37 (5%)  ← improvement!
```

---

## Instrumentation Patterns by Function Type

### Pattern A: Sync Utility Function
```typescript
export function compute(input: Data): Result {
  const { event, otelEvent } = Instrumentation.createProgressEvent(
    traceId,
    50,
    requiredAttrs,
    { message: 'Computing...' }
  );
  
  // ... implementation
  return result;
}
```

### Pattern B: Async Operation
```typescript
export async function process(data: Data, requiredAttrs: RequiredOtelAttributes) {
  const { event, otelEvent } = Instrumentation.createAlgorithmStartedEvent(
    requiredAttrs['trace.id'],
    'process_algorithm',
    requiredAttrs
  );

  try {
    const result = await asyncWork(data);
    
    // Emit completion
    Instrumentation.createAlgorithmCompletedEvent(
      requiredAttrs['trace.id'],
      otelEvent.span_id,
      'process_algorithm',
      'OK',
      requiredAttrs
    );
    
    return result;
  } catch (error) {
    Instrumentation.createAlgorithmCompletedEvent(
      requiredAttrs['trace.id'],
      otelEvent.span_id,
      'process_algorithm',
      'ERROR',
      requiredAttrs,
      { errorCode: error.code, errorMessage: error.message }
    );
    throw error;
  }
}
```

### Pattern C: State Transition
```typescript
export function transition(
  fromState: EngineState,
  toState: EngineState,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createStateChangeEvent(
    requiredAttrs['trace.id'],
    fromState,
    toState,
    requiredAttrs,
    { reason: 'planning_complete' }
  );
  
  // ... implementation
  return event;
}
```

### Pattern D: ML Operation
```typescript
export function trainModel(
  data: TrainingData,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createMlAnalysisEvent(
    requiredAttrs['trace.id'],
    'MlModelTraining',
    'random_forest',
    'training',
    requiredAttrs,
    {
      modelType: 'random_forest',
      confidence: 0.92,
      featureCount: data.features.length,
    }
  );
  
  // ... implementation
  return model;
}
```

### Pattern E: Source/Sink I/O
```typescript
export async function readLog(
  filepath: string,
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createSourceStartedEvent(
    requiredAttrs['trace.id'],
    'file',
    requiredAttrs
  );

  try {
    const data = await fs.promises.readFile(filepath, 'utf-8');
    
    Instrumentation.createSourceCompletedEvent(
      requiredAttrs['trace.id'],
      otelEvent.span_id,
      'file',
      'OK',
      requiredAttrs,
      { recordCount: data.split('\n').length }
    );
    
    return data;
  } catch (error) {
    Instrumentation.createSourceCompletedEvent(
      requiredAttrs['trace.id'],
      otelEvent.span_id,
      'file',
      'ERROR',
      requiredAttrs,
      { errorCode: 'READ_FAILED', errorMessage: error.message }
    );
    throw error;
  }
}
```

---

## Priority Order for Instrumentation

### Phase 1: Foundation (80 functions)
1. **@pictl/observability** (48 functions)
   - Rationale: Owns Instrumentation API; must be 100% instrumented
   - Impact: Enables all other packages

2. **@pictl/contracts** (102 functions)
   - Rationale: Shared types; high reuse
   - Impact: Shared contract compliance

### Phase 2: Core Engines (100+ functions)
3. **@pictl/engine** (81 functions)
   - Rationale: State machine; critical path
   - Impact: Observability of engine lifecycle

4. **@pictl/kernel** (37 functions)
   - Rationale: Algorithm orchestration
   - Impact: Visibility into algorithm execution

### Phase 3: Analysis & Planning (46 functions)
5. **@pictl/ml** (19 functions)
   - Rationale: ML analysis; contained scope
   - Impact: ML operation tracing

6. **@pictl/planner** (27 functions)
   - Rationale: Execution planning
   - Impact: Plan generation observability

### Phase 4: Utilities (245 functions)
7. **@pictl/swarm** (29 functions)
   - Rationale: Multi-worker coordination
   - Impact: Distributed execution tracing

8. **@pictl/testing** (216 functions)
   - Rationale: Test infrastructure; less critical
   - Impact: Test execution transparency

---

## Making the Spans Mergeable

### Checklist Before Committing

- [ ] Each `export function` has Instrumentation call
- [ ] Each `export const` (if callable) has Instrumentation call
- [ ] Correct event type used (state/algorithm/error/progress/ml/io)
- [ ] All required OTEL attributes populated:
  - `'service.name': 'pictl'`
  - `'run.id'` — unique execution ID
  - `'trace.id'` — distributed trace ID
  - `'span.id'` — unique span ID
- [ ] Errors emit error spans with:
  - `status: 'ERROR'`
  - `errorCode`: semantic error code
  - `errorMessage`: human-readable message
- [ ] Nested spans have `parent_span_id` set
- [ ] No `requiredAttrs` passed as undefined — provide defaults

### Run Verification Before Push

```bash
# 1. Lint check
npm run lint -- --fix

# 2. Coverage scan
./scripts/verify-otel-coverage.sh --verbose

# 3. Unit tests (ensure spans don't break tests)
npm test

# 4. Pre-commit hook (catches missing spans)
git add packages/config/src/
git commit -m "feat(config): add OTEL spans to hash module"
```

### Commit Message Format

```
feat(config): add OTEL spans to hash module

Instrumented 7 public functions:
- hashConfig()
- verifyConfigHash()
- fingerprintConfig()
- hashConfigSection()
- diffConfigs()
- computeChecksum()
- validateIntegrity()

Coverage improvement:
- config: 0% → 18% (7/37)
- overall: 0% → 1% (7/596)

All spans use Instrumentation.createProgressEvent for simple 
I/O operations and Instrumentation.createErrorEvent for error 
handling per semantic convention standards.

Refs: .claude/OTEL_COVERAGE.md
```

---

## Handling Special Cases

### Case 1: Functions Without Context (CLI entry points)
These often lack requiredAttrs. Provide defaults:

```typescript
export function main(argv: string[]) {
  const traceId = process.env.TRACE_ID || generateTraceId();
  const requiredAttrs = {
    'service.name': 'pictl',
    'run.id': process.env.RUN_ID || 'cli',
    'trace.id': traceId,
    'span.id': generateSpanId(),
  };

  const { event, otelEvent } = Instrumentation.createProgressEvent(
    traceId,
    0,
    requiredAttrs,
    { message: 'Starting CLI' }
  );

  // ... CLI logic
}
```

### Case 2: Private Functions (Already Excluded)
No span required — ESLint allows:

```typescript
function _internalHelper() {
  // Internal helpers don't need spans
}

export function publicAPI() {
  const span = Instrumentation.createProgressEvent(...);
  return _internalHelper(); // No span needed
}
```

### Case 3: Recursive Functions
Emit span at entry point only:

```typescript
export function traverse(node: TreeNode, requiredAttrs: RequiredOtelAttributes) {
  const { event, otelEvent } = Instrumentation.createProgressEvent(
    requiredAttrs['trace.id'],
    0,
    requiredAttrs,
    { message: `Traversing tree at node ${node.id}` }
  );

  return traverseRecursive(node);
}

function traverseRecursive(node: TreeNode): void {
  // No span here — already in parent
  if (node.left) traverseRecursive(node.left);
  if (node.right) traverseRecursive(node.right);
}
```

### Case 4: Generator Functions
Span at function entry:

```typescript
export function* generateConfigs(
  templates: Template[],
  requiredAttrs: RequiredOtelAttributes
) {
  const { event, otelEvent } = Instrumentation.createProgressEvent(
    requiredAttrs['trace.id'],
    0,
    requiredAttrs,
    { message: `Generating configs from ${templates.length} templates` }
  );

  for (const template of templates) {
    yield applyTemplate(template);
  }
}
```

---

## Testing Span Instrumentation

### Unit Test Example
```typescript
import { Instrumentation } from '@pictl/observability';

describe('hashConfig', () => {
  it('should emit progress event', () => {
    const requiredAttrs = {
      'service.name': 'pictl',
      'run.id': 'test',
      'trace.id': 'test-trace',
      'span.id': 'test-span',
    };

    // Mock or capture Instrumentation calls
    jest.spyOn(Instrumentation, 'createProgressEvent');

    const config = { key: 'value' };
    const result = hashConfig(config, requiredAttrs);

    expect(Instrumentation.createProgressEvent).toHaveBeenCalled();
    expect(result).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
  });
});
```

### Integration Test Example
```typescript
import { OtelCapture } from '@pictl/testing';

describe('hashConfig integration', () => {
  it('should emit OTEL span during hashing', async () => {
    const capture = createOtelCapture();
    
    const requiredAttrs = {
      'service.name': 'pictl',
      'run.id': capture.runId,
      'trace.id': capture.traceId,
      'span.id': generateSpanId(),
    };

    const config = { key: 'value' };
    const result = hashConfig(config, requiredAttrs);

    const spans = capture.exportedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('hashConfig');
    expect(spans[0].attributes['service.name']).toBe('pictl');
  });
});
```

---

## Monitoring Progress

Track instrumentation progress:

```bash
# Daily check
./scripts/verify-otel-coverage.sh

# Watch it grow
watch -n 5 './scripts/verify-otel-coverage.sh --threshold=100'

# Export to CSV
jq -r '.by_package | to_entries[] | [.key, .value.instrumented, .value.total] | @csv' .pictl/otel-coverage.json
```

**Target milestones:**
- Week 1: 10% (60 functions) ← foundation packages
- Week 2: 25% (150 functions) ← core engines
- Week 3: 50% (300 functions) ← analysis & planning
- Week 4: 75% (450 functions) ← utilities
- Week 5: 100% (596 functions) ← all functions

---

## Troubleshooting

### Scanner reports 0 functions in a file I just edited
**Cause:** Scanner only detects `export function` and `export const` patterns.

**Fix:** Check syntax:
```typescript
// ✅ Recognized
export function foo() {}
export const bar = () => {}

// ❌ Not recognized (missing export)
function foo() {}
const bar = () => {}

// ❌ Not recognized (type/interface)
export type Foo = {}
export interface Bar {}
```

### ESLint rule not triggering
**Cause:** Rule configured as `warn`, not `error`. Pre-commit hook may be disabled.

**Fix:**
```bash
# Check hook is installed
ls -la .git/hooks/pre-commit

# Verify config
grep -A 2 'pictl-observability' .eslintrc.cjs

# Manually run linter
npm run lint -- packages/config/src/
```

### Span not appearing in OTEL export
**Cause:** Instrumentation call exists but span not emitted to OTEL collector.

**Fix:**
```typescript
// Make sure you're using the Instrumentation API correctly
const { event, otelEvent } = Instrumentation.createProgressEvent(...);
// otelEvent contains the actual OTEL span to export
```

---

## References

- OTEL Specification: https://opentelemetry.io/docs/specs/protocol/
- pictl Observability API: `packages/observability/src/instrumentation.ts`
- Coverage Dashboard: `.pictl/otel-coverage.md`
- Coverage JSON: `.pictl/otel-coverage.json`
- Enforcement Rules: `.claude/OTEL_COVERAGE.md`

---

**Version:** 1.0  
**Last Updated:** 2026-04-12  
**Status:** Active Rollout
