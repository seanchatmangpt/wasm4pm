# AGENT3-001: Wire SHACL Validator Into CLI

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical  
**Effort:** 8 hours  
**Complexity:** Low  
**Type:** Integration  

## Summary

Agent 3 (SHACL Validation) created a comprehensive validator but it's **standalone** — not integrated into the CLI execution pipeline. Invalid DFG/Petrinet models can be returned to users without validation, violating Chicago TDD doctrine.

## Problem Statement

Current state:
- ✅ SHACL validator implemented (`wasm4pm/src/validate-shacl.mjs`)
- ✅ 35 tests passing
- ❌ NOT called during algorithm execution
- ❌ Validation is **optional**, not enforced
- ❌ Invalid results bypass checks

Users experience:
- ❌ Receive invalid DFG graphs (impossible edges, disconnected nodes)
- ❌ No validation error messages
- ❌ Silent failures (incorrect models used downstream)
- ❌ Van der Aalst doctrine violated (event log ≠ discovered model)

## Acceptance Criteria

### 1. Validation Gate in Kernel
```typescript
// packages/kernel/src/api.ts
export async function run(
  algorithmName: string,
  logHandle: string,
  activityKey: string,
  parameters?: Record<string, unknown>
): Promise<ValidatedResult> {
  // 1. Run algorithm
  const rawResult = await kernel.run(algorithmName, logHandle, activityKey, parameters);
  
  // 2. VALIDATE RESULT (NEW)
  const validation = await validator.validateResult(algorithmName, rawResult);
  if (!validation.valid) {
    throw new ValidationError(
      `Algorithm ${algorithmName} produced invalid model`,
      validation.violations
    );
  }
  
  // 3. Return validated result
  return { ...rawResult, validated: true };
}
```

### 2. Validation Error Contract
```typescript
export class ValidationError extends Error {
  violations: ViolationReport[];
  algorithmName: string;
  severity: 'warning'|'error';
  
  constructor(msg: string, violations: ViolationReport[]) {
    super(msg);
    this.violations = violations;
  }
}

export interface ViolationReport {
  rule: string;             // E.g., "dfg-node-reachability"
  severity: 'warning'|'error';
  message: string;
  path?: string;            // JSON path to invalid element
  context?: Record<string, unknown>;
}
```

### 3. CLI Error Handling
```typescript
// apps/wasm4pm/src/cli.ts
try {
  const result = await kernel.run(...);
  return { status: 'ok', data: result };
} catch (error) {
  if (error instanceof ValidationError) {
    return {
      status: 'error',
      code: EXIT_CODES.EXECUTION_ERROR,  // 3
      message: `Model validation failed: ${error.message}`,
      violations: error.violations.map(v => ({
        rule: v.rule,
        severity: v.severity,
        message: v.message
      }))
    };
  }
  // ... other error handling
}
```

### 4. Test Coverage
- ✅ Validator fires on invalid DFG (disconnected nodes)
- ✅ Validator fires on invalid Petrinet (missing source)
- ✅ Validator allows valid results
- ✅ Error messages are actionable
- ✅ Exit code is correct (3, EXECUTION_ERROR)

## Definition of Done

- ✅ Validator integrated into `kernel.run()`
- ✅ ValidationError thrown on invalid results
- ✅ CLI catches and reports errors properly
- ✅ Exit code contract maintained (exit 3 on validation failure)
- ✅ 5+ integration tests
- ✅ No breaking changes to existing API
- ✅ Error messages include which rule failed

## Implementation Plan

### Phase 1: Kernel Integration (4 hours)
1. Import SHACL validator into `packages/kernel/src/api.ts`
2. Add validation gate after `kernel.run()`
3. Throw `ValidationError` on invalid results
4. Wire into all discovery algorithm entry points
5. Write 3 integration tests

### Phase 2: CLI Error Handling (2 hours)
1. Update error handler in `apps/wasm4pm/src/cli.ts`
2. Map `ValidationError` → exit code 3
3. Format violation reports for human output
4. Write 2 CLI integration tests

### Phase 3: Testing (2 hours)
1. Create fixtures: valid DFG, invalid DFG, valid Petrinet, invalid Petrinet
2. Test CLI end-to-end: `wpm run --invalid-log.xes` → exit 3 with clear message
3. Verify exit code contract

## Metrics

- Lines of code: ~300
- Files modified: 3 (api.ts, cli.ts, error-handling.ts)
- Test coverage: 5+ integration tests
- Complexity: Low (plumbing, not logic)

## Dependencies

- `wasm4pm/src/validate-shacl.mjs` (already exists)
- `@wasm4pm/kernel` (existing)
- No new npm dependencies

## Blockers

None. SHACL validator already implemented and tested.

## Related Issues

- AGENT9-002: OTEL instrumentation (log validation failures)
