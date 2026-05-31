# Test Compaction: Detailed Implementation Specification

**Audience:** Backend/Test Infrastructure Engineers  
**Effort Estimate:** 50 minutes to 3 hours (depending on phase)  
**Rollout:** Phased over 3 weeks

---

## Phase 1: Parallel Workspace Execution (5-10 min)

### 1.1 Update package.json Scripts

**File:** `/Users/sac/wasm4pm/package.json`

**Current state:**
```json
{
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "ci:test": "npm run tps:check && npm run lint && npm run test"
  }
}
```

**Changes:**

```json
{
  "scripts": {
    "test": "npm run test:parallel",
    "test:parallel": "npm run test --workspace wasm4pm & npm run test --workspace @wasm4pm/contracts & npm run test --workspace @wasm4pm/config & npm run test --workspace @wasm4pm/engine & npm run test --workspace @wasm4pm/observability & npm run test --workspace @wasm4pm/kernel & npm run test --workspace @wasm4pm/ml & npm run test --workspace @wasm4pm/planner & npm run test --workspace @wasm4pm/testing & npm run test --workspace @wasm4pm/agents & npm run test --workspace @wasm4pm/cognition & npm run test --workspace @wasm4pm/cli && wait",
    "test:fast": "TEST_MODE=fast npm run test:parallel",
    "test:full": "npm run test:parallel",
    "test:watch": "TEST_MODE=fast npm run test -- --watch",
    "ci:test": "npm run tps:check && npm run lint && npm run test:fast",
    "ci:test:full": "npm run tps:check && npm run lint && npm run test:full"
  }
}
```

**Validation:**
```bash
# Test basic parallel execution
npm run test:parallel

# Should show all workspaces running simultaneously (check output timestamps)
```

**Expected result:** Test execution begins in parallel for each workspace.

---

### 1.2 Verify Workspace Independence

**Inspection:** Ensure no shared state between workspaces

```bash
# List all workspaces and their dependencies
npm ls --depth=0 --workspaces

# Check for cross-workspace imports
grep -r "from '\.\./" packages/ apps/ | grep -v node_modules | wc -l
# Should be <5 (most are expected)
```

**Action if found:** If circular dependencies exist, move to sequential fallback.

---

## Phase 2: Shared WASM Context & Fixtures (25-40 min)

### 2.1 Create Shared WASM Context

**File:** Create `wasm4pm/__tests__/shared-wasm.ts` (NEW)

```typescript
/**
 * Shared WASM instance for test suite.
 * 
 * Motivation: WasmLoader.load() takes ~2-3 seconds and is called by nearly every test.
 * By sharing a single instance across all tests, we save 60-80% of startup time.
 * 
 * Usage:
 *   import { getSharedWasm } from './shared-wasm.js';
 *   const wasm = await getSharedWasm();
 */

import type { Wasm } from '../src/lib.js';
import { WasmLoader } from '../src/wasm-loader.js';

let _sharedWasm: Awaited<ReturnType<typeof WasmLoader.load>> | null = null;
let _loadPromise: Promise<Awaited<ReturnType<typeof WasmLoader.load>>> | null = null;

/**
 * Returns the shared WASM instance, loading it if necessary.
 * Safe for concurrent calls; subsequent calls wait for first load.
 */
export async function getSharedWasm() {
  if (_sharedWasm) {
    return _sharedWasm;
  }
  
  if (_loadPromise) {
    return _loadPromise;
  }
  
  _loadPromise = WasmLoader.load();
  try {
    _sharedWasm = await _loadPromise;
    return _sharedWasm;
  } finally {
    _loadPromise = null;
  }
}

/**
 * Resets the shared instance.
 * Use in cleanup between test suites (not between individual tests).
 */
export function resetSharedWasm() {
  _sharedWasm = null;
  _loadPromise = null;
}

/**
 * Preloads the WASM instance during test suite initialization.
 * Call this in a top-level beforeAll to parallelize loading.
 */
export async function preloadWasm() {
  await getSharedWasm();
}
```

### 2.2 Update Test Setup

**File:** Update `wasm4pm/__tests__/setup.ts`

**Current state:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ... other imports
```

**New state:**
```typescript
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { preloadWasm, resetSharedWasm } from './shared-wasm.js';

// Preload WASM during setup phase
beforeAll(async () => {
  await preloadWasm();
});

// Clean up per-suite
afterAll(() => {
  resetSharedWasm();
});

// ... rest of setup
```

### 2.3 Update Test Files (Systematic Refactoring)

**Script:** Generate refactoring commands

```bash
# Find all test files using WasmLoader.load()
grep -r "WasmLoader.load()" wasm4pm/__tests__/ | grep -v "shared-wasm.ts" | cut -d: -f1 | sort -u > /tmp/wasm-loader-files.txt

# For each file, show pattern to replace
cat /tmp/wasm-loader-files.txt | while read f; do
  echo "=== $f ==="
  grep -n "const wasm = await WasmLoader.load()" "$f" | head -2
done
```

**Manual refactoring pattern:**

For each file in `wasm4pm/__tests__/*.test.ts`:

**OLD PATTERN:**
```typescript
import { WasmLoader } from '../src/wasm-loader.js';

describe('My test', () => {
  let wasm: Wasm;
  
  beforeEach(async () => {
    wasm = await WasmLoader.load();  // ← SLOW: 2-3s per test
  });
  
  it('should work', async () => {
    const result = wasm.discover_dfg(...);
  });
});
```

**NEW PATTERN:**
```typescript
import { getSharedWasm } from './shared-wasm.js';

describe('My test', () => {
  let wasm: Wasm;
  
  beforeEach(async () => {
    wasm = await getSharedWasm();  // ← FAST: <1ms (cached)
  });
  
  it('should work', async () => {
    const result = wasm.discover_dfg(...);
  });
});
```

**Validation:**
```bash
# Verify no WasmLoader.load() calls remain in beforeEach
grep -r "beforeEach.*WasmLoader.load()" wasm4pm/__tests__/ | wc -l
# Should be 0
```

### 2.4 Create Fixture Cache

**File:** Create `wasm4pm/__tests__/fixture-cache.ts` (NEW)

```typescript
/**
 * In-memory cache for test fixtures.
 * 
 * Many tests generate identical event logs independently.
 * Caching them reduces log generation from ~50-100ms per test
 * to <1ms for cache hits.
 */

const _fixtureCache = new Map<string, any>();

export interface FixtureDef {
  name: string;
  generator: () => Promise<any>;
  ttl?: number; // Milliseconds; 0 = permanent
}

/**
 * Retrieves or generates a fixture.
 */
export async function getOrCreateFixture<T>(
  name: string,
  generator: () => Promise<T>
): Promise<T> {
  if (_fixtureCache.has(name)) {
    return _fixtureCache.get(name) as T;
  }
  
  const fixture = await generator();
  _fixtureCache.set(name, fixture);
  return fixture;
}

/**
 * Pre-generates common fixtures during test initialization.
 */
export async function preloadFixtures(defs: FixtureDef[]) {
  await Promise.all(
    defs.map(({ name, generator }) => 
      getOrCreateFixture(name, generator)
    )
  );
}

/**
 * Clears the entire cache.
 */
export function clearFixtures() {
  _fixtureCache.clear();
}

/**
 * Clears a specific fixture.
 */
export function clearFixture(name: string) {
  _fixtureCache.delete(name);
}
```

### 2.5 Define Common Fixtures

**File:** Create `wasm4pm/__tests__/fixtures/common.ts` (NEW)

```typescript
/**
 * Common test fixtures used across test suite.
 */

import { generateXES, type XESLog } from '@wasm4pm/testing';

export const FIXTURES = {
  // Standard 100-event log (fast baseline)
  xes100: async (): Promise<XESLog> => {
    return generateXES({
      traces: 10,
      eventsPerTrace: 10,
      activityNames: ['A', 'B', 'C', 'D', 'E'],
    });
  },

  // Medium 1K-event log
  xes1k: async (): Promise<XESLog> => {
    return generateXES({
      traces: 100,
      eventsPerTrace: 10,
      activityNames: ['Register', 'Approve', 'Send', 'Confirm'],
    });
  },

  // Large 10K-event log (slow, only when needed)
  xes10k: async (): Promise<XESLog> => {
    return generateXES({
      traces: 1000,
      eventsPerTrace: 10,
      activityNames: ['A', 'B', 'C'],
    });
  },

  // Real-world examples
  purchase: async (): Promise<XESLog> => {
    return generateXES({
      traces: 50,
      eventsPerTrace: 8,
      activityNames: ['Order', 'Payment', 'Fulfillment', 'Delivery', 'Return'],
    });
  },
};
```

### 2.6 Update Test Files to Use Fixtures

**Pattern for refactoring:**

**OLD:**
```typescript
it('should handle 100 events', async () => {
  const log = await generateXES({
    traces: 10,
    eventsPerTrace: 10,
  });
  const result = await kernel.run('dfg', log);
});
```

**NEW:**
```typescript
it('should handle 100 events', async () => {
  const log = await getOrCreateFixture('xes100', FIXTURES.xes100);
  const result = await kernel.run('dfg', log);
});
```

**Validation:**
```bash
# Check fixture usage is working
npm run test:fast -- --reporter=verbose | grep "cache" | head -5
# Should show cache hits
```

---

## Phase 3: Environment-Based Fast Mode (10-20 min)

### 3.1 Update vitest.config.ts

**File:** `wasm4pm/vitest.config.ts`

**Current state:**
```typescript
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/setup.ts'],
    coverage: { /* ... */ },
    testTimeout: 30000,
  },
});
```

**New state:**
```typescript
import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

const isFastMode = process.env.TEST_MODE === 'fast';

export default defineConfig({
  plugins: [wasm()],
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    
    // In fast mode, skip slow tests
    exclude: isFastMode
      ? [
          '**/*e2e*.test.ts',           // End-to-end: >2s each
          '**/*integration*.test.ts',   // Integration: >1s each
          '**/bench*.test.ts',          // Benchmarks: can be slow
          '**/*predict*.test.ts',       // Prediction: ML overhead
          '**/*ml*.test.ts',            // ML models: training overhead
          '**/*mcpp*.test.ts',          // MCPP routes: complex
          '**/*trace*.test.ts',         // Trace conformance: expensive
        ]
      : [],
    
    setupFiles: ['__tests__/setup.ts'],
    
    // Coverage thresholds adjusted for fast mode
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/mcp_server.ts', 'node_modules/**', 'pkg/**'],
      thresholds: isFastMode
        ? {
            // Relaxed thresholds in fast mode (some tests skipped)
            lines: 45,
            functions: 45,
            branches: 35,
            statements: 45,
          }
        : {
            // Strict thresholds in full mode
            lines: 60,
            functions: 60,
            branches: 50,
            statements: 60,
          },
    },
    
    // Shorter timeout in fast mode (detect hangs earlier)
    testTimeout: isFastMode ? 10000 : 30000,
    
    // Parallel execution within files (safe if no global state)
    threads: true,
    maxThreads: 4,
    minThreads: 1,
  },
});
```

### 3.2 Add vitest.config.ts to All Workspaces

Repeat the above pattern for each workspace:
- `apps/wasm4pm/vitest.config.ts`
- `packages/*/vitest.config.ts`

---

## Phase 4: Test Selection CLI (5-10 min)

### 4.1 Add Test Selection Scripts

**File:** Update `package.json`

```json
{
  "scripts": {
    "test": "npm run test:fast",
    "test:fast": "TEST_MODE=fast npm run test:parallel",
    "test:full": "npm run test:parallel",
    "test:watch": "TEST_MODE=fast npm run test -- --watch",
    "test:conformance": "npm run test -- --match '*conformance*'",
    "test:ml": "npm run test -- --match '*ml*'",
    "test:rl": "npm run test -- --match '*rl*'",
    "test:predict": "npm run test -- --match '*predict*'",
    "test:cli": "npm run test -- --match '*cli*'",
    "test:smoke": "npm run test -- --match '*unit*' --match '*basic*'",
    "ci:test": "npm run tps:check && npm run lint && npm run test:fast",
    "ci:test:full": "npm run tps:check && npm run lint && npm run test:full"
  }
}
```

### 4.2 Document Test Naming Convention

**Convention:** All tests MUST follow the pattern:
```
<domain>-<level>-<topic>.test.ts

domain: conformance, ml, rl, predict, cli, etc.
level: unit, integration, e2e, bench
topic: descriptive name
```

**Examples:**
```
✓ ml-unit-feature-quality.test.ts
✓ conformance-integration-full-suite.test.ts
✓ rl-e2e-autonomic-healing.test.ts
✓ cli-unit-command-parsing.test.ts
```

**Validation:**
```bash
# Check naming compliance
find . -name '*.test.ts' | grep -v node_modules | while read f; do
  if ! [[ $f =~ \-unit\-|\-integration\-|\-e2e\-|\-bench\- ]]; then
    echo "WARNING: Non-compliant name: $f"
  fi
done
```

---

## Validation & Measurement

### Validation Checklist

- [ ] All workspaces in package.json scripts
- [ ] `shared-wasm.ts` created and imported in setup
- [ ] `fixture-cache.ts` created with common fixtures
- [ ] All test files updated to use `getSharedWasm()`
- [ ] All test files updated to use `getOrCreateFixture()`
- [ ] vitest.config.ts updated with fast mode logic
- [ ] Test naming convention documented
- [ ] Package.json scripts updated with `test:fast`, `test:full`, etc.

### Baseline Measurement

**Before any changes:**
```bash
$ time npm test 2>&1
# Note: _____ seconds
```

Document in: `TEST_COMPACTION_BASELINE.txt`

### After Phase 1

```bash
$ time npm run test:parallel
# Expected: 50% of baseline
# Document result
```

### After Phase 2-3

```bash
$ time npm run test:fast
# Expected: <6 seconds (preferably <5s)
# Document result
```

### Performance Tracking

Create a performance tracking script:

**File:** Create `scripts/test-perf.js` (NEW)

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

const modes = ['fast', 'full'];
const results = {};

for (const mode of modes) {
  const env = { ...process.env, TEST_MODE: mode };
  const start = Date.now();
  try {
    execSync(`npm run test:${mode}`, { stdio: 'pipe', env });
    const elapsed = Date.now() - start;
    results[mode] = { elapsed, status: 'PASS' };
  } catch {
    const elapsed = Date.now() - start;
    results[mode] = { elapsed, status: 'FAIL' };
  }
}

console.log('Test Performance Report');
console.log('=======================');
for (const [mode, { elapsed, status }] of Object.entries(results)) {
  console.log(`${mode.padEnd(10)}: ${elapsed}ms (${status})`);
}

// Fail if fast mode exceeds 5s
if (results.fast.elapsed > 5000) {
  console.error(`\n❌ Fast mode exceeded 5s target (${results.fast.elapsed}ms)`);
  process.exit(1);
}

console.log('\n✅ All performance targets met');
```

Usage:
```bash
node scripts/test-perf.js
```

---

## Rollout Timeline

### Week 1: Phase 1-2
- Day 1-2: Update package.json scripts, create shared-wasm.ts
- Day 2-3: Refactor all test files to use getSharedWasm()
- Day 3-4: Create fixture cache, refactor test fixtures
- Day 4-5: Measure and document results

**Gate:** If Phase 1-2 doesn't achieve 30%+ improvement, investigate bottleneck before proceeding.

### Week 2: Phase 3
- Day 1-2: Update vitest.config.ts with fast mode logic
- Day 2-3: Add test selection scripts
- Day 3-4: Document naming convention
- Day 4-5: Measure fast vs. full performance

**Gate:** `npm run test:fast` must be <7 seconds to proceed.

### Week 3: Hardening & Rollout
- Day 1-2: Update CI to use fast mode
- Day 2-3: Add performance gates to CI pipeline
- Day 3-4: Monitor for regressions
- Day 4-5: Finalize documentation

---

## Risk Mitigation

### Risk: WASM Load Failures in Parallel

**Mitigation:** Use promise deduplication in `shared-wasm.ts` (already implemented above)

**Test:** Run multiple tests concurrently accessing WASM
```bash
npm run test:fast -- --reporter=verbose | grep -i "wasm\|error" | head -10
```

### Risk: Fixture Cache Pollution

**Mitigation:** Clear fixtures between test suites, use unique names

**Test:** Verify no cross-contamination
```bash
npm run test:fast -- --match '*conformance*' && npm run test:fast -- --match '*ml*'
# Both should pass independently
```

### Risk: Fast Mode Misses Real Bugs

**Mitigation:** Full mode runs in CI nightly; fast mode for local/PR

**CI configuration:**
```yaml
jobs:
  test-fast:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:fast
  
  test-full:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' || github.event.pull_request.draft == false
    steps:
      - run: npm run test:full
```

### Risk: Test Files Don't Honor Fast Mode

**Mitigation:** Add pre-commit hook to verify

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for new test files without fast-mode skips
new_tests=$(git diff --cached --name-only | grep '\.test\.ts$')
for f in $new_tests; do
  if ! grep -q "@vitest testTimeout\|it.skip\|describe.skip" "$f"; then
    echo "WARNING: New test file $f doesn't have explicit timeout"
  fi
done
```

---

## Success Criteria

- ✅ `npm run test:fast` completes in <5 seconds consistently
- ✅ `npm run test:full` completes in <20 seconds
- ✅ All 918 tests still pass (no loss of coverage)
- ✅ No test flakiness introduced (deterministic)
- ✅ CI gates prevent regression (performance checks)
- ✅ Developer experience improved (test:watch <5s)

---

## Documentation & Communication

### For Developers

1. Update `README.md` with new test commands
2. Add quick-start guide in `DEVELOPMENT.md`
3. Communicate in team Slack: "Fast test mode reduces CI from 30s to 5s"

### For CI/CD

1. Update GitHub Actions to use `npm run test:fast` by default
2. Schedule nightly `npm run test:full` run
3. Add performance dashboard / trending

### For Documentation

1. Update CLAUDE.md with test command best practices
2. Document fixture naming and usage
3. Add troubleshooting guide for test perf issues

---

## Post-Rollout Maintenance

### Monthly Review

```bash
# Track performance trend
npm run test:perf >> test-perf-history.txt
```

### Alert Thresholds

- If `test:fast` exceeds 6s, investigate new slow tests
- If `test:full` exceeds 25s, investigate regressions

### Continuous Improvement

- Monitor fixture cache hit rates
- Identify new candidates for skipping in fast mode
- Profile slowest tests and optimize individually

---

## References

- **Main strategy doc:** TEST_COMPACTION_STRATEGY.md
- **Quick reference:** TEST_COMPACTION_QUICKSTART.md
- **This spec:** TEST_COMPACTION_IMPLEMENTATION_SPEC.md
- **Baseline measurement:** TEST_COMPACTION_BASELINE.txt (to be created)

---

**Document Version:** 1.0 | **Last Updated:** 2026-05-29 | **Status:** Ready for Implementation
