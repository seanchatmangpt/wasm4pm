# Gemba Enforcement — Quick Reference

**When:** Always
**What:** Integration tests must be real (no mocks)
**Why:** Catch defects during testing, not production

## Quick Check

```bash
# Is your test pure?
node scripts/validate-test-purity.mjs
```

## The Rule

| Test Type | Pattern | Mocks Allowed? |
|-----------|---------|---------------|
| **Integration** | `*.integration.test.ts` | ❌ NO |
| **Integration** | `__tests__/integration/*.test.ts` | ❌ NO |
| **E2E** | `*.e2e.test.ts` | ❌ NO |
| **Unit** | `*.unit.test.ts` | ✅ YES |
| **Unit** | `*.spec.ts` | ✅ YES |
| **Fixtures** | `*/mocks/`, `*/fixtures/` | ✅ YES |

## What's Blocked in Integration Tests

```typescript
vi.mock()               // ❌ Module mocking
vi.stub()              // ❌ Method stubbing
vi.stubGlobal()        // ❌ Global stubbing
vi.spyOn()             // ❌ Spy functions
jest.mock()            // ❌ Jest mocks
sinon.stub()           // ❌ Sinon stubs
td.replace()           // ❌ testdouble

.mockImplementation()  // ❌ Mock chains
.mockReturnValue()     // ❌ Mock chains
.returns()             // ❌ Sinon chains
```

## Quick Fixes

### Fix 1: Remove the Mock
```typescript
// BEFORE ❌
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

// AFTER ✅
// Just use real fetch (no stubbing)
```

### Fix 2: Rename to Unit Test
```bash
# From integration:
mv something.integration.test.ts something.unit.test.ts
```

### Fix 3: Split the Test
```typescript
// ✅ something.integration.test.ts (no mocks)
test('real behavior', async () => { ... });

// ✅ something.unit.test.ts (mocks OK)
test('isolated behavior with mocks', () => { ... });
```

## Validation Commands

```bash
# Validate all tests
node scripts/validate-test-purity.mjs

# Lint check (ESLint)
npm run lint

# Pre-commit hook
./.claude/hooks/test-purity.sh
```

## Failed Validation? Here's Why

```
✗ FAIL: Test purity violations found: 1
    - wasm4pm/__tests__/integration/browser.test.ts
```

**This test has mocks.** Pick a fix:

1. **Remove mocks** (recommended): Delete `vi.mock()`, `vi.stub()`, `.mockReturnValue()` calls
2. **Rename to unit**: `browser.unit.test.ts` (mocks allowed in unit tests)
3. **Use real APIs**: Replace mocks with actual implementations

## Examples

### ✅ Gemba-Compliant (Integration)
```typescript
test('processes real event log', async () => {
  const log = createRealEventLog();  // Real data
  const result = await algorithm.run(log);  // Real algorithm
  expect(result).toBeDefined();
});
```

### ✅ Allowed (Unit)
```typescript
test('handles fetch error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network')));
  const result = await sendMetrics();
  expect(result).toBe(false);  // Expect failure handling
});
```

### ❌ Violates Gemba (Integration with Mocks)
```typescript
test('processes event log', async () => {
  const mockAlgorithm = {
    run: vi.fn().mockResolvedValue({ nodes: [] })  // ❌ MOCK
  };
  const result = await mockAlgorithm.run(log);  // Not testing real behavior
  expect(result).toBeDefined();
});
```

## One-Liner Test Fixes

```bash
# Remove all vi.stub calls (careful — use with code review)
sed -i '' '/vi\.stub/d' wasm4pm/__tests__/integration/browser.test.ts

# Rename all integration tests to unit tests
find . -name "*.integration.test.ts" -exec sh -c 'mv "$1" "${1%.integration.test.ts}.unit.test.ts"' _ {} \;

# Find all mocks in integration tests
find . -path "*/integration/*.test.ts" -exec grep -l "vi\.mock\|vi\.stub\|mockReturn" {} \;
```

## Still Confused?

Real test = uses real WASM, real APIs, real file I/O
Mock test = uses vi.mock(), vi.stub(), fake data

**Integration tests must be real.** Unit tests can be mocked.

---

See `docs/GEMBA-ENFORCEMENT.md` for full documentation.
