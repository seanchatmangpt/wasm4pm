# Gemba Enforcement in @pictl/testing

**Principle:** Go to where the work actually happens. Integration tests must be real.

This testing package includes Gemba enforcement rules that block mocks/stubs in integration tests.

## Overview

### What is Gemba?

Gemba (現場, "actual place") is a Lean manufacturing principle: decision-makers should go to where the work actually happens. In testing:

- **Real environment** = actual WASM kernel, real APIs, real file I/O
- **Sandbox environment** = mocks, stubs, in-memory fakes

Integration tests must run against real environments to catch production defects.

### Problem We're Solving

**Without Gemba enforcement:**
- Unit test mocks the fetch API → test passes
- Integration test doesn't mock fetch → test passes locally (against mock OTEL endpoint)
- Production runs real fetch against real OTEL → fails (network unreachable)

**With Gemba enforcement:**
- Integration tests must use real fetch
- Defects surface during testing, not production

## Enforcement Rules

### 1. Integration Tests (Must Be Pure — No Mocks)

**Recognized patterns:**
- `**/*.integration.test.ts`
- `**/*.e2e.test.ts`
- `**/__tests__/integration/*.test.ts`

**Blocked operations:**
- `vi.mock()` — block module mocking
- `vi.stub()` — block object/method stubbing
- `vi.stubGlobal()` — block global function stubbing
- `vi.spyOn().mockImplementation()` — block spy implementation replacement
- `jest.mock()`, `jest.spyOn()` — Jest equivalents
- `sinon.stub()` — Sinon stubs
- `td.replace()` — testdouble replacement
- `.mockReturnValue()`, `.mockResolvedValue()` — mock return chains
- `.returns()` — Sinon return chains

**What to do instead:**
```typescript
// ✅ GOOD: Use real implementations
const log = createEventLog(traceCount: 100);
const result = await discoveryAlgorithm.run(log);  // Real algorithm

// ❌ BAD: Mock the algorithm
const mockAlgorithm = {
  run: vi.fn().mockResolvedValue({ nodes: [] })
};
```

### 2. Unit Tests (Mocks Allowed)

**Recognized patterns:**
- `**/*.unit.test.ts`
- `**/*.spec.ts`
- Any test file not matching integration/e2e patterns

**Mocks encouraged:**
```typescript
// ✅ OK for unit tests: Mock external dependencies
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ status: 'ok' })
});
```

### 3. Fixtures and Helpers (Exempt)

**Pattern:** `packages/testing/src/mocks/`, `packages/testing/src/fixtures/`

These directories provide:
- **Fixtures:** Real test data (XES files, OCEL logs, event traces)
- **Factories:** Helper functions to build test objects
- **Mocks:** Reusable mock implementations for tests

These are NOT subject to Gemba enforcement because they provide supporting infrastructure, not fake implementations in actual tests.

## Running Tests with Gemba Enforcement

### Validate Test Purity
```bash
# Categorize tests and report violations
node scripts/validate-test-purity.mjs
```

**Output:**
```
Validating test purity (Gemba enforcement)...

Integration Tests:
  Total: 10
  Verified (pure): 9
  Violations: 1
    - wasm4pm/__tests__/integration/browser.test.ts

✗ [FAIL] Test purity violations found: 1
```

### Lint (Check for Mocks)
```bash
# ESLint will flag mocks in integration tests
npm run lint
```

**Error:**
```
  packages/observability/__tests__/fields.test.ts
    10:5  error  Mocks not allowed in integration tests  pictl-testing/no-mocks-in-integration
```

### Pre-commit Hook
```bash
# Automatically runs before commit
./.claude/hooks/test-purity.sh
```

**If violation detected:**
```
Integration tests must use real WASM/APIs per Gemba principle.
  - wasm4pm/__tests__/integration/browser.test.ts

To fix:
  1. Extract mock/stub setup to a separate unit test file
  2. Or rename to *.unit.test.ts
  3. Or use real implementations in the integration test
```

## How to Fix Violations

### Option 1: Remove Mocks (Recommended)

Replace mocks with real implementations:

```typescript
// BEFORE: violates Gemba
test('handles fetch success', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: 'ok' }),
  })));

  const result = await sendMetrics();
  expect(result).toBe(true);
});

// AFTER: Gemba-compliant
test('sends metrics to real OTEL endpoint', async () => {
  // No stubbing — use actual fetch
  const result = await sendMetrics();  // Real network call
  expect(result).toBe(true);
});
```

### Option 2: Rename to Unit Test

If the test is actually unit-testing a single component with mocks, rename it:

```bash
# From integration:
wasm4pm/__tests__/integration/browser.test.ts

# To unit test:
wasm4pm/__tests__/browser.unit.test.ts
```

### Option 3: Split the Test Suite

Separate real and mocked tests:

```typescript
// ✅ browser.integration.test.ts (Gemba-compliant, no mocks)
test('renders in real browser environment', async () => {
  const app = await initializeApp();
  expect(app.isReady()).toBe(true);
});

// ✅ browser.unit.test.ts (mocks allowed, isolated)
test('handles DOM event with mocked listener', () => {
  const listener = vi.fn();
  element.addEventListener('click', listener);
  element.click();
  expect(listener).toHaveBeenCalled();
});
```

## API Reference

### Custom ESLint Rule: `pictl-testing/no-mocks-in-integration`

**Type:** Problem (auto-fix not available)

**Applies to:** Files matching `*.integration.test.ts`, `*.e2e.test.ts`, `__tests__/integration/**`

**Error message:**
```
Mocks not allowed in integration tests. Integration tests must use real implementations.
Move to a unit test (*.unit.test.ts or *.spec.ts) or use real APIs.
```

**Configuration:**
```javascript
// .eslintrc.cjs
{
  plugins: ['pictl-testing'],
  rules: {
    'pictl-testing/no-mocks-in-integration': 'error'
  }
}
```

### Validation Script: `validate-test-purity.mjs`

```bash
node scripts/validate-test-purity.mjs
```

**Exit codes:**
- `0` = All tests pure (no violations)
- `1` = Violations found

**Output format:**
```
Validating test purity (Gemba enforcement)...

Integration Tests:
  Total: 10
  Verified (pure): 9
  Violations: 1
    - path/to/test.ts

E2E Tests:
  Total: 5
  Verified (pure): 5
  Violations: 0

Unit Tests:
  Total: 45 (mocks allowed)

✓ [PASS] Test purity check passed
  14 integration/E2E tests verified as pure (no mocks)
```

### Pre-commit Hook: `test-purity.sh`

```bash
./.claude/hooks/test-purity.sh
```

**Runs on:** Every commit (if changed test files detected)

**Behavior:**
1. Find changed test files
2. Separate integration from unit tests
3. Check integration tests for mocks
4. Block commit if violations found

## Examples

### ✅ Gemba-Compliant Integration Test

```typescript
// packages/kernel/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest';
import { Kernel } from '@pictl/kernel';
import { MINIMAL_XES } from '@pictl/testing/fixtures';

describe('Kernel Integration', () => {
  it('discovers DFG from real event log', async () => {
    const kernel = new Kernel();
    await kernel.init();

    // Real data, real algorithm
    const result = await kernel.run('dfg', MINIMAL_XES);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(4);
  });
});
```

### ✅ Unit Test with Mocks (Allowed)

```typescript
// packages/observability/__tests__/fields.unit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sendMetrics } from '@pictl/observability';

describe('Observability (Unit)', () => {
  it('handles fetch failure gracefully', async () => {
    // Mocks OK in unit tests
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Network error');
    }));

    const result = await sendMetrics({ timeout: 100 });
    expect(result).toBe(false);
  });
});
```

### ❌ Violates Gemba (Integration with Mocks)

```typescript
// packages/kernel/__tests__/integration.test.ts — VIOLATION!
it('discovers DFG from event log', async () => {
  // ❌ WRONG: Mock the algorithm
  const mockKernel = {
    run: vi.fn().mockResolvedValue({ nodes: [], edges: [] })
  };

  const result = await mockKernel.run('dfg', log);
  expect(result.nodes).toHaveLength(0);  // False positive!
});
```

## Tips & Tricks

### Test File Naming

```
integration/               ← directory pattern (enforced)
  phase3-e2e.test.ts      ← file pattern (enforced)
  browser.unit.test.ts    ← explicit unit test (mocks allowed)
  browser.spec.ts         ← alternative pattern (mocks allowed)
```

### Polyfills vs Mocks

Polyfills for missing browser APIs are OK in integration tests (they provide real structure):

```typescript
// ✅ OK: Polyfill provides real structure
if (typeof FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    // Real implementation
  };
}

// ❌ NOT OK: Mock replaces real with fake
const mockFileReader = vi.fn();
```

### Using Fixtures in Integration Tests

```typescript
import { createEventLog, XES_MINIMAL } from '@pictl/testing/fixtures';

// ✅ Real fixtures, no mocks
test('processes log file', async () => {
  const log = createEventLog(XES_MINIMAL);
  const result = await process(log);  // Real algorithm
  expect(result).toBeDefined();
});
```

## Troubleshooting

### ESLint: "pictl-testing rule not found"

**Problem:** ESLint doesn't see the custom rule.

**Fix:**
1. Ensure `.eslintrc.cjs` has `'pictl-testing'` in plugins
2. Ensure `packages/testing/src/eslint-plugin.cjs` exists
3. Run `npm run lint -- --debug-inspect-config` to verify rule loads

### Validation Script: No tests found

**Problem:** `node scripts/validate-test-purity.mjs` reports 0 tests.

**Fix:**
```bash
# Check test file patterns match
find . -name "*.test.ts" -o -name "*.spec.ts" | head -5
```

### Pre-commit Hook: Always fails

**Problem:** `.claude/hooks/test-purity.sh` blocks all commits.

**Fix:**
1. Verify the hook script has correct file detection
2. Check for changed test files: `git diff --name-only HEAD -- '*.test.ts'`
3. Run manually: `./.claude/hooks/test-purity.sh`

## See Also

- `../../docs/GEMBA-ENFORCEMENT.md` — Comprehensive Gemba rules
- `../../CLAUDE.md` — pictl configuration and standards
- `../.claude/rules/chicago-tdd.md` — Test-first discipline
- `../.claude/rules/toyota-production.md` — Lean principles
