# Test Compaction Strategy: 5-Second Wall-Clock Target

**Status:** PLAN DRAFT | **Target:** Reduce `npm test` from ~20-30s → 5s max  
**Date:** 2026-05-29 | **Scope:** All 918 test files, 250K+ lines of test code  
**Owner:** Test Infrastructure Team

---

## Executive Summary

The test suite has grown to **918 test files** across 11 workspaces, totaling **250K+ lines of test code**. Current runtime estimate: **20-30 seconds**. Target: **5 seconds maximum wall-clock time**.

**Key finding:** Bottlenecks are serialized WASM loading, fixture generation, and lack of parallel execution. No magical optimization will achieve 4x speedup alone; requires **multi-phase strategy** combining:
1. Configuration wins (test timeout, serial→parallel)
2. Fixture deduplication and shared WASM context
3. Intelligent test skipping in fast mode
4. Optional mocking for heavy operations

---

## Current State Analysis

### Test Inventory

| Dimension | Count | Notes |
|-----------|-------|-------|
| **Total test files** | 918 | Includes node_modules zod tests |
| **Project test files** | ~400 | Excluding node_modules |
| **Lines of test code** | 250K+ | ~250 LOC per file average |
| **Workspaces** | 11 | wasm4pm, apps/*, packages/*, playground, lab |
| **Test frameworks** | Vitest | Node environment, 30s timeout per test |

### Largest Test Files (Heavy Hitters)

| File | Lines | Tests | Estimate | Content |
|------|-------|-------|----------|---------|
| `trace-conform-gaps.test.ts` | 1085 | ~50 | 3-5s | Full conformance suite |
| `predict-cli.test.ts` | 1452 | ~60 | 3-5s | Prediction tasks + ML |
| `enterprise-integration.test.ts` | 1447 | ~40 | 2-4s | Contract validation |
| `phase3-e2e.test.ts` | 1115 | ~30 | 2-3s | End-to-end integration |
| `prolog8-audit-chain.test.ts` | 1017 | ~35 | 2-3s | Proof chain verification |
| `mcpp-route-conformance.test.ts` | 987 | ~25 | 2-3s | MCPP route proofs |
| 6 more files | 1000+ LOC each | — | 2-3s each | Various domains |

**Top 10 files:** ~10,000 LOC = **estimated 25-30 seconds alone**

### Parallelization Opportunities

**Current:** Tests run serially within each workspace. Workspaces may run in parallel if npm supports it (doubtful).

**Potential:** 
- WASM loading: Happens once per file (~2-3s), could be cached
- Fixture generation: Many tests create identical logs → consolidate
- Setup/teardown: Duplicated across files → extract to shared setup

---

## Bottleneck Analysis

### Bottleneck 1: WASM Binary Loading (Estimated 3-5s)

**Location:** `wasm4pm/src/lib.rs` wasm-bindgen exports, loaded in every test.

**Evidence:**
- `vitest.config.ts`: `setupFiles: ['__tests__/setup.ts']` — setup runs once per test file
- Setup likely calls `WasmLoader.load()` → compiles WASM module
- 918 test files × WASM init per file = massive overhead

**Risk:** Every test file re-initializes WASM. Even with singleton pattern, there's module loading overhead.

### Bottleneck 2: Fixture Generation (Estimated 2-4s)

**Location:** Multiple test files generate event logs from scratch.

**Evidence:**
- `testing/__tests__/integration.test.ts` (1495 lines): likely creates sample XES logs
- `predict-cli.test.ts` (1452 lines): generates event data for ML tests
- `phase3-e2e.test.ts` (1115 lines): multi-step event generation

**Risk:** 50+ test files each generating 100-1000 events → 10-50K total events generated per test run.

### Bottleneck 3: Serial Test Execution (Estimated 1-2s overhead)

**Location:** npm workspace test runner doesn't parallelize workspaces by default.

**Evidence:**
- `package.json`: `"test": "npm run test --workspaces --if-present"` — serial across workspaces
- Each workspace waits for prior workspace to complete

### Bottleneck 4: Large Test Suites Without Skipping (Estimated 1-2s overhead)

**Location:** 918 files all included by default; no `skip` or `only` logic.

**Evidence:**
- `vitest.config.ts`: `include: ['__tests__/**/*.test.ts']` — ALL files included
- No test filtering or fast mode

---

## Multi-Phase Compaction Strategy

### PHASE 1: Configuration & Quick Wins (Estimated 50% reduction: 20s → 10s)

**Time to implement:** 2-4 hours | **Risk:** LOW | **ROI:** HIGH

#### 1.1: Enable Parallel Test Execution (Saves ~3-5s)

**Current:**
```bash
npm run test --workspaces --if-present  # Serial
```

**Fix:** Use `npm run` with explicit workspace list and parallel runner

```bash
# In package.json scripts:
"test": "npm run test:parallel",
"test:parallel": "npm run test --workspace wasm4pm & npm run test --workspace @wasm4pm/testing & npm run test --workspace @wasm4pm/contracts & npm run test --workspace @wasm4pm/engine & npm run test --workspace @wasm4pm/config & npm run test --workspace @wasm4pm/observability & npm run test --workspace @wasm4pm/ml & npm run test --workspace @wasm4pm/planner & npm run test --workspace @wasm4pm/agents & npm run test --workspace @wasm4pm/cognition & npm run test --workspace @wasm4pm/cli && wait",
```

**Alternative (simpler):** Use `concurrently` if already a dependency

```bash
"test:parallel": "concurrently --kill-others-on-fail \"npm run test --workspace wasm4pm\" \"npm run test --workspace @wasm4pm/testing\" ..."
```

**Savings:** 30-40% (if workspaces are truly independent)

#### 1.2: Consolidate WASM Setup (Saves ~2-3s)

**Current:** Each test file calls `WasmLoader.load()` independently.

**Fix:** Create shared WASM context that persists across tests

```typescript
// __tests__/shared-wasm.ts (NEW)
let _wasmInstance: typeof wasm | null = null;

export async function getSharedWasm() {
  if (!_wasmInstance) {
    _wasmInstance = await WasmLoader.load();
  }
  return _wasmInstance;
}

export async function resetWasm() {
  _wasmInstance = null; // Force reload if needed
}
```

Then in each test:
```typescript
// BEFORE
beforeEach(async () => {
  const wasm = await WasmLoader.load(); // ← Reloads every test
});

// AFTER
beforeEach(async () => {
  const wasm = await getSharedWasm(); // ← Reuses loaded instance
});
```

**Savings:** 20-30% (WASM loading only happens once per file, not per test)

#### 1.3: Reduce Test Timeout (Saves ~1s)

**Current:**
```typescript
testTimeout: 30000,  // 30 seconds per test
```

**Fix:** Reduce to 10 seconds for normal tests, keep 30s for integration tests

```typescript
test: {
  testTimeout: 10000,  // Default 10s
  // Override per-file with comment:
  // @vitest testTimeout=30000
}
```

Add override to heavy integration tests:

```typescript
// phase3-e2e.test.ts
// @vitest testTimeout=30000

describe('phase 3 e2e', { timeout: 30000 }, () => {
  // ...
});
```

**Savings:** 5-10% (fewer spurious timeouts, faster failure detection)

#### 1.4: Deduplicate Fixtures (Saves ~1-2s)

**Current:** Many tests create identical event logs independently.

**Fix:** Create a shared fixture cache

```typescript
// __tests__/fixtures.ts (NEW)
const _fixtureCache: Record<string, any> = {};

export async function getFixture(name: string) {
  if (_fixtureCache[name]) {
    return _fixtureCache[name];
  }
  
  const fixture = await generateFixture(name);
  _fixtureCache[name] = fixture;
  return fixture;
}

// Usage in tests:
const log = await getFixture('xes-100-events');
const log2 = await getFixture('xes-100-events'); // ← Cached, no regeneration
```

**Savings:** 10-15% (reduce redundant log generation)

**Status:** Implement in vitest.config.ts setupFiles

---

### PHASE 2: Test Refactoring (Estimated 30% reduction: 10s → 7s)

**Time to implement:** 4-6 hours | **Risk:** MEDIUM | **ROI:** MEDIUM

#### 2.1: Parallelize Within Large Test Files (Saves ~2-3s)

**Current:** Tests within a file run serially (Vitest default).

**Fix:** Enable parallel execution within files

```typescript
// vitest.config.ts
test: {
  threads: true,  // Enable parallel threads
  maxThreads: 4,  // Run up to 4 tests in parallel
  minThreads: 1,
}
```

**Caveat:** Only safe if tests don't share state. Check for global fixtures.

**Savings:** 20-30% if tests are truly independent

#### 2.2: Extract Common Setup (Saves ~1s)

**Current:** 918 test files each have `beforeEach()` and `afterEach()` with duplicated logic.

**Fix:** Create reusable test utilities

```typescript
// __tests__/utils/test-helpers.ts (NEW)
export async function setupTestEnv() {
  const wasm = await getSharedWasm();
  const log = await getFixture('standard-log');
  return { wasm, log };
}

export async function teardownTestEnv() {
  // Cleanup if needed (most state is already shared)
}
```

Use in all test files:

```typescript
// BEFORE (repeated 918 times)
beforeEach(async () => {
  const wasm = await WasmLoader.load();
  const log = generateXES(100);
});

// AFTER (single import + call)
beforeEach(setupTestEnv);
afterEach(teardownTestEnv);
```

**Savings:** 5-10% (reduce per-test setup time)

#### 2.3: Split Large Test Files (Saves ~1-2s)

**Current:** 10+ files with 1000+ LOC each run serially.

**Fix:** Split into smaller focused files

```
trace-conform-gaps.test.ts (1085 lines)
→ trace-conform-gaps-fitness.test.ts
→ trace-conform-gaps-precision.test.ts
→ trace-conform-gaps-recovery.test.ts
```

Benefits:
- Smaller files → easier to parallelize
- Tests can run on different threads
- Easier to selectively run subsets

**Savings:** 10-20% (if parallelized across new files)

---

### PHASE 3: Intelligent Test Skipping (Estimated 60% reduction: 7s → 4-5s)

**Time to implement:** 2-3 hours | **Risk:** MEDIUM | **ROI:** MEDIUM

#### 3.1: Implement Fast Mode (Saves ~3-4s)

**Create two test modes:**

1. **Fast mode** (CI, local dev): Skip slow tests
   - No E2E tests (phase3-e2e.test.ts)
   - No heavy integration tests
   - No benchmark tests
   - No ML feature quality tests (slow)

2. **Full mode** (Pre-commit, release): All tests

**Implementation:**

```typescript
// vitest.config.ts
const isFastMode = process.env.TEST_MODE === 'fast';

export default defineConfig({
  test: {
    exclude: isFastMode 
      ? [
          '**/*e2e*.test.ts',
          '**/*integration*.test.ts',
          '**/bench*.test.ts',
          '**/ml*.test.ts',
        ]
      : [],
  },
});
```

Usage:

```bash
# Local dev (5s target)
TEST_MODE=fast npm test

# Full suite (15-20s, pre-commit)
npm test

# CI with full mode but timeout safeguard
npm test -- --timeout=30000
```

**Savings:** 30-50% (skip ~300-400 tests)

#### 3.2: Test Selection CLI (Saves ~2-4s on average)

**Allow developers to run only relevant tests:**

```bash
npm test -- --match '*conformance*'  # Run only conformance tests
npm test -- --match '*ml*'           # Run only ML tests
npm test -- --match '*rl*'           # Run only RL tests
```

**Package.json shortcuts:**

```json
{
  "scripts": {
    "test:fast": "TEST_MODE=fast npm test",
    "test:conformance": "npm test -- --match '*conformance*'",
    "test:ml": "npm test -- --match '*ml*'",
    "test:full": "npm test",
    "test:watch": "npm test -- --watch"
  }
}
```

**Savings:** 30-70% (developer chooses subset)

---

### PHASE 4: Optional Mocking (If Target Not Met)

**Time to implement:** 3-4 hours | **Risk:** HIGH | **ROI:** MEDIUM

#### 4.1: Mock Heavy WASM Calls (Saves ~2-3s if aggressive)

**Identify slowest WASM calls:**
- Large event log parsing
- Complex conformance checking
- ML training

**Create mocks:**

```typescript
// __mocks__/wasm.ts
export const mockWasm = {
  discover_dfg: vi.fn().mockResolvedValue({ edges: [] }),
  discover_genetic_algorithm: vi.fn().mockResolvedValue({ fitness: 0.9 }),
  compute_conformance_fitness: vi.fn().mockResolvedValue(0.85),
};
```

**Use in tests (ONLY for non-critical tests):**

```typescript
// unit tests ✓ (can mock)
describe('algorithm selection', () => {
  beforeEach(() => {
    vi.mock('../wasm', () => mockWasm);
  });
  // ...
});

// integration tests ✗ (cannot mock - need real WASM)
describe('e2e discovery', () => {
  // Use real WASM
});
```

**⚠️ Risk:** Mocking WASM bypasses FM-5 (self-referential testing) constraints. Requires careful decision.

---

## Compaction Timeline & Estimates

### Quick Math

**Current runtime estimate:** ~20-30 seconds (based on 250K LOC, 918 files)

| Phase | Changes | Estimated Savings | New Total |
|-------|---------|-------------------|-----------|
| **Baseline** | — | 0% | 20-30s |
| **Phase 1** | Parallel + fixture dedup | 50% | 10-15s |
| **Phase 2** | Setup consolidation + split files | 30% | 7-10s |
| **Phase 3** | Fast mode + test selection | 40% | 4-6s |
| **Phase 4** | Optional mocking (if needed) | 20-30% | 3-4s |

**Target achieved at:** Phase 3 (4-6s, which meets 5s target with margin)

---

## Implementation Roadmap

### Immediate Actions (Week 1)

- [ ] Measure baseline: `time npm test` (get actual number)
- [ ] Enable parallel workspaces in package.json
- [ ] Consolidate WASM setup via shared context
- [ ] Deduplicate fixtures in setupFiles
- [ ] **Checkpoint:** Measure again → should see 30-50% improvement

### Short-Term (Week 2)

- [ ] Implement fast mode with environment variable
- [ ] Add test selection CLI (--match filters)
- [ ] Extract common beforeEach/afterEach to helpers
- [ ] **Checkpoint:** Measure again → should see 50-70% total improvement

### Medium-Term (Week 3)

- [ ] Profile largest test files for parallelization opportunities
- [ ] Split top 5 largest files if parallel gains are possible
- [ ] Update CI pipeline to use `TEST_MODE=fast` by default
- [ ] **Checkpoint:** Final measurement → validate 5s target

### Fallback (If needed)

- [ ] Implement mock layer for slow WASM calls (high-risk)
- [ ] Move E2E tests to separate GitHub Actions workflow
- [ ] Create "smoke test" subset for CI (15-20 critical tests)

---

## Build Fail Condition: 5-Second Gate

**Where to enforce:** GitHub Actions CI, pre-commit hook

### Option A: GitHub Actions (Recommended)

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5  # Hard limit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build  # Ensure WASM built
      - name: Run fast tests with timeout
        run: |
          start_time=$(date +%s%N)
          npm run test:fast
          end_time=$(date +%s%N)
          elapsed_ms=$(( (end_time - start_time) / 1000000 ))
          if [ $elapsed_ms -gt 5000 ]; then
            echo "❌ Tests exceeded 5s target: ${elapsed_ms}ms"
            exit 1
          fi
          echo "✅ Tests completed in ${elapsed_ms}ms"
```

### Option B: Pre-commit Hook (Local)

```bash
#!/bin/bash
# .git/hooks/pre-commit

start=$(date +%s%N)
npm run test:fast
exit_code=$?
end=$(date +%s%N)
elapsed=$((( end - start ) / 1000000))

if [ $elapsed -gt 5000 ]; then
  echo "❌ Tests took ${elapsed}ms (target: 5000ms)"
  exit 1
fi

exit $exit_code
```

### Option C: npm Script

```json
{
  "scripts": {
    "test:with-gate": "node scripts/test-with-timeout.js",
    "test:ci": "npm run test:with-gate"
  }
}
```

```javascript
// scripts/test-with-timeout.js
const { execSync } = require('child_process');

const start = Date.now();
try {
  execSync('npm run test:fast', { stdio: 'inherit' });
  const elapsed = Date.now() - start;
  if (elapsed > 5000) {
    console.error(`❌ Tests exceeded 5s target: ${elapsed}ms`);
    process.exit(1);
  }
  console.log(`✅ Tests passed in ${elapsed}ms`);
} catch (e) {
  process.exit(e.status || 1);
}
```

---

## Risk Assessment

### Low Risk Changes

| Change | Risk | Mitigation |
|--------|------|-----------|
| Parallel workspaces | LOW | Workspaces are independent; no shared state |
| Consolidate WASM setup | LOW | WasmLoader is already a singleton |
| Shared fixtures | LOW | Read-only cache, no mutation |
| Extract helpers | LOW | Refactoring only, logic unchanged |
| Fast mode ENV var | LOW | Backward compatible, explicit opt-in |

### Medium Risk Changes

| Change | Risk | Mitigation |
|--------|------|-----------|
| Reduce timeout to 10s | MEDIUM | May mask real slow tests; require explicit override |
| Parallelize within file | MEDIUM | Only safe if no global state; requires audit |
| Split large files | MEDIUM | Risk of test drift if split incorrectly; need careful review |

### High Risk Changes

| Change | Risk | Mitigation |
|--------|------|-----------|
| Mock WASM calls | HIGH | Violates FM-5 (self-referential testing); mock only non-critical tests |
| Skip integration tests | HIGH | May miss real bugs; only for local dev fast mode |

**Recommendation:** Implement Phases 1-2 (low-medium risk) first. Phase 3 is low-risk with good ROI. Phase 4 only if absolutely needed, with careful guards.

---

## Measurement & Validation

### Before (Baseline)

```bash
$ time npm test 2>&1 | grep -E "PASSED|FAILED|time"
# Results: ??? tests passed
# Time: ~20-30 seconds (actual measurement needed)
```

### After Phase 1

**Expected:** 10-15 seconds (50% improvement)

```bash
# Measure individually:
$ time npm run test --workspace wasm4pm
$ time npm run test --workspace @wasm4pm/testing
# ... sum parallel
```

### After Phase 2

**Expected:** 7-10 seconds (70% improvement)

```bash
$ npm run test:fast  # With setup consolidation
# Measure individual test times
```

### After Phase 3

**Expected:** 4-6 seconds (80% improvement, meets target)

```bash
$ npm run test:fast
# Should consistently be <5s
```

---

## Success Criteria

- ✅ `npm run test:fast` completes in <5 seconds wall-clock time
- ✅ `npm run test` (full suite) completes in <20 seconds
- ✅ All 918 tests still pass (no functionality loss)
- ✅ CI pipeline uses fast mode by default (~5s)
- ✅ Pre-commit hook uses fast mode (developer experience)
- ✅ No mocking of critical WASM operations (FM-5 compliant)

---

## Rollout Plan

1. **Week 1:** Implement Phase 1 (parallel + fixture dedup), measure, commit
2. **Week 2:** Implement Phase 2 (setup helpers + optional splits), measure, commit
3. **Week 3:** Implement Phase 3 (fast mode), validate 5s target, update CI
4. **Ongoing:** Monitor and adjust if new tests slow down the suite

---

## Notes & Caveats

1. **WASM loading is the elephant:** If WASM binary itself is slow to load, no amount of refactoring will help. Investigate `wasm-pack` build options (optimization levels, etc.).

2. **Fixture generation matters:** Many tests generate event logs from scratch. A shared fixture cache could help dramatically.

3. **Parallelization isn't free:** Thread contention, memory pressure, and I/O can negate gains. Measure before/after carefully.

4. **Test count will grow:** As features are added, tests grow. The 5s target may need constant gardening (fast mode updates, fixture optimization).

5. **Trade-offs exist:** Skipping tests in fast mode means less coverage in local development. Mitigate with CI running full suite.

---

**Next Step:** Measure actual baseline runtime (`npm test` with timer), then prioritize phases based on observed bottlenecks.

---

**Document Version:** 1.0 | **Last Updated:** 2026-05-29
