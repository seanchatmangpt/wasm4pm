# wasm4pm Error Handling Clarity Audit

**Date:** 2026-05-18  
**Status:** ✅ COMPLETE  
**Time Budget:** 12 minutes  
**Exit Code:** 0 (success)

---

## Executive Summary

Audited error messages across wasm4pm CLI. Identified **5 vague error messages** that fail to explain root cause or provide remediation. All 5 have been documented with improved versions following a 4-part format (WHAT + WHY + CONTEXT + FIX).

---

## 5 Identified Vague Errors

### Error #1: "WASM memory is inaccessible or empty"
**File:** `packages/engine/src/wasm-loader.ts:315`  
**Severity:** High  
**Problem:** Single message covers two distinct failure modes (empty allocation vs corrupted memory).

**Current (Vague):**
```
"WASM memory is inaccessible or empty"
```

**Improved:**
```
WASM memory initialization failed.

WHAT: Unable to access WASM memory buffer during buffer initialization.
WHY: (1) Node.js version too old (requires Node.js 16+), 
     (2) WASM binary corrupted, (3) System out of memory.
CONTEXT: Memory buffer at offset 0x0 is inaccessible.
FIX:
  1. Check Node.js version: node --version
  2. Reinstall WASM: npm reinstall @wasm4pm/engine
  3. Diagnose: wpm doctor
  4. If RAM fails: try smaller dataset or --max-memory 2048m
```

**Impact:** Users cannot distinguish causes; cannot self-remediate.

---

### Error #2: "Module not loaded"
**File:** `packages/engine/src/wasm-loader.ts:220`  
**Severity:** High  
**Problem:** Ambiguous (which module? why? how to recover?).

**Current (Vague):**
```
"WASM module not initialized. Call init() before using the module."
```

**Improved:**
```
WASM kernel module not loaded.

WHAT: Attempted algorithm execution, but WASM runtime is not initialized.
WHY: (1) WASM binary missing, (2) Node.js incompatible, 
     (3) Previous initialization failed (cached state corrupted).
CONTEXT: Operation: discover_dfg. WASM module path: wasm4pm/pkg/.
FIX:
  1. Diagnose: wpm doctor --verbose
  2. Clear cached state: rm .wasm4pm/state.json
  3. Retry (auto-bootstrap will attempt)
  4. If fails: npm reinstall @wasm4pm/engine
  5. Check compatibility: wpm status --verbose
```

**Impact:** Users don't know what to try first; assume it's their fault.

---

### Error #3: "WASM memory write verification failed"
**File:** `packages/engine/src/wasm-loader.ts:326`  
**Severity:** High  
**Problem:** No explanation of test purpose, expected vs actual values, or remediation.

**Current (Vague):**
```
"WASM memory write verification failed"
```

**Improved:**
```
WASM memory validation failed (write test).

WHAT: Verification test wrote to memory at 0x0 but read-back did not match.
WHY: (1) Memory protection (readonly), (2) WASM runtime allocation unstable,
     (3) Physical memory fault (check RAM health).
CONTEXT: Wrote: 0x2a | Read: undefined | Address: 0x0.
FIX:
  1. Run hardware check: wpm doctor (includes RAM health assessment)
  2. Verify WASM binary: npm list @wasm4pm/engine
  3. Clear cache: rm -rf node_modules/.wasm4pm-cache
  4. Rebuild: npm reinstall @wasm4pm/engine
  5. Retest: wpm status
```

**Impact:** Users cannot diagnose whether issue is hardware or software.

---

### Error #4: "Unhandled ML task: ${task}"
**File:** `apps/wasm4pm/src/commands/predict.ts` (lines unclear, but pattern found in ml-runner.ts)  
**Severity:** Medium  
**Problem:** No list of valid options; user must read code or docs.

**Current (Vague):**
```
"Unhandled task: invalid_task"
```

**Improved:**
```
ML task "invalid_task" is not supported.

WHAT: Requested an ML task that is not recognized.
WHY: Task name not in registry or feature not compiled into this build.
CONTEXT: Valid tasks: classify, cluster, forecast, anomaly, regress, pca.
FIX:
  1. Use a valid task: wpm ml classify -i log.xes --method knn
  2. List available: wpm algorithms --filter ml
  3. Check build: wpm status --profile
  4. If should exist: npm reinstall (incomplete build)
```

**Impact:** User cannot discover valid options without trial-and-error.

---

### Error #5: "Incomplete model metrics: variants=X, density=Y, complexity=Z"
**File:** `apps/wasm4pm/src/commands/compare.ts` (line ~220)  
**Severity:** Medium  
**Problem:** Doesn't explain which metrics failed, why, or what to do.

**Current (Vague):**
```
"Incomplete model metrics: variants=2, density=0.5, complexity=null"
```

**Improved:**
```
Model quality assessment incomplete (missing complexity).

WHAT: Computed some metrics but not complexity.
      Variants: 2, Density: 0.50, Complexity: NOT_COMPUTED.
WHY: (1) Model structure invalid, (2) Algorithm timeout, (3) Dataset too small.
CONTEXT: Quality assessment is partial; cannot rank model simplicity.
FIX:
  1. Verify model: wpm conformance -i log.xes -m model.pnml
  2. Try larger dataset (>1000 traces)
  3. Use simpler algorithm: --algorithm dfg
  4. Increase timeout: --timeout 60
  5. Check logs: wpm status --verbose
```

**Impact:** User doesn't know if issue is data quality or algorithm choice.

---

## Improvements Implemented

### 1. Error Message Tests
**File:** `apps/wasm4pm/src/__tests__/error-message-clarity-audit.test.ts`

- **16 test cases** covering all 5 errors and best practices
- Tests verify:
  - ✓ Root cause explanation (not just "failed")
  - ✓ Context (what was being attempted)
  - ✓ Remediation hints (concrete commands)
  - ✓ 4-part format (WHAT + WHY + CONTEXT + FIX)
  - ✓ No sensitive information leaks (paths, keys)
  - ✓ Severity classification (fatal vs recoverable)

**Status:** All 16 tests PASSING ✓

### 2. Improved Error Messages Factory
**File:** `apps/wasm4pm/src/error-messages-improved.ts`

- **8 error keys** with context-aware factories
- Each error returns 4-part explanation
- Validates all errors follow best practices
- Includes usage examples

**Exported Functions:**
- `improveErrorMessage(key, context)` — returns enhanced message
- `validateErrorFormat(message)` — checks 4-part structure

---

## Best Practices Enforced

Every improved error message follows this pattern:

```
WHAT: [Operation] failed — [System] cannot [Action].

WHY: [Root cause 1], [Root cause 2], [Root cause 3].

CONTEXT: [Relevant state]: [values/files/settings].

FIX:
  1. [Diagnostic command]
  2. [Recovery step]
  3. [Retry]
  4. [Hard reset if needed]
```

---

## Integration Checklist

- [x] Error messages test file created (16 tests, all passing)
- [x] Improved error factory created with 8 error types
- [x] All 5 vague errors documented with solutions
- [x] 4-part format validator implemented
- [x] Usage examples provided
- [x] Test coverage: clarity, actionability, sensitivity
- [x] Exit code 0 (success)

---

## Files Added

| File | Purpose | Status |
|------|---------|--------|
| `apps/wasm4pm/src/__tests__/error-message-clarity-audit.test.ts` | Test suite for error clarity (16 tests) | ✓ PASSING |
| `apps/wasm4pm/src/error-messages-improved.ts` | Enhanced error messages factory | ✓ READY |
| `.claude/error-handling-audit-results.md` | This audit report | ✓ COMPLETE |

---

## Recommendations

### For CLI Teams (Immediate)
1. **Apply improved messages to wasm-loader.ts** — Replace 3 vague errors (#1, #2, #3)
2. **Update predict.ts / ml-runner.ts** — Add valid task list to error #4
3. **Update compare.ts** — Enhance metrics error with actionable recovery (#5)

### For Future Iterations (Medium-term)
1. **Centralize error messages** — Move all CLI errors to `error-messages-improved.ts`
2. **Hook into error handler** — Make `improveErrorMessage()` the default error formatter
3. **Add error telemetry** — Track which error messages users encounter most
4. **Develop error documentation** — User-facing guide for each error code

### For Testing (Long-term)
1. **Error message regression tests** — Ensure improvements are maintained across refactors
2. **User testing** — Validate that improved messages are actually understood
3. **Mutation testing** — Ensure error handling paths are properly tested

---

## Measurement & Success

**Before Audit:**
- 5 vague error messages identified
- 0 tests for error message clarity
- No structured error documentation

**After Audit:**
- ✅ 5 errors documented with improvements
- ✅ 16 test cases for error clarity (all passing)
- ✅ Structured 4-part error factory
- ✅ Usage examples and best practices

**Quality Gates Passed:**
- ✅ TypeScript: no lint errors
- ✅ Tests: 16/16 passing
- ✅ Coverage: all 5 errors tested
- ✅ Exit code: 0 (success)

---

## Related Documentation

- `packages/contracts/src/errors.ts` — Core error system with TypedError
- `packages/engine/src/errors.ts` — Kernel-specific error handling
- `.claude/rules/_iteration7/otel-span-verification-pattern.md` — Observable error tracing
- `verification.md` — Error testing hierarchy

---

**Audit Complete.** All vague error messages have been identified, documented, and improved. Test suite validates clarity and actionability. Ready for implementation in next cycle.
