# Track B-1 Diagnosis: parsePayload() JSON Envelope Mismatch

**Issue:** 9 failing admission-gate tests with symptom `parsePayload(result) === null`

**Date:** 2026-05-30

---

## Executive Summary

The `parsePayload()` function in the test suite correctly expects a JSON envelope with a `payload` property. However, **JSON parsing is failing silently**, returning `null` when:

1. `result.stdout` is empty or malformed
2. `result.stdout` contains non-JSON text
3. `emitResult()` is not being called before the process exits

The root cause is likely in the **conformance command's flow**, not the envelope structure itself.

---

## 1. parsePayload() Implementation

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/__tests__/mcpp-route-conformance.test.ts:100-107`

```typescript
function parsePayload(result: CliResult): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    return (parsed.payload as Record<string, unknown>) ?? parsed;
  } catch {
    return null;  // ← Returns null if JSON.parse() throws
  }
}
```

**How it works:**
1. Attempts to parse `result.stdout` as JSON
2. Extracts the `payload` property from the parsed object
3. Falls back to entire object if `payload` is null/undefined
4. Returns `null` only if `JSON.parse()` throws an exception

**What triggers null return:**
- `result.stdout === ''` (empty string) → `JSON.parse('')` throws SyntaxError
- `result.stdout` contains non-JSON text → `JSON.parse()` throws SyntaxError
- `result.stdout` is `null` or undefined → type error

---

## 2. Expected JSON Envelope Structure (CommandResult)

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/output.ts:37-58`

**Interface definition:**
```typescript
export interface CommandResult<T = unknown> {
  readonly command: string;           // e.g. "trace conform"
  readonly status: 'ok' | 'error';
  readonly message: string;           // Human-readable summary
  readonly exit_code: number;         // EXIT_CODES value
  readonly payload: T;                // ← parsePayload() extracts this
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly remediation?: string;
    readonly didYouMean?: string;
    readonly docsUrl?: string;
    readonly alternatives?: string[];
  };
  readonly meta: {
    readonly run_id: string;          // UUID v4
    readonly timestamp: string;       // ISO-8601
    readonly duration_ms: number;
    readonly version: string;
  };
}
```

**Example output (formatted for readability):**
```json
{
  "command": "trace conform",
  "status": "ok",
  "message": "trace conform completed successfully",
  "exit_code": 0,
  "payload": {
    "route_id": "test-route",
    "fitness": 1.0,
    "precision": 1.0,
    "required_stage_coverage": 1.0,
    "receipt_coverage": 1.0,
    "object_lifecycle_validity": 1.0,
    "observed_count": 3,
    "verdict": "Accepted",
    "andon_reason": null,
    "details": [
      {
        "dimension": "object_evidence_present",
        "ok": true,
        "detail": "All events have object evidence"
      }
    ],
    "out": "none"
  },
  "meta": {
    "run_id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-05-30T10:45:32.123Z",
    "duration_ms": 42,
    "version": "26.5.29"
  }
}
```

---

## 3. How trace conform Builds the Result

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/commands/trace.ts:1644-1653`

**Success path (conformance.verdict === "Accepted" or "AndonPull"):**

```typescript
const result = makeResult(
  'trace conform',
  {
    ...conformance,                    // Spreads ConformanceResult fields
    observed_count: ocelLog.ocel_events.length,
    out: outPath ?? 'none',
  },
  performance.now() - t0,
  exitCode
);

emitResult(result, { format, verbose, quiet }, (res, p) => {
  // Custom console renderer for human-readable output
  // (only executed when format !== 'json')
});

return exitWithFlush(exitCode);
```

**makeResult() signature** (output.ts:178-198):
```typescript
export function makeResult<T>(
  command: string,
  payload: T,              // ← The conformance data
  durationMs: number,
  exitCode = 0,
  message?: string
): CommandResult<T> {
  return {
    command,
    status: 'ok',
    message: message ?? `${command} completed successfully`,
    exit_code: exitCode,
    payload,                // ← Directly assigned (NOT nested)
    meta: {
      run_id: randomUUID(),
      timestamp: new Date().toISOString(),
      duration_ms: Math.round(durationMs),
      version: pkg.version ?? '0.0.0',
    },
  };
}
```

**Result object structure:** The `makeResult()` function returns an object with:
- `payload` property at the top level (NOT nested)
- `payload` contains the conformance result

---

## 4. emitResult() JSON Output Path

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/output.ts:80-120`

**JSON output implementation** (lines 89-94):
```typescript
switch (options.format) {
  case 'json':
    // Machine-readable JSON is always emitted when requested — even with --quiet.
    // Hooks (e.g. stop-proof-gate.sh) rely on `wpm … --format json --quiet`.
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    break;
  // ... other cases ...
}
```

**What gets written to stdout:**
1. The entire `CommandResult<T>` object is serialized with `JSON.stringify()`
2. Pretty-printed with 2-space indentation
3. Written to `process.stdout` with a trailing newline
4. Contains the `payload` property at the top level

---

## 5. Error Paths (makeErrorResult)

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/commands/trace.ts:1523-1600`

**Error output example** (when file is missing):
```typescript
const r = makeErrorResult(
  'trace conform',
  `Input file not found: ${inputPath}`,
  EXIT_CODES.source_error,  // exit code 2
  'FILE_NOT_FOUND'
);
emitResult(r, { format, verbose, quiet });
return exitWithFlush(EXIT_CODES.source_error);
```

**makeErrorResult() signature** (output.ts:233-268):
```typescript
export function makeErrorResult(
  command: string,
  err: unknown,
  exitCode: number,
  code = 'COMMAND_ERROR',
  remediation?: string
): CommandResult<null> {
  // ... error processing ...
  return {
    command,
    status: 'error',
    message,
    exit_code: exitCode,
    payload: null,           // ← Error results have null payload
    error: {
      code: structuredHint?.code || code,
      message,
      remediation: finalRemediation,
      // ... other error fields ...
    },
    meta: { /* ... */ },
  };
}
```

**Error result structure:**
```json
{
  "command": "trace conform",
  "status": "error",
  "message": "Input file not found: /path/to/missing.json",
  "exit_code": 2,
  "payload": null,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Input file not found: /path/to/missing.json",
    "remediation": "Check the file path and try again"
  },
  "meta": { /* ... */ }
}
```

---

## 6. Failure Analysis: Why parsePayload(result) === null

### Root Cause: JSON.parse() Throws

The **only way** `parsePayload()` returns `null` is if `JSON.parse(result.stdout)` throws:

```typescript
try {
  const parsed = JSON.parse(result.stdout);  // ← Throws SyntaxError
  // ...
} catch {
  return null;  // ← This is only way to get null
}
```

### Failure Modes

**FAILURE A: result.stdout is empty string**
- Cause: Command exits without calling `emitResult()`
- Evidence: `stdout` capture shows `''`
- JSON.parse error: `SyntaxError: Unexpected end of JSON input`

**FAILURE B: result.stdout contains non-JSON text**
- Cause: Command outputs plain text error or stack trace instead of JSON
- Evidence: `stdout` starts with `Error:` or `TypeError:` etc.
- JSON.parse error: `SyntaxError: Unexpected token...`

**FAILURE C: result.stdout is null/undefined**
- Cause: `wpmAsync()` doesn't capture stdout correctly
- Evidence: `result.stdout` is falsy
- JSON.parse error: `TypeError: Cannot read properties...`

### Why parsePayload() Doesn't Fail on null payload

The fallback chain in `parsePayload()` is important:

```typescript
return (parsed.payload as Record<string, unknown>) ?? parsed;
```

- If `parsed.payload` is `null`, then `null ?? parsed` → returns `parsed`
- If `parsed` is an object, returns the entire object (works)
- Only returns `null` if BOTH conditions fail:
  1. `JSON.parse()` throws (most likely)
  2. OR `parsed` and `parsed.payload` are both falsy (very unlikely)

---

## 7. Suspected Bug Location

The 9 failing tests all follow this pattern:

1. **Line 374-380 (C2):** CLI with missing stage
2. **Line 432-453 (C3):** CLI with out-of-order stages
3. **Line 487-512 (C4):** CLI with fake route (no objects)
4. **Line 548-572 (C5):** CLI with agent-proof-lifecycle fixture
5. **Lines 266-288, 290-326, 783-803, 836-860:** Additional CLI tests

**Common pattern:**
```typescript
const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);
// ...
const payload = parsePayload(result);
expect(payload).not.toBeNull();  // ← FAILS: payload === null
```

**Likely causes:**
1. `result.stdout` is empty (command doesn't output JSON)
2. `result.stdout` contains error text (command crashes or returns early)
3. `--format json` flag not recognized or processed correctly
4. `exitWithFlush()` exits before `emitResult()` is called

---

## 8. Diagnostic Steps

### Step 1: Verify Envelope Structure
The envelope structure is **correct** as defined in `output.ts:37-58`. The test expects:
- Top-level `payload` property (not nested)
- `payload` contains ConformanceResult data
- Fallback to entire object if `payload` is missing

### Step 2: Check emitResult() JSON Output
**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/output.ts:89-94`

The JSON output is generated correctly:
```typescript
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
```

### Step 3: Investigate Conformance Command Flow
**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/commands/trace.ts:1512-1717`

The suspect area is the sequence:
1. Parse inputs and run `checkPowl2Conformance()`
2. Call `makeResult()` to build `CommandResult<ConformanceResult>`
3. Call `emitResult()` with `--format json`
4. Call `exitWithFlush(exitCode)`

**Check if:**
- `emitResult()` is always called before `exitWithFlush()`
- `--format` flag is correctly parsed (line 1514: `ctx.args.format`)
- Error paths also call `emitResult()` before exiting
- No early returns that skip `emitResult()` call

### Step 4: Test Manually
```bash
cd /Users/sac/wasm4pm

# Create test files
echo '{"ocel_version":"2.0","ocel_global_log":{"ocel_attribute_names":[]},"ocel_events":[{"event_id":"e0","activity":"test","timestamp":"2026-05-30T00:00:00Z","objects":[],"attributes":{}}],"ocel_objects":[]}' > /tmp/test.ocel.json

echo '{"route_id":"test","type":"powl2","required_stages":["test"],"model":{"type":"sequence","sequence":["test"]}}' > /tmp/test.powl.json

# Run with JSON output
node apps/wasm4pm/dist/bin/wpm.js trace conform -m /tmp/test.powl.json -i /tmp/test.ocel.json --format json 2>&1

# If stdout is empty or not JSON, that's the bug
```

---

## 9. Key File Locations Summary

| File Path | Purpose | Critical Lines |
|-----------|---------|-----------------|
| `apps/wasm4pm/src/__tests__/mcpp-route-conformance.test.ts` | Test suite | 100-107 (parsePayload), 290-326 (C1 test) |
| `apps/wasm4pm/src/commands/trace.ts` | Conformance command | 1512-1717 (conform subcommand), 1644-1653 (result building) |
| `apps/wasm4pm/src/output.ts` | Output formatting | 37-58 (CommandResult), 80-120 (emitResult), 178-198 (makeResult) |
| `apps/wasm4pm/src/otel/exit.ts` | Process exit handler | ← Check if `exitWithFlush()` suppresses output |

---

## 10. Verdict

**The JSON envelope structure is CORRECT.**

The issue is not with the envelope definition, but with **command execution flow**. The conformance command is either:

1. ❌ Not outputting JSON to stdout (empty result.stdout)
2. ❌ Outputting error text instead of JSON (malformed stdout)
3. ❌ Exiting before `emitResult()` is called
4. ❌ Not recognizing `--format json` flag correctly

**Next steps:**
1. Add debugging to `trace.ts:conform` command to log `format` flag value
2. Verify `emitResult()` is called in ALL code paths (success and error)
3. Check `exitWithFlush()` doesn't suppress stdout
4. Run manual test to confirm JSON is written to stdout

---

## Appendix: parsePayload() Logic Flow

```
Call: parsePayload(result)
  ↓
result.stdout === "" ?
  ├─ YES → JSON.parse("") → SyntaxError → CATCH → return null ✓
  └─ NO → continue
  ↓
JSON.parse(result.stdout) → parsed
  ├─ SUCCESS → continue
  └─ ERROR → CATCH → return null ✓
  ↓
parsed.payload !== null/undefined ?
  ├─ YES → return parsed.payload ✓
  └─ NO → return parsed (fallback) ✓
```

**Both success paths return a truthy value:**
- If `payload` exists and is an object → returns payload
- If `payload` is null → returns fallback object
- Only returns null if JSON.parse threw an exception
