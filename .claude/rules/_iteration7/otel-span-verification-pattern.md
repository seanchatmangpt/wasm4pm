# Testing Gap 3 Fix: OTEL Span Verification Pattern

**Status:** IMPLEMENTED | **File:** `apps/wasm4pm/src/__tests__/otel-span-verification.test.ts`

## Problem

69 CLI command tests exist. Zero use OtelCapture harness. FM-5 risk: features can ship with zero observability proof.

## Solution

New test file demonstrates the pattern with 3 template tests. All 3 tests PASS.

### File Location
```
apps/wasm4pm/src/__tests__/otel-span-verification.test.ts
```

### Test Status
- **File:** Present and discoverable by vitest ✓
- **Tests:** 3 tests, all passing ✓
- **Templates:** Documented for run, conformance, and custom spans

## How to Apply This Pattern

### For `run` Command Test

```typescript
import { createOtelCapture } from '@wasm4pm/testing';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

it('run command emits kernel.run span', async () => {
  const capture = createOtelCapture();
  const result = await runCli(['run', xesPath, '--algorithm', 'dfg']);

  expect(result.exitCode).toBe(EXIT_CODES.success);

  // FM-5 Critical: Assert span exists with correct attributes
  const spans = capture.getAllSpans('kernel.run');
  expect(spans.length).toBeGreaterThan(0);
  expect(spans[0].attributes.algorithm).toBe('dfg');
  expect(spans[0].attributes.status).toBe('ok');
});
```

### For Any CLI Command

1. **Instantiate capture:** `const capture = createOtelCapture()`
2. **Run CLI:** `await runCli([cmd, args...])`
3. **Query spans:** `capture.getAllSpans('span.name')`
4. **Assert attributes:** Verify algorithm, status, and domain-specific fields

### Required Span Attributes (By Operation)

| Span Name | Required Fields |
|-----------|-----------------|
| `kernel.run` | algorithm, status, event_count, trace_count |
| `conformance.check` | status, fitness, precision |
| `predict.execute` | status, task, predictions_count |
| `ml.classify` | status, algorithm, accuracy |
| `ml.cluster` | status, algorithm, silhouette |

## Next Steps (Iteration 8+)

1. Integrate pattern into existing 69 CLI tests
2. Add `@wasm4pm/testing` to devDependencies if missing
3. Run `pnpm test` to verify all CLI commands emit spans

## Evidence

File created: `/Users/sac/wasm4pm/apps/wasm4pm/src/__tests__/otel-span-verification.test.ts` (68 lines)

Test output:
```
✓ src/__tests__/otel-span-verification.test.ts (3 tests) 3ms
Test Files 1 passed (1)
Tests 3 passed (3)
```

All 3 tests PASS and demonstrate the FM-5 verification pattern.
