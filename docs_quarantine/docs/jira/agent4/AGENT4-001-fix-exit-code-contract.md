# AGENT4-001: Fix Exit Code Contract

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical (breaks scripts)  
**Effort:** 6 hours  
**Complexity:** Low  
**Type:** Bug Fix  

## Summary

CLI commands are returning wrong exit codes. Lab tests confirm exit code 1 (CONFIG_ERROR) is returned instead of exit code 2 (SOURCE_ERROR) for invalid input files. This breaks all shell scripts and automation.

## Problem Statement

**Lab test failures:**
```
❌ 5.2 missing input file produces exit code 2
   Expected: 2 (SOURCE_ERROR)
   Actual: 1 (CONFIG_ERROR)

❌ 5.3 unknown algorithm produces exit code 2
   Expected: 2 (SOURCE_ERROR)
   Actual: 1 (CONFIG_ERROR)
```

**Current exit code contract:**
```typescript
export const EXIT_CODES = {
  SUCCESS: 0,               // No error
  CONFIG_ERROR: 1,          // Config validation failed
  SOURCE_ERROR: 2,          // Input data invalid (missing file, malformed log)
  EXECUTION_ERROR: 3,       // Algorithm failed
  PARTIAL_FAILURE: 4,       // Some operations succeeded, some failed
  SYSTEM_ERROR: 5,          // Infrastructure failure (WASM not loaded, etc.)
} as const;
```

**Root cause:** Error classification logic is using wrong exit codes. File-not-found errors are being mapped to CONFIG_ERROR instead of SOURCE_ERROR.

## Acceptance Criteria

### 1. Exit Code Mapping
```typescript
function classifyError(error: unknown): number {
  if (error instanceof ConfigValidationError) return EXIT_CODES.CONFIG_ERROR;   // 1
  if (error instanceof FileNotFoundError) return EXIT_CODES.SOURCE_ERROR;       // 2
  if (error instanceof MalformedLogError) return EXIT_CODES.SOURCE_ERROR;       // 2
  if (error instanceof AlgorithmError) return EXIT_CODES.EXECUTION_ERROR;       // 3
  if (error instanceof WasmLoadError) return EXIT_CODES.SYSTEM_ERROR;           // 5
  return EXIT_CODES.SYSTEM_ERROR;  // 5 (unknown)
}
```

### 2. Test Cases (Lab tests must pass)
```bash
# Test 5.2: Missing input file
$ wpm run /nonexistent/log.xes
Expected exit code: 2 (SOURCE_ERROR)

# Test 5.3: Unknown algorithm
$ wpm run --algorithm unknown-algo log.xes
Expected exit code: 2 (SOURCE_ERROR)

# Test 5.4: Invalid config
$ wpm run --timeout invalid log.xes
Expected exit code: 1 (CONFIG_ERROR)

# Test 5.5: WASM not loaded
$ wpm run log.xes (with WASM missing)
Expected exit code: 5 (SYSTEM_ERROR)
```

### 3. Error Messages
Each exit code should have clear message:
```
Exit 1: "Config error: [specific issue]"
Exit 2: "Source error: input file not found or invalid: [path]"
Exit 3: "Execution error: algorithm failed: [reason]"
Exit 5: "System error: WASM module not loaded"
```

## Definition of Done

- ✅ All 5 lab tests (5.2, 5.3, 5.4, 5.5, ...) pass
- ✅ Exit codes match contract for all CLI commands
- ✅ Error messages match exit code (e.g., "Source error: ...")
- ✅ 20+ unit tests covering error classification
- ✅ No breaking changes to CLI API
- ✅ Shell scripts can reliably detect error type via exit code

## Implementation Plan

### Phase 1: Error Classification (2 hours)
1. Update `apps/wasm4pm/src/error-handler.ts`
2. Implement `classifyError()` function
3. Add proper error type detection
4. Write 10 unit tests

### Phase 2: Command Updates (2 hours)
1. Update `apps/wasm4pm/src/commands/run.ts`
2. Ensure exit code is set correctly
3. Test with sample files
4. Write 5 integration tests

### Phase 3: Lab Tests (2 hours)
1. Run full lab test suite: `cd lab && pnpm test`
2. Verify tests 5.2–5.5 pass
3. Debug any remaining failures
4. Write 5 additional regression tests

## Metrics

- Lines of code: ~200
- Files modified: 3 (error-handler.ts, cli.ts, run.ts)
- Test coverage: 20+ tests
- Complexity: Low (straightforward mapping)

## Dependencies

None. This is a pure bug fix.

## Blockers

None. Error types already exist, just need correct mapping.

## Related Issues

- AGENT4-002: CLI commands (all commands must use correct exit codes)
