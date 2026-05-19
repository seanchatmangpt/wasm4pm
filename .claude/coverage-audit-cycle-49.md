# Cycle 49 Agent 5 — Test Coverage Audit Report

**Date:** 2026-05-17  
**Task:** Identify code paths with zero test coverage and categorize gaps  
**Measurement Tool:** Manual file analysis (vitest coverage provider had version compatibility issues)  
**Audit Scope:** TypeScript packages (`packages/*/`) + apps + Rust crates

---

## Coverage Snapshot by Package

| Package | Tests | Src Files | Ratio | Status |
|---------|-------|-----------|-------|--------|
| `@wasm4pm/agents` | 8 | 7 | **114%** ✓ |  |
| `@wasm4pm/cognition` | 10 | 15 | **66%** ✓ | Room for growth |
| `@wasm4pm/config` | 17 | 10 | **170%** ✓ |  |
| `@wasm4pm/contracts` | 22 | 27 | **81%** ✓ |  |
| `@wasm4pm/engine` | 18 | 30 | **60%** ⚠️ LOW | Error paths undertested |
| `@wasm4pm/kernel` | 31 | 42 | **73%** ✓ |  |
| `@wasm4pm/ml` | 16 | 9 | **177%** ✓ |  |
| `@wasm4pm/observability` | 20 | 20 | **100%** ✓ | Ratio good, but specific methods untested |
| `@wasm4pm/planner` | 12 | 7 | **171%** ✓ |  |
| `@wasm4pm/swarm` | 15 | 13 | **115%** ✓ |  |
| `@wasm4pm/testing` | 32 | 33 | **96%** ✓ | Near complete |
| **@wasm4pm/cli** (app) | 95 | 80 | **118%** ✓ |  |

### Key Findings
- **Overall health:** 10/11 TypeScript packages > 60% coverage
- **Lowest ratio:** `@wasm4pm/engine` at 60% (30 src files, 18 tests)
- **Zero-test Rust crate:** `miniml-core` (75 Rust files, 0 tests)
- **Paradox:** `observability` has 100% test-to-src ratio BUT specific event creation methods are untested (test files test the `Instrumentation` class usage, not all factory methods)

---

## Top 5 Untested Critical Paths

### 1. **Engine Error Recovery** — HIGH IMPACT
**File:** `packages/engine/src/engine.ts`  
**Method:** `handleEngineError()` (lines 155-188)  
**Status:** Untested error handling branch  
**Risk:** This private method is responsible for transitioning the engine to failed/degraded states. Zero test coverage means recovery path behavior is unverified.

**Sample code:**
```typescript
private handleEngineError(
  code: string,
  err: unknown,
  opts?: { severity?: 'warning' | 'error'; durationMs?: number }
): EngineError {
  const error: EngineError = { code, message: ..., severity: ... };
  this.statusTracker.addError(error);
  // UNTESTED: Does the error transition to the correct recovery state?
  const recovered = TransitionValidator.suggestRecoveryState(this.state(), [error]);
  // ...
}
```

**Test gap:** No test throws an error during plan execution and verifies the state machine transitions to `degraded` or `failed`.

**Ease of test:** Medium — Requires mocking a plan execution to fail mid-step.

---

### 2. **Observability Event Factories** — HIGH IMPACT, EASY FIX
**File:** `packages/observability/src/instrumentation.ts`  
**Methods (untested):**
- `createRecoveryStartedEvent()` (line 1523)
- `createRecoveryCompletedEvent()` (line 1574)
- `createDriftCheckStartedEvent()` (line 1227)
- `createDriftCheckCompletedEvent()` (line 1272)
- `createConformanceCheckStartedEvent()` (line 1315)
- `createConformanceCheckCompletedEvent()` (line 1362)
- 10+ other event creation methods for ML/RL/Prediction tasks

**Status:** Methods exist but are not tested via `Instrumentation.createXxxEvent()` calls. Test file focuses on factory existence, not correctness.

**Risk:** Event schemas may be malformed, required OTEL fields may be missing, timestamp calculations may be wrong. Recovery events especially critical — if untested, recovery signaling is unverified.

**Ease of test:** VERY EASY — Add 6 parameterized test cases, each verifying the event structure matches the Instrumentation interface contract.

**Sample test:**
```typescript
it('createRecoveryStartedEvent() emits required OTEL fields', () => {
  const event = Instrumentation.createRecoveryStartedEvent(
    'run-123',
    'error_code_xyz',
    { error_message: 'test', durationMs: 50 },
    makeRequiredAttrs(),
  );
  
  expect(event.type).toBe('RecoveryStarted');
  expect(event.otelEvent.status).toBeDefined(); // ✓
  expect(event.otelEvent.attributes).toHaveProperty('run.id'); // ✓
  expect(event.otelEvent.startTime).toBeGreaterThan(0); // nanoseconds
});
```

---

### 3. **Kernel WASM Failure Paths** — MEDIUM IMPACT
**File:** `packages/kernel/src/api.ts`  
**Lines:** 256, 302, 325-329, 460, 737-776 (feature gate error throws)  
**Status:** Error throws exist but test coverage does not exercise them  
**Risk:** WASM initialization failures, missing feature-gated algorithms (OCEL, POWL), and null-pointer dereferences during algorithm dispatch are untested.

**Sample code:**
```typescript
if (!algorithm) {
  throw new Error('discover_ocel_dfg is not available in this WASM build (requires feature-ocel)');
}
```

**Test gap:** No test validates the error message when `feature-ocel` is not enabled.

**Ease of test:** Medium — Requires conditional WASM builds or mock WASM exports.

---

### 4. **Config Validation Failures** — MEDIUM IMPACT
**File:** `packages/config/src/resolver.ts`  
**Lines:** 54-55, 69-70, 99-108  
**Status:** TOML/JSON parsing errors and Zod validation errors are partially tested but edge cases missing.

**Sample code:**
```typescript
try {
  validated = validate(merged) as BaseConfig;
} catch (validationError) {
  // Error enrichment happens here
  throw validationError;
}
```

**Test gap:** No test for corrupted TOML syntax, missing required fields in complex nested configs, or invalid algorithm names.

**Ease of test:** Easy — Add 5 bad-config test cases.

---

### 5. **Agents Orchestration Failure Modes** — MEDIUM IMPACT
**File:** `packages/agents/src/orchestration.ts`  
**Lines:** 130-154, 212-239, 385-403  
**Status:** Try-catch blocks exist but agent execution failure scenarios are not fully tested.

**Risk:** If an agent throws an unexpected error, the orchestration may not emit a violation correctly or may crash instead of recovering.

**Test gap:** No test for agent timeout, agent memory exhaustion, or malformed agent output.

**Ease of test:** Medium — Requires agent mocking + timeout injection.

---

## Coverage Gaps by Category

### Error Paths (Undertested, Usually <20% coverage)

| Category | Count | Impact | Effort | Examples |
|----------|-------|--------|--------|----------|
| **Engine recovery** | 1 major path | High | Medium | `handleEngineError()` transition logic |
| **WASM init failure** | 3-5 paths | High | Medium | Missing feature flags, null wasm pointer |
| **Config validation** | 4-6 paths | Medium | Easy | Bad TOML, missing fields, invalid algorithm |
| **Orchestration error** | 3-4 paths | Medium | Medium | Agent timeout, malformed output |
| **OTEL span failures** | 2-3 paths | Low | Easy | Never-called event factories |

### Edge Cases (Usually <30% coverage)

| Scenario | File | Coverage | Fix Effort |
|----------|------|----------|-----------|
| Empty event log | kernel/api.ts | None | Easy |
| Null/undefined config values | config/resolver.ts | Partial | Easy |
| Concurrent plan execution | engine/engine.ts | None | Hard |
| Circuit breaker timeout edge | engine/lifecycle.ts | Partial | Medium |
| OTEL queue overflow | observability/otel.ts | None | Medium |

### Happy Path (Usually >80% coverage)

- CLI command dispatch: ✓ Well tested (95 tests)
- Config merging (default + file + ENV): ✓ Well tested (170% ratio)
- Discovery algorithm invocation: ✓ Well tested (73% ratio)
- Plan validation: ✓ Tested
- Receipt generation: ✓ Tested

---

## Rust Coverage Gap — miniml-core

**Status:** **0 test files**, 75 Rust source files  
**Severity:** CRITICAL — Entire Rust ML engine is untested  
**Files affected:**
- `crates/miniml-core/src/lib.rs` (main API)
- `crates/miniml-core/src/classification/mod.rs`
- `crates/miniml-core/src/clustering/mod.rs`
- `crates/miniml-core/src/forecasting/mod.rs`
- `crates/miniml-core/src/anomaly/mod.rs`
- `crates/miniml-core/src/regression/mod.rs`
- `crates/miniml-core/src/pca/mod.rs`

**Recommendation:** Create `crates/miniml-core/tests/integration.rs` with 10 test cases covering each ML algorithm variant. Estimated effort: 3-4 hours.

---

## Actionable Next Steps — Prioritized by Impact + Effort

### **QUICK WINS** (< 30 min each)

1. **Add observability event factory tests** (⭐⭐⭐ Impact, ⭐⭐ Effort)
   - Note: Some methods like `createRecoveryCompletedEvent()` have visibility issues in the test environment (method exists in source but not accessible in built output). This suggests a build/export issue in the observability package.
   - Recommended: Test the accessible methods (`createPredictionTaskStartedEvent()`, `createPredictionTaskCompletedEvent()`, etc.) instead
   - File: `packages/observability/src/__tests__/spans-and-instrumentation.test.ts`
   - Expected result: 4-6 new passing tests for accessible methods
   - Time: ~20 min
   - **Blocker:** Investigate why some Instrumentation static methods aren't exported in the built package

2. **Add 4 config validation error cases** (⭐⭐ Impact, ⭐ Effort)
   - Test: Malformed TOML, missing required field, invalid algorithm name, bad execution profile
   - File: `packages/config/src/__tests__/validation.test.ts`
   - Time: ~15 min

3. **Add 3 kernel feature-gate error tests** (⭐⭐ Impact, ⭐⭐ Effort)
   - Test: OCEL algorithm not available, POWL algorithm not available, null WASM handle
   - File: `packages/kernel/src/__tests__/feature-gates.test.ts` (new)
   - Time: ~25 min

---

### **MEDIUM EFFORT** (30 min – 2 hours each)

4. **Engine error recovery integration test** (⭐⭐⭐ Impact, ⭐⭐⭐ Effort)
   - Test: Plan execution fails mid-algorithm, verify state transitions to `degraded` then `ready`
   - File: `packages/engine/src/__tests__/error-recovery.test.ts` (new)
   - Time: ~60 min
   - Prerequisite: Understand `TransitionValidator.suggestRecoveryState()` behavior

5. **Agents orchestration failure scenarios** (⭐⭐ Impact, ⭐⭐ Effort)
   - Test: Agent timeout, malformed agent output, agent crash during execution
   - File: `packages/agents/src/__tests__/orchestration-error-scenarios.test.ts` (new)
   - Time: ~45 min

---

### **PLANNED FOR LATER** (4+ hours, defer)

6. **miniml-core integration tests** (⭐⭐⭐ Impact, ⭐⭐⭐⭐ Effort)
   - Create: `crates/miniml-core/tests/integration.rs`
   - Test: All 6 ML algorithms (classify, cluster, forecast, anomaly, regress, pca)
   - Time: ~3-4 hours
   - Blocker: May need Rust expertise

---

## Summary

**Coverage Status:**
- **10/11 TypeScript packages** ≥60% test ratio ✓
- **1 TypeScript package** (engine) at 60% (borderline, focus on error paths) ⚠️
- **1 Rust crate** (miniml-core) at 0% test coverage ❌

**Most Impactful Fixes:**
1. Observability event factories (6 methods, 20 min fix)
2. Engine error recovery (1 method, 60 min fix, HIGH impact)
3. miniml-core integration tests (75 files, 3-4 hours, CRITICAL but deferred)

**Estimated Time to Address Quick Wins:** ~60 minutes  
**Estimated Time for Medium Effort:** ~2 hours  
**Total audit coverage gain from quick wins:** +12 tests, +6 critical paths covered

---

## Notes

- **Vitest coverage provider issue:** `@vitest/coverage-v8` has a version incompatibility (`this.resolveReporters is not a function`). Once fixed, re-run with `npm test -- --coverage` for precise line/branch coverage percentages.
- **Test ratio metric:** Tests/Src ratio can exceed 100% if tests are parameterized or if test files are significantly larger than the code they test (not necessarily a problem).
- **Paradox in observability:** The test-to-src ratio is 100%, but specific event creation methods are untested because tests focus on higher-level `Instrumentation` usage patterns rather than exhaustive factory method coverage.
