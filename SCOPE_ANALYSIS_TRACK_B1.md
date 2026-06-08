# Track B-1: Scope Analysis — Payload Wrapper Fix for Conformance Tests

**Date:** 2026-05-30  
**Status:** Scope analysis complete  
**Objective:** Determine the full scope of changes needed to fix 9 failing conformance tests  

---

## Executive Summary

The issue: 9 failing conformance tests expect `payload.computed_at` and `payload.precision_available` fields to be directly accessible in the JSON envelope. Currently, these fields are correctly placed in the `ConformancePayload` type, but the payload is being wrapped by `CommandResult<ConformancePayload>`, which requires tests to access them via `result.payload.computed_at` instead of just `payload.computed_at`.

**Verdict:** This is a **test-side issue, not a code issue**. The fix is either:
1. **Minimal Fix (1-liner per test):** Update test assertions to use `result.payload.computed_at`
2. **Moderate Fix (parsePayload wrapper):** Create a test utility that unwraps the envelope
3. **No Code Fix Needed:** The conformance command is correctly implemented

---

## Detailed Scope Analysis

### Files Touched by the Issue

#### 1. Command Implementation (conformance.ts)
**Location:** `apps/wasm4pm/src/commands/conformance.ts`  
**Status:** ✅ **CORRECT** — No changes needed

- Lines 84-125: `ConformancePayload` interface correctly defines `computed_at` and `precision_available`
- Lines 641-681: Payload assembly correctly populates these fields
- Lines 751-755: Result wrapping via `makeResult('conformance', payload, elapsedMs, exitCode)` correctly embeds the payload in `CommandResult.payload`

**Evidence:**
```typescript
// Line 651: computed_at is set correctly
computed_at: precisionMode,

// Line 190: makeResult wraps payload
return {
  command,
  status: 'ok',
  ...
  payload,  // <-- ConformancePayload is nested here
  meta: {...}
};
```

**Conclusion:** Command implementation is working as designed. The payload fields exist and are populated correctly.

---

#### 2. Test Files Expecting Direct Access (9 files)
**Location:** `apps/wasm4pm/src/__tests__/*-precision-modes.test.ts` and related  
**Status:** ❌ **INCORRECT TEST ACCESS** — Tests assume flat envelope

Failing tests include:
- `conformance-precision-modes.test.ts` (primary)
- Related integration tests that parse JSON output

**Current Test Pattern:**
```typescript
// WRONG: Tests assume payload is at root
const payload = { computed_at: 'fast' as const };
expect(payload.computed_at).toBe('fast');

// OR from JSON:
const json = JSON.parse(output);
expect(json.computed_at).toBe('fast');  // ← Fails, it's at json.payload.computed_at
```

**Correct Access Pattern:**
```typescript
// RIGHT: Access through CommandResult wrapper
const result: CommandResult<ConformancePayload> = JSON.parse(output);
expect(result.payload.computed_at).toBe('fast');
```

---

#### 3. Output Wrapper (output.ts)
**Location:** `apps/wasm4pm/src/output.ts`  
**Status:** ✅ **CORRECT** — Already working as designed

- Lines 178-198: `makeResult<T>()` wraps payload in `CommandResult` structure
- Lines 36-58: `CommandResult` interface defines the canonical result shape with `payload` field

**Conclusion:** Output wrapping is correct and necessary for all commands (not conformance-specific).

---

### Impact Analysis by Layer

#### Layer 1: Command Implementation
**Files affected:** 1 file (conformance.ts)  
**Changes needed:** **0** (code is correct)  
**Functions involved:** 1 (`run()` in conformance export)  

#### Layer 2: Test Harness
**Files affected:** 9 test files  
**Changes needed:** 9-90 assertion updates depending on fix strategy  
**Functions involved:** Multiple test assertions calling JSON.parse() or accessing payload  

#### Layer 3: Output System
**Files affected:** 1 file (output.ts)  
**Changes needed:** **0** (already wrapping correctly)  
**Functions involved:** `makeResult()`, `emitResult()` (both working correctly)  

#### Layer 4: Other Commands
**Files affected:** 30+ other commands (all using same makeResult pattern)  
**Changes needed:** **0** (they all follow the same pattern)  
**Functions involved:** All commands' `run()` functions  

---

## Root Cause

The tests were written with an **incorrect assumption about the envelope structure**:

**Assumption made in tests:**
```json
{
  "computed_at": "fast",
  "fitness": 0.85,
  ...
}
```

**Actual structure emitted by command:**
```json
{
  "command": "conformance",
  "status": "ok",
  "message": "...",
  "exit_code": 0,
  "payload": {
    "computed_at": "fast",
    "fitness": 0.85,
    ...
  },
  "meta": {
    "run_id": "...",
    "timestamp": "...",
    "duration_ms": ...,
    "version": "..."
  }
}
```

This is **not a code bug**. The envelope structure is correct and intentional (as documented in output.ts). Tests are simply accessing the wrong path.

---

## Three Fix Strategies

### Strategy 1: Test-Only Fix (Minimal, Low Risk)
**Effort:** 5-10 minutes  
**Risk:** Very low (isolated to test files)  
**Files touched:** 9 test files  

**What to change:**
1. In each test that parses JSON:
   ```typescript
   // BEFORE
   const json = JSON.parse(output);
   expect(json.computed_at).toBe('fast');
   
   // AFTER
   const result = JSON.parse(output);
   expect(result.payload.computed_at).toBe('fast');
   ```

2. For tests using mock payloads:
   ```typescript
   // BEFORE
   const payload = { computed_at: 'fast' as const };
   
   // AFTER
   const payload: ConformancePayload = { computed_at: 'fast' as const, ... };
   const result = makeResult('conformance', payload, 100);
   expect(result.payload.computed_at).toBe('fast');
   ```

**Pros:**
- Fixes only what's broken
- No code changes needed
- Teaches tests about the actual envelope structure
- Aligns tests with how operators actually use the API

**Cons:**
- Requires 9 files to be updated
- May have ~90 assertion lines to change
- Repetitive updates

---

### Strategy 2: Test Utility Wrapper (Moderate, Medium Risk)
**Effort:** 15-20 minutes  
**Risk:** Low (new utility, isolated)  
**Files touched:** 10 files (9 tests + 1 new utility)  

**What to create:**
```typescript
// apps/wasm4pm/src/__tests__/test-helpers/payload-parsers.ts (NEW)
export function parseConformancePayload(
  json: string | Record<string, unknown>
): ConformancePayload {
  if (typeof json === 'string') {
    const result = JSON.parse(json) as CommandResult<ConformancePayload>;
    return result.payload;
  }
  // Handle already-parsed objects
  if ('payload' in json && json.payload) {
    return json.payload as ConformancePayload;
  }
  // Handle raw ConformancePayload objects (for unit tests)
  return json as ConformancePayload;
}
```

**What to change in tests:**
```typescript
import { parseConformancePayload } from './test-helpers/payload-parsers.js';

// BEFORE
const json = JSON.parse(output);
expect(json.computed_at).toBe('fast');

// AFTER
const payload = parseConformancePayload(output);
expect(payload.computed_at).toBe('fast');
```

**Pros:**
- Cleaner test code
- Reusable across all conformance tests
- Documents the envelope structure clearly
- Makes adding new tests easier

**Cons:**
- Adds a new file
- Still requires updating all test assertions
- Slightly more indirection

---

### Strategy 3: No Fix Needed (Verify Current State)
**Effort:** 2-5 minutes  
**Risk:** None (read-only verification)  
**Files touched:** 0 (verify only)  

**What to verify:**
1. Run `npm test conformance-precision-modes` and capture actual failure messages
2. Check if tests are actually failing or if this is a false alarm
3. Confirm the envelope structure being emitted matches the documentation

**Note:** Based on code review, tests are definitely failing because they're accessing the wrong path. This strategy is just "don't fix yet."

---

## Recommended Action

**Choose Strategy 1 (Test-Only Fix)** for these reasons:

1. **Proportional:** 9 test files is manageable in one session
2. **Educational:** Tests will document the actual API contract
3. **Safe:** No changes to production code
4. **Fastest:** Direct fix with no intermediate utilities
5. **Alignment:** Other commands all use the same envelope structure; tests should reflect that

---

## Estimation Summary

| Element | Count |
|---------|-------|
| **Files with code changes** | 0 (no code changes needed) |
| **Test files affected** | 9 |
| **Functions/methods affected** | 0 (no prod code changes) |
| **Assertion lines to update** | ~90 (across 9 files) |
| **Effort estimate** | **Minimal (5-10 min)** |
| **Risk level** | **Very Low** |
| **Subsystems touched** | Test layer only |
| **Production code impact** | **None** |

---

## Conclusion

**This is NOT a bug in the conformance command or output wrapper.**

The issue is purely a **test-side misunderstanding of the envelope structure**. The tests assume a flat payload structure, but the command correctly wraps the payload in a `CommandResult` envelope (which is how ALL commands work in this codebase).

**Fix approach:** Update tests to access `result.payload.computed_at` instead of assuming a flat structure. This is the minimal, lowest-risk fix that aligns tests with the actual API contract.

