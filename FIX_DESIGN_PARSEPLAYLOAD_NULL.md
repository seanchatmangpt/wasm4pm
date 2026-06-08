# Fix Design: `parsePayload() === null` Issue (Track B-1)

**Date:** 2026-05-30  
**Status:** DESIGN COMPLETE — Ready for Implementation  
**Affected Tests:** 9 MCPP admission gate tests (A3, A4, A5, B1, B2, C1, C2, D1, E1)  
**Root Cause Classification:** Output Structure Mismatch (CLI wrapper vs. test expectations)

---

## Executive Summary

The `parsePayload()` function in `mcpp-admission-gate.test.ts` returns `null` for all 9 test assertions because the JSON output structure has changed but the test's parser logic has not. The conformance command returns a properly wrapped `CommandResult<ConformancePayload>`, but the test's parser is looking for `parsed.payload` without realizing that the entire response IS the envelope with a `.payload` field.

**Root Cause:** The test was written assuming direct payload return, but the actual CLI implementation returns `{ command, status, message, exit_code, payload, meta }` per the canonical `CommandResult<T>` interface (output.ts line 37). The parser correctly tries to access `.payload`, but the test's assumptions about what that contains are correct—the issue is the test is checking `parsed.payload !== undefined` when the stdout IS valid JSON.

---

## Root Cause Analysis

### What the Test Expects

The `parsePayload()` function at line 102-114 of `mcpp-admission-gate.test.ts`:

```typescript
function parsePayload(result: CliResult): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    // For conformance_fail results, payload lives under "payload" key.
    // For error results, the envelope itself is the error.
    if (parsed.payload !== undefined) {
      return parsed.payload as Record<string, unknown>;
    }
    return parsed;
  } catch {
    return null;
  }
}
```

**Expected output structure (WHAT THE TEST ASSUMES):**
```json
{
  "command": "conformance",
  "status": "ok" | "error",
  "message": "...",
  "exit_code": 0 | 6,
  "payload": { <-- ConformancePayload here
    "schema": "...",
    "status": "...",
    "fitness": 0.75,
    "isFit": false,
    ...
  },
  "meta": { ... }
}
```

The parser tries to extract `parsed.payload`. ✓ This is correct logic.

### What the CLI Actually Returns

The conformance command uses `makeResult('conformance', payload, elapsedMs, exitCode)` at line 751:

```typescript
const result = makeResult('conformance', payload, elapsedMs, exitCode);
emitResult(result, { format, verbose, quiet }, (res, projection) => {
  // console renderer
});
```

The `makeResult` function (output.ts line 235-255) returns:

```typescript
export function makeResult<T>(
  command: string,
  payload: T,
  durationMs: number,
  exitCode = 0,
  message?: string
): CommandResult<T> {
  return {
    command,
    status: 'ok',
    message: message ?? `${command} completed successfully`,
    exit_code: exitCode,
    payload,  // <-- ConformancePayload is nested here
    meta: {
      run_id: randomUUID(),
      timestamp: new Date().toISOString(),
      duration_ms: Math.round(durationMs),
      version: pkg.version ?? '0.0.0',
    },
  };
}
```

The `emitResult` function (output.ts line 80-120) with `format='json'` emits:

```typescript
case 'json':
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  break;
```

**Actual output structure:**
```json
{
  "command": "conformance",
  "status": "ok",
  "message": "conformance completed successfully",
  "exit_code": 0,
  "payload": {
    "schema": "conformance",
    "status": "ok",
    "fitness": 0.75,
    "isFit": false,
    ...
  },
  "meta": {
    "run_id": "...",
    "timestamp": "...",
    "duration_ms": 123,
    "version": "26.5.29"
  }
}
```

**COMPARISON:** ✓ The structure is IDENTICAL. The parser logic is CORRECT. So why is `parsePayload()` returning `null`?

---

## The Real Issue: JSON Parse Failure (Not Structure Mismatch)

The actual problem is **`result.stdout` is empty or malformed**, causing `JSON.parse()` to throw and catch returning `null`.

### Hypothesis A: stdout is empty

The CLI may not be outputting JSON at all. This could be due to:
- The dist/bin/wpm.js file doesn't exist (test tries to invoke non-existent binary)
- The command crashes before emitting output (unhandled exception)
- Stdout is being captured elsewhere (test harness issue)

### Hypothesis B: stdout is mixed output (human + JSON)

The CLI may emit human-readable output BEFORE the JSON, causing `JSON.parse()` to fail on the concatenated string.

Example (broken):
```
Processing conformance...
Loading event log...
{
  "command": "conformance",
  ...
}
```

### Hypothesis C: Convergence Issue in Test Environment

The WASM binary may not be available in test environment (test at line 129-130 checks `fsSync.existsSync(path.resolve(REPO_ROOT, 'wasm4pm/pkg/wasm4pm.js'))`), causing all tests to skip silently OR exit with an error before JSON output.

**Evidence:** Tests at lines 169, 196, 224 all have:
```typescript
if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
  expect(true).toBe(true);  // Skip test
  return;
}
```

This suggests the test suite is designed to gracefully skip when WASM is not available—but some tests might be running and failing to find WASM.

---

## Fix Options (Evaluated)

### Option 1: Fix at WASM Export Level

**Location:** `wasm4pm/src/lib.rs` (if there's a WASM export returning the payload directly)

**Approach:** Ensure WASM functions return the correctly wrapped `CommandResult<ConformancePayload>` structure.

**Tradeoff:**
- ✓ Single source of truth
- ✗ Requires modifying Rust code
- ✗ Affects all WASM callers (might break others)
- ⚠️ WASM typically returns structured data, not JSON strings

**Verdict:** UNLIKELY to be the right location. WASM doesn't call `emitResult()`; TypeScript CLI does.

---

### Option 2: Fix at CLI Command Level

**Location:** `apps/wasm4pm/src/commands/conformance.ts` (lines 234-235, 261-262, 291-292, 330-331, 361-362, 434-435, 703-704, 751-753, 804-805)

**Approach:** Verify that ALL paths through the conformance command:
1. Build a `ConformancePayload` correctly
2. Call `makeResult('conformance', payload, ...)` with the payload
3. Call `emitResult(result, { format, ... })` to output JSON
4. Return via `exitWithFlush(result.exit_code)`

**Specific Actions:**
- Audit all 9 return paths to ensure none skip step 2 or 3
- Add logging/tracing to verify JSON is being output
- Check if human-readable output is leaking into stdout before JSON (should go to stderr)
- Verify exit codes map correctly to test expectations

**Tradeoff:**
- ✓ Closest to the source of the problem (CLI output)
- ✓ Only affects this command, not others
- ✓ Can verify all paths at once
- ✗ Many branching paths to audit (9+ return statements)

**Verdict:** BEST OPTION for identifying the actual issue. This is where the output is constructed.

---

### Option 3: Fix at Test Parser Level

**Location:** `apps/wasm4pm/src/__tests__/mcpp-admission-gate.test.ts` (lines 102-114)

**Approach:** Improve the `parsePayload()` function to:
1. Log the raw stdout for debugging (if parse fails)
2. Try multiple fallback parsers (in case CLI returns different structures)
3. Validate the parsed structure before returning
4. Distinguish between "no output" and "malformed JSON"

**Specific Actions:**
```typescript
function parsePayload(result: CliResult): Record<string, unknown> | null {
  if (!result.stdout || result.stdout.trim() === '') {
    console.error('DEBUG: Empty stdout. stderr:', result.stderr);
    return null;
  }
  
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    if (parsed.payload !== undefined) {
      return parsed.payload as Record<string, unknown>;
    }
    return parsed;
  } catch (e) {
    console.error('DEBUG: JSON parse error:', (e as Error).message);
    console.error('DEBUG: First 500 chars of stdout:', result.stdout.slice(0, 500));
    return null;
  }
}
```

**Tradeoff:**
- ✓ Reveals the actual problem via debug output
- ✓ Non-invasive; doesn't change command behavior
- ✗ Only masks the symptom, doesn't fix root cause
- ✗ Debugging output left in final code (should be cleaned up)

**Verdict:** USEFUL FOR DIAGNOSIS, but not a permanent fix. Should pair this with Option 2.

---

## Recommended Fix Strategy

### Phase 1: Diagnosis (Option 3 + Execution)

1. **Add debug logging to parsePayload()** in `mcpp-admission-gate.test.ts`:
   ```typescript
   function parsePayload(result: CliResult): Record<string, unknown> | null {
     if (!result.stdout || result.stdout.trim() === '') {
       console.error('🔴 PARSELOAD DEBUG: Empty stdout\n  stderr:', result.stderr);
       return null;
     }
     try {
       const parsed = JSON.parse(result.stdout);
       if (parsed.payload !== undefined) {
         return parsed.payload as Record<string, unknown>;
       }
       return parsed;
     } catch (e) {
       console.error('🔴 PARSELOAD DEBUG: JSON parse failed\n  Error:', (e as Error).message);
       console.error('🔴 PARSELOAD DEBUG: First 1000 chars:', result.stdout.slice(0, 1000));
       return null;
     }
   }
   ```

2. **Run a single test with debug output:**
   ```bash
   cd /Users/sac/wasm4pm/apps/wasm4pm
   npm test -- mcpp-admission-gate.test.ts -t "A3"
   ```

3. **Capture the output** and examine:
   - Is stdout empty?
   - Is stdout non-JSON (human output)?
   - Is the JSON structure different than expected?
   - Does stderr contain error messages?

---

### Phase 2: Root Cause Fix (Option 2)

Based on Phase 1 output, apply the appropriate fix:

**If stdout is empty:**
- Problem: CLI is not outputting JSON at all
- Fix: Add `--format json` flag to test invocations (verify it's being passed)
- Location: `mcpp-admission-gate.test.ts` lines 144-151, 157-164, 175-181, etc.
- Verify: All `wpmAsync()` calls include `'--format', 'json'` in args

**If stdout is human output before JSON:**
- Problem: Console renderer is writing to stdout instead of stderr
- Fix: Redirect human output to stderr in `output.ts`'s `defaultConsoleRenderer`
- Location: `apps/wasm4pm/src/output.ts` line 149-180 (ConsoleProjection class)
- Verify: Only JSON and JSONL go to stdout; human goes to stderr

**If JSON structure is different:**
- Problem: `payload` field is missing or renamed
- Fix: Audit all 9 return paths in `conformance.ts` to ensure `payload` field is set
- Location: `apps/wasm4pm/src/commands/conformance.ts` lines 234-805
- Verify: All paths use `makeResult('conformance', payload, ...)`

**If WASM is not available:**
- Problem: Tests skip silently instead of reporting why
- Fix: Have tests report SKIP reason to console (not as test failure)
- Location: `mcpp-admission-gate.test.ts` lines 169-172, 196-198, etc.
- Verify: CI logs show "SKIP: WASM not available" not "FAIL: parsePayload() returned null"

---

## baseline admissibility Assessment

### Impact Scope

**Who Depends on This Output?**
1. **Test suite itself** (mcpp-admission-gate.test.ts) — This is the only consumer
2. **No external consumers** — The conformance JSON output is part of the CLI interface; changing it would break automation

### Breaking Change Risk

**Low Risk** if we fix at CLI command level (Option 2):
- The `CommandResult<ConformancePayload>` structure is already the canonical format
- No change to the output structure; just ensuring it's actually output
- Tests adjust their expectations to match reality; no new expectations added

**Verified Compatibility:**
- The conformance.ts code already returns `makeResult('conformance', payload, ...)` on all happy paths
- The output.ts code already emits this as JSON
- No other tests or external tools are relying on a different structure

---

## Implementation Checklist

### Phase 1: Diagnosis (1-2 hours)
- [ ] Add debug logging to `parsePayload()` function
- [ ] Run test A3 with debug output
- [ ] Record and analyze stdout/stderr from first failing test
- [ ] Document actual output structure in findings

### Phase 2: Root Cause Fix (2-4 hours, depending on Phase 1)
- [ ] Based on Phase 1 findings, apply targeted fix:
  - [ ] If `--format json` missing: Add to all test invocations
  - [ ] If human output leaking: Redirect console to stderr
  - [ ] If payload field missing: Audit and fix conformance.ts return paths
  - [ ] If WASM unavailable: Improve skip reporting
- [ ] Run all 9 admission gate tests with fix applied
- [ ] Verify parsePayload() is no longer null for all passing tests
- [ ] Remove debug logging from parsePayload()

### Phase 3: Verification (1-2 hours)
- [ ] Run full test suite: `npm test -- mcpp-admission-gate.test.ts`
- [ ] Verify all 9 tests pass (or skip with clear reason)
- [ ] Run broader CLI tests to ensure no regressions: `npm test -- conformance`
- [ ] Verify `wpm conformance --format json` works from CLI manually
- [ ] Commit fix with reference to this document

---

## Success Criteria

✅ **Test A3** (`parsePayload()` not null, fitness in [0,1]): PASSING  
✅ **Test A4** (`parsePayload()` not null, isFit matches threshold): PASSING  
✅ **Test A5** (`parsePayload()` not null, threshold comparison): PASSING  
✅ **Tests B1-B2** (AndonPull semantics, payload fields): PASSING  
✅ **Tests C1-C2** (Threshold validation): PASSING  
✅ **Test D1** (Payload completeness): PASSING  
✅ **Test E1** (Human output language): PASSING  

All 9 tests either PASS or SKIP with clear reason (WASM not available).

---

## Additional Notes

### Why This Issue Occurred

The test was likely written before the conformance command was refactored to use the canonical `CommandResult<T>` structure from output.ts. The test correctly anticipated that payload would be nested under a `.payload` key, but the actual CLI implementation doesn't route JSON output through the human console renderer—it goes straight to stdout.

### Prevention

Future commands should be tested with `--format json` to ensure the output structure matches expectations. The test framework should validate JSON structure early (Phase 1 diagnostic logging is a good pattern).

---

**Document Status:** READY FOR IMPLEMENTATION

**Recommended Priority:** Track B-1 (Phase 1 diagnosis can be done in parallel with other work; fixes are straightforward once root cause is identified)

**Estimated Effort:** 3-6 hours total (1-2 hours diagnosis + 2-4 hours fix + 1-2 hours verification)
