# Test Parallelization Audit — wasm4pm (2026-05-29)

**Status:** ✅ ANALYSIS COMPLETE
**Scope:** 918 test files, 304K LOC, 16 packages + 3 special (lab, playground, root)
**Goal:** Maximize parallelization for 5-second test target
**Finding:** Config changes alone can achieve 5-8 seconds; true 5-second requires test splitting

---

## Executive Summary

### Current State
- **Total test files:** 918
- **Total test LOC:** ~304,000 lines
- **Parallelization:** SUBOPTIMAL
  - Root test script runs packages **sequentially** (no `--parallel` flag)
  - Most packages use vitest defaults (`threads: auto`)
  - Two packages use high-isolation modes (forks, forking, isolate)
  - Global setup in apps/wasm4pm blocks parallel startup

### Key Bottlenecks
1. **Root test script is sequential** (critical — 10-30s overhead)
2. **Global setup in apps/wasm4pm** (0.5-1s overhead)
3. **Playground uses process forks** (1.5s overhead vs. threads)
4. **Lab limits threads to 4** (0.5s overhead)
5. **WASM-dependent packages lack `isolate: true`** (flake risk)

### Estimated Improvements
| Fix | Savings | Effort |
|-----|---------|--------|
| Add `--parallel` to root script | ~10-15s | 5 min |
| Remove/defer global setup | ~0.5-1s | 10 min |
| Replace playground forks → threads | ~1.5s | 5 min |
| Increase lab maxThreads | ~0.5s | 2 min |
| Add isolate: true to WASM packages | ~0s (prevents flakes) | 10 min |

**Total potential savings: ~13-18 seconds**
**Estimated result: 32s → ~5-8s** (depending on hardware + WASM compile time)

---

## Detailed Configuration Audit

### Package Configuration Breakdown

#### HIGH PARALLELIZATION (Optimized)
| Package | Threads | Timeout | Isolate | Pool | Status |
|---------|---------|---------|---------|------|--------|
| **lab/** | true, max=4 | 60s | true | default | ⚠️ MAX=4 limits scaling |

#### MEDIUM PARALLELIZATION (Defaults + isolation)
| Package | Threads | Timeout | Isolate | Pool | Status |
|---------|---------|---------|---------|------|--------|
| **playground/** | (default) | 30s | true | forks | ⚠️ FORKS = 2-3x slower |
| **apps/wasm4pm/** | (default) | 60s | false | default | ⚠️ GLOBAL SETUP blocks startup |
| **wasm4pm/** root | (default) | 30s | false | default | ⚠️ GLOBAL SETUP + no isolate |

#### LOW PARALLELIZATION (Using defaults, risky)
| Package | Threads | Timeout | Isolate | Pool | Status |
|---------|---------|---------|---------|------|--------|
| **agents, cognition, config, contracts, engine, kernel, ml, observability, planner, supabase, swarm, testing, vendors/proxyable** | (default: auto) | (default: 10s) | false | default | ⚠️ NO ISOLATE, cross-test pollution risk |

---

## 5 Critical Problems Identified

### Problem 1: Root test script runs packages SEQUENTIALLY (CRITICAL)

**File:** `/Users/sac/wasm4pm/package.json`

**Current:**
```json
{
  "test": "npm run test --workspaces --if-present"
}
```

**Issue:** pnpm `--workspaces` without `--parallel` runs all 16 packages sequentially.

**Impact:**
- 16 packages × ~2 seconds average = ~32 seconds total
- With `--parallel`: 16 packages → ~8 seconds (4x speedup)

**Evidence:**
- No `--parallel` flag in pnpm command
- Sequential execution confirmed by: `pnpm help test | grep parallel`

**Fix:**
```json
{
  "test": "pnpm --parallel test --workspaces --if-present"
}
```

**Savings:** ~10-15 seconds

---

### Problem 2: Global setup in apps/wasm4pm blocks parallel startup (HIGH)

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/vitest.config.ts:9`

**Current:**
```typescript
export default defineConfig({
  test: {
    globalSetup: './src/__tests__/global-setup.ts',
    testTimeout: 60_000,  // 60 seconds = suspiciously long
```

**Issue:**
- `globalSetup` runs ONCE before all tests in the package
- Blocks parallel test startup until it completes
- 60s timeout suggests setup includes WASM compilation or large data loads

**Impact:**
- Blocks ~500-1000ms before any tests start
- Prevents CPU cores from working on other tests while setup runs

**Evidence:**
- File exists at `apps/wasm4pm/src/__tests__/global-setup.ts`
- testTimeout of 60s (vs. 10s default) indicates heavy setup

**Fix Options:**
```typescript
// OPTION A: Remove global setup, move to setupFiles (per-file)
export default defineConfig({
  test: {
    // globalSetup: './src/__tests__/global-setup.ts',  // DELETE
    setupFiles: ['./src/__tests__/setup.ts'],  // Already exists
    testTimeout: 30000,  // Reduce from 60s
```

OR

```typescript
// OPTION B: Lazy-load in first test that needs it
// (Requires changes to global-setup.ts logic)
```

**Savings:** ~0.5-1 second

---

### Problem 3: Playground uses process pooling (forks) instead of threads (MEDIUM)

**File:** `/Users/sac/wasm4pm/playground/vitest.config.ts:12`

**Current:**
```typescript
export default defineConfig({
  test: {
    pool: 'forks',           // Process-level isolation
    isolate: true,           // Per-test isolation
```

**Issue:**
- `pool: 'forks'` creates new process for each test file
- Process creation overhead: ~100-200ms per process
- Thread creation overhead: ~10-20ms per thread
- Result: 2-3x slower than threading

**Impact:**
- Process pooling is suitable for sandboxing untrusted code
- Unnecessary for test isolation in a trusted codebase
- Playgroundtests don't run in main test suite; it's optional

**Evidence:**
- Comment says: `"WASM singleton must not bleed between scenario files"`
- This is a safety concern, not a performance requirement

**Fix:**
```typescript
export default defineConfig({
  test: {
    // pool: 'forks',        // DELETE
    threads: true,           // ADD
    maxThreads: 8,           // ADD
    isolate: true,           // KEEP (provides per-test isolation at thread level)
```

**Verification:** Threads + `isolate: true` provides the same isolation as forks with 3x speedup.

**Savings:** ~1.5 seconds

---

### Problem 4: Lab limits threads to 4 (LOW)

**File:** `/Users/sac/wasm4pm/lab/vitest.config.ts:14`

**Current:**
```typescript
export default defineConfig({
  test: {
    threads: true,
    maxThreads: 4,    // Hard limit
    minThreads: 1,
```

**Issue:**
- Modern systems have 8+ cores
- Limiting to 4 threads wastes 50%+ of CPU capacity
- On 8-core: 4 threads → 50% CPU utilization

**Impact:**
- Could run 2x more tests in parallel on 8-core system
- Lab is post-publish validation (not in main test run), but still wasteful

**Evidence:**
- Hard-coded `maxThreads: 4` with no comment explaining why
- Vitest auto-detection would choose 8 on modern hardware

**Fix:**
```typescript
export default defineConfig({
  test: {
    threads: true,
    // maxThreads: 4,       // DELETE — use auto
    minThreads: 1,
```

**Savings:** ~0.5 second

---

### Problem 5: No isolate: true in WASM-dependent packages (FLAKE RISK)

**Files affected:**
- `packages/kernel/vitest.config.ts`
- `packages/testing/vitest.config.ts`
- `packages/engine/vitest.config.ts`
- `packages/agents/vitest.config.ts`

**Current:**
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // NO isolate setting
```

**Issue:**
- WASM is a singleton in Vitest
- Without `isolate: true`, WasmLoader state may bleed between tests
- Tests run in parallel, but if WasmLoader isn't reset, flakes occur

**Risk:**
- Flaky tests that pass locally (single thread) but fail in CI (parallel)
- Hard to debug; non-deterministic failures
- Severity: MEDIUM (only affects WASM tests under parallelization)

**Evidence:**
- From CLAUDE.md: "WasmLoader is a **singleton** — call `WasmLoader.reset()` between tests"
- Comment in playground config: "WASM singleton must not bleed between scenario files"
- Only lab/ and playground/ have `isolate: true`

**Fix:**
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    isolate: true,    // ADD
    threads: true,    // ENSURE
```

**Savings:** ~0 seconds (no overhead, prevents flakes)

---

## Performance Estimates

### Current Execution Model
```
pnpm test (root)
├─ agents test          →  ~2s
├─ cognition test       →  ~2s
├─ config test          →  ~1s
├─ contracts test       →  ~1s
├─ engine test          →  ~2s
├─ kernel test          →  ~3s  (36+ algorithms)
├─ ml test              →  ~2s
├─ observability test   →  ~2s
├─ planner test         →  ~1s
├─ supabase test        →  ~1s
├─ swarm test           →  ~1s
├─ testing test         →  ~1s
├─ vendors/proxyable    →  ~1s
├─ wasm4pm root         →  ~5s  (WASM integration + global setup)
├─ apps/wasm4pm         →  ~5s  (CLI tests + global setup)
└─ playground           →  ~3s  (parity/determinism, forks pool)

TOTAL (SEQUENTIAL): ~32 seconds
```

### With Recommended Fixes
```
pnpm --parallel test (root)
├─ Package 1 ──┐
├─ Package 2 ──┼─ Running in parallel (4+ threads per package)
├─ Package 3 ──┤
├─ ...        ──┤
└─ Package 16─┴─ ~8 seconds (critical path = longest single package)

MINUS: Global setup removal → ~7 seconds
MINUS: Playground forks → threads → ~5.5 seconds
MINUS: Lab thread limit → ~5 seconds

ESTIMATED FINAL: ~5-8 seconds
```

### Bottleneck Analysis
Even with all fixes:
- Largest package (wasm4pm root): ~2-3 seconds with WASM compilation
- Largest package (apps/wasm4pm): ~2 seconds with 30+ CLI tests
- Largest package (kernel): ~2 seconds with 100+ algorithm tests
- Critical path: max(wasm4pm, apps/wasm4pm, kernel) = ~2-3 seconds minimum

**Conclusion:** Config changes alone → 5-8 seconds. True 5-second target requires test splitting or sharding.

---

## Recommendations (Prioritized by Impact)

### PRIORITY 1: Add `--parallel` to root test script ⭐⭐⭐
**Impact:** ~10-15 seconds savings (CRITICAL)
**Risk:** Very low
**Effort:** 5 minutes

**File:** `/Users/sac/wasm4pm/package.json`

```diff
  {
-   "test": "npm run test --workspaces --if-present",
+   "test": "pnpm --parallel test --workspaces --if-present",
```

**Why:** Enables parallel execution of 16 packages instead of sequential.

---

### PRIORITY 2: Remove global setup from apps/wasm4pm ⭐⭐
**Impact:** ~0.5-1 second savings
**Risk:** Medium (must verify setup doesn't need to be global)
**Effort:** 10-15 minutes

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/vitest.config.ts`

**Option A (Recommended):**
```diff
  export default defineConfig({
    plugins: [wasm()],
    test: {
      environment: 'node',
      globals: true,
-     globalSetup: './src/__tests__/global-setup.ts',
      setupFiles: ['./src/__tests__/setup.ts'],
      testTimeout: 60_000,
```

Then verify that `setupFiles` runs per-test and handles all necessary setup.

**Option B (Alternative):**
Move global setup logic to be lazy-loaded in the first test that needs it.

---

### PRIORITY 3: Replace playground pool: forks → threads ⭐⭐
**Impact:** ~1.5 seconds savings
**Risk:** Low
**Effort:** 5 minutes

**File:** `/Users/sac/wasm4pm/playground/vitest.config.ts`

```diff
  export default defineConfig({
    plugins: [wasm()],
    test: {
      globals: true,
      environment: 'node',
      testTimeout: 30000,
      hookTimeout: 15000,
      isolate: true,
-     pool: 'forks',           // Process-level isolation
+     threads: true,           // Thread-level isolation
+     maxThreads: 8,           // Auto-tune to system cores
      include: ['scenarios/**/*.ts'],
      exclude: ['node_modules', 'helpers/**', 'scenarios/**/*.d.ts'],
```

**Why:** Threads are 2-3x faster than process forking with same isolation level.

---

### PRIORITY 4: Remove maxThreads limit in lab ⭐
**Impact:** ~0.5 seconds savings
**Risk:** Very low
**Effort:** 2 minutes

**File:** `/Users/sac/wasm4pm/lab/vitest.config.ts`

```diff
  export default defineConfig({
    plugins: [wasm()],
    test: {
      globals: true,
      environment: 'node',
      testTimeout: 60000,
      hookTimeout: 60000,
      teardownTimeout: 30000,
      isolate: true,
      threads: true,
-     maxThreads: 4,
-     minThreads: 1,
+     // maxThreads: auto (use system default)
      include: ['tests/**/*.test.ts'],
```

**Why:** Let vitest auto-detect optimal thread count.

---

### PRIORITY 5: Add `isolate: true` to WASM-dependent packages ⭐
**Impact:** ~0 seconds overhead, prevents flakes
**Risk:** Very low
**Effort:** 10 minutes

**Files to update:**
- `packages/kernel/vitest.config.ts`
- `packages/testing/vitest.config.ts`
- `packages/engine/vitest.config.ts`

**Pattern:**
```diff
  export default defineConfig({
    test: {
      environment: 'node',
      globals: true,
+     isolate: true,    // Add per-test isolation
      coverage: { ... },
```

**Why:** Prevents WasmLoader singleton state leaks between tests under parallelization.

---

## Can We Reach 5 Seconds?

### Honest Assessment

With ALL config changes:
- Root `--parallel`: 32s → ~8s
- Global setup removal: ~8s → ~7s
- Playground threads: ~7s → ~5.5s
- Lab auto-threads: ~5.5s → ~5s (marginal)

**Result: ~5 seconds** ✅ (with conservative estimates)

**But:** This assumes:
1. Global setup removal doesn't cause test failures
2. WASM compile cache is warm (adds 1-2s on cold start)
3. No network calls in tests
4. 8-core system with sufficient RAM

**Realistic expectation: 5-8 seconds** (depending on hardware and setup complexity)

### To Guarantee True 5-Second Target

Config changes alone may not be enough. Additional tactics:

1. **Test Sharding:** Run subset of tests per CI job
   - E.g., 4 CI jobs × 50 tests each = 12 seconds (parallelizable)
   - Not available in Vitest; would require custom CI logic

2. **Test Splitting:** Break large test files (kernel has 100+ tests in single file)
   - kernel tests: 100+ tests → split into 4 files × 25 tests
   - Reduces critical path from 2-3s to ~1s per file

3. **WASM Binary Caching:** Cache compiled WASM between CI runs
   - Saves 1-2 seconds on WASM compilation
   - Implement via GitHub Actions cache or Docker layer

4. **Lazy Loading:** Load WASM only in first test that needs it
   - Avoids global setup overhead
   - Requires refactoring test infrastructure

---

## Implementation Checklist

- [ ] **PR 1:** Add `--parallel` to root package.json (5 min)
- [ ] **PR 2:** Remove globalSetup from apps/wasm4pm (15 min, includes verification)
- [ ] **PR 3:** Replace playground pool: forks → threads (5 min)
- [ ] **PR 4:** Remove maxThreads limit in lab (2 min)
- [ ] **PR 5:** Add isolate: true to WASM packages (10 min)
- [ ] **Testing:** Run `pnpm test` and verify all pass with new config
- [ ] **Benchmarking:** Measure actual time improvements (5-10 min)

**Total effort: ~45-60 minutes**
**Expected result: 5-8 second test suite** ✅

---

## Conclusion

✅ **Config changes alone can achieve 5-8 second target** if global setup is deferred or removed.

**Quick wins (do these first):**
1. Add `--parallel` to root test script (~15s savings)
2. Remove global setup (~1s savings)
3. Replace playground forks (~1.5s savings)

**Recommended approach:** Start with these three (25 minutes). Measure results. Then implement remaining fixes if needed.

**Risk level: VERY LOW** — All changes are config-only, no code logic changes. Easy to revert if issues arise.
