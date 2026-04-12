# Gemba Enforcement: Test Purity Standards

**Document:** Gemba enforcement rules for pictl
**Updated:** 2026-04-11
**Status:** Active (blocking commits)

## Purpose

Enforce the Gemba principle: "Go to the actual place where work happens." Integration tests must test against **real WASM, real APIs, real systems** — not mocks or stubs. This prevents the "happy path test syndrome" where tests pass in sandbox but fail in production.

## Categories

### Integration Tests (Must Be Pure)
**Patterns:** `**/*.integration.test.ts`, `**/__tests__/integration/*.test.ts`

Requirements:
- ✅ Use real WASM kernel
- ✅ Use real file I/O
- ✅ Use real HTTP APIs (or network-level testing)
- ❌ NO `vi.mock()`, `vi.stub()`, `vi.stubGlobal()`
- ❌ NO `jest.mock()`, `jest.spyOn().mockImplementation()`
- ❌ NO `sinon.stub()`, `td.replace()`
- ❌ NO `.mockReturnValue()`, `.mockResolvedValue()`, `.returns()`

Examples: `wasm4pm/__tests__/integration/phase3-e2e.test.ts`, `packages/testing/__tests__/integration/e2e-run.test.ts`

### E2E Tests (Must Be Pure)
**Patterns:** `**/*.e2e.test.ts`

Same requirements as integration tests. These are end-to-end tests exercising the full system.

### Unit Tests (Mocks Allowed)
**Patterns:** `**/*.unit.test.ts`, `**/*.spec.ts`, `packages/*/src/**/*.test.ts`

Mocks are allowed and encouraged for unit tests:
- ✅ Use `vi.mock()`, `vi.spyOn()`, `.mockReturnValue()`
- ✅ Test in isolation
- ✅ Mock external dependencies (APIs, filesystems, databases)

Examples: `packages/engine/src/engine.test.ts`, `packages/observability/__tests__/fields.test.ts`

### Fixtures and Mocks Directory (Exempt)
**Pattern:** `packages/testing/src/mocks/`, `packages/testing/src/fixtures/`

These directories contain helper functions, mock factories, and fixtures. They are exempt from Gemba enforcement because they provide real test data and builders, not fake implementations.

## Enforcement Mechanism

### 1. ESLint Custom Rule
File: `packages/testing/src/eslint-rules/no-mocks-in-integration.js`

Blocks mocks in integration tests at lint time:
```bash
npm run lint  # Fails if integration tests contain mocks
```

Rule ID: `pictl-testing/no-mocks-in-integration`

### 2. Pre-commit Hook
File: `.claude/hooks/test-purity.sh`

Runs test purity checks before commits:
```bash
./.claude/hooks/test-purity.sh
# Blocks commit if integration tests have mocks
```

### 3. Validation Script
File: `scripts/validate-test-purity.mjs`

Manual validation anytime:
```bash
node scripts/validate-test-purity.mjs
# Reports test categorization and violations
```

**Exit codes:**
- `0` = All tests pure (no violations)
- `1` = Violations found (integration tests with mocks)

## Known Violations

### Status: 1 Violation Found

| File | Issue | Fix | Priority |
|---|---|---|---|
| `wasm4pm/__tests__/integration/browser.test.ts` | Uses `vi.fn()` and `.mockReturnValue()` for DOM mocking | Refactor to use real browser APIs or move to unit test as `browser.unit.test.ts` | Medium |

## How to Fix Violations

### Option 1: Remove Mocks
Replace mocks with real implementations:

**BEFORE (violates Gemba):**
```typescript
// wasm4pm/__tests__/integration/browser.test.ts
const mockDocument = {
  getElementById: vi.fn(),
};
```

**AFTER (Gemba-compliant):**
```typescript
// Test against actual browser APIs or JSDOM environment
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><div id="test"></div>');
const element = dom.window.document.getElementById('test');
```

### Option 2: Rename to Unit Test
If the test is actually unit-testing a single component with mocks, rename it:

```bash
mv wasm4pm/__tests__/integration/browser.test.ts \
   wasm4pm/__tests__/browser.unit.test.ts
```

### Option 3: Create Fixtures
Use the `@pictl/testing` module to create real test data:

```typescript
import { createMockEventLog } from '@pictl/testing';

// Real data, not mocked
const log = createMockEventLog({ traceCount: 100 });
const result = await algorithm.run(log);
```

## Running Tests

### Validate Test Purity (Recommended)
```bash
# Quick categorization report
node scripts/validate-test-purity.mjs
```

### Run Unit Tests
```bash
# Unit tests (mocks allowed)
npm run test -- --include "*.unit.test.ts"
```

### Run Integration Tests
```bash
# Integration tests (must be pure, no mocks)
npm run test -- --include "*.integration.test.ts"
npm run test -- --include "__tests__/integration"
```

### Run All Tests
```bash
npm run test
```

## CI/CD Integration

The test purity check runs in CI:

1. **Lint stage:** `npm run lint` — fails if integration tests have mocks
2. **Test stage:** `npm run test` — runs all tests
3. **Validation stage:** `node scripts/validate-test-purity.mjs` — reports purity

## Design Rationale

### Why Enforce Purity?

**Problem:** Mock tests can pass while production fails
- Test environment has mock database
- Production has real database with constraints
- Mocks hide concurrency issues, network errors, data validation bugs

**Solution:** Integration tests must be real
- Uses actual WASM kernel
- Uses actual file I/O
- Uses actual network APIs
- Defects surface during testing, not in production

### Why Allow Mocks in Unit Tests?

**Benefit:** Fast, isolated testing
- Test one component in microseconds
- No dependencies on external systems
- Clear, simple test code

**Trade-off:** Mocks don't catch integration issues
- Solution: Use both integration tests (real) and unit tests (mocked)

### Example: Testing Fetch

**Unit test (mock allowed):**
```typescript
// packages/observability/__tests__/fields.unit.test.ts
import { vi } from 'vitest';

test('handles fetch success', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: 'ok' }),
  })));

  const result = await sendMetrics();
  expect(result).toBe(true);
});
```

**Integration test (must be real):**
```typescript
// packages/observability/__tests__/fields.integration.test.ts
test('sends metrics to real OTEL endpoint', async () => {
  // Use actual fetch (no mock)
  // Connect to real OTEL collector
  const result = await sendMetrics();
  expect(result).toBe(true);
});
```

## Related Documentation

- `../CLAUDE.md` — Full rules (Evidence Standards, Verification)
- `../.claude/rules/chicago-tdd.md` — Test-driven development discipline
- `../.claude/rules/wvda-soundness.md` — Formal verification (deadlock-free, liveness)
- `packages/testing/` — Testing harnesses and helpers

## Support

Questions about test categorization? Check:
1. **Integration test?** Does it use real WASM kernel? Real file I/O?
2. **Unit test?** Testing one component in isolation?
3. **Fixture/Mock helper?** In `packages/testing/src/mocks/` or `fixtures/`?

If unsure, err on the side of "integration" and avoid mocks. Real tests catch more bugs.
