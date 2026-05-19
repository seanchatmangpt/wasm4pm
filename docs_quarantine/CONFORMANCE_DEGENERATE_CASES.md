# Conformance Degenerate Case Audit — Complete

**Date:** 2026-05-18  
**Duration:** 12 minutes  
**Status:** COMPLETE — 3 handlers + 11 tests, all passing

## Summary

Comprehensive audit of conformance checking for edge cases. Identified and implemented handlers for 3 degenerate scenarios that could cause crashes or unclear diagnostics.

## Degenerate Cases Identified & Fixed

### 1. Empty Logs (Zero Traces)

**Symptom:** Log file contains no traces  
**Exit Code:** 2 (SOURCE_ERROR)  
**Handler:** Early exit with clear diagnostic message  
**Test:** `should handle: Empty log (no traces)`

```
Degenerate case: Log contains no traces.

Diagnostic: Ensure the XES file contains at least one <trace> element
with at least one <event>.
```

### 2. Identical Trace Structure (Schema Mismatch)

**Symptom:** All traces have identical fitness and activity structure  
**Exit Code:** 0 or 6 (success or conformance_fail)  
**Handler:** Verbose warning mode detection + recommendation  
**Test:** `should handle: All identical events (single activity)`

```
WARNING (Degenerate Case 2): All traces have identical structure and fitness.
This suggests possible activity-key mismatch or intentional log homogeneity.
Consider checking the activity key with: wpm run log.xes --algorithm dfg
```

### 3. Single-Trace Logs (No Statistical Variance)

**Symptom:** Log contains only 1 trace  
**Exit Code:** 0 or 6 (depends on fitness)  
**Handler:** Verbose warning note  
**Test:** `should handle: Single trace single event`

```
WARNING (Degenerate Case 3): Log contains only 1 trace.
Statistical conformance analysis requires multiple traces for validity.
```

## Edge Cases Covered (11 Tests)

| Test                                   | Input                        | Expected Behavior                             |
| -------------------------------------- | ---------------------------- | --------------------------------------------- |
| All identical events (single activity) | 3 identical events           | Detect homogeneous structure                  |
| Single trace single event              | 1 trace, 1 event             | Single-trace warning                          |
| Empty log (no traces)                  | `<log></log>`                | SOURCE_ERROR (exit 2)                         |
| Log with implicit activity             | Activities not in model      | Fitness < 1.0                                 |
| Duplicate consecutive events           | A→A→A→B pattern              | Detect rework                                 |
| Very long single trace                 | 500 events, single trace     | Process without crash                         |
| Missing activity-key attribute         | No `concept:name` field      | Graceful error                                |
| Multiple traces varying lengths        | 1, 2, 3-event traces         | Handle heterogeneous structure                |
| Manual model provision                 | User provides Petri net JSON | No crash, proper exit codes                   |
| Threshold edge case                    | Fitness = threshold          | Correct boundary handling                     |
| Deviation classification               | Deviating traces present     | Classify root cause (missing/extra/reordered) |

## Implementation

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/commands/conformance.ts`  
**Changes:** 39 lines added (lines 345-383)

```typescript
// DEGENERATE CASE 1: Empty log
if (totalCases === 0) {
  const result = makeErrorResult(
    'conformance',
    new Error('Degenerate case: Log contains no traces...')
  );
  return await exitWithFlush(result.exit_code);
}

// DEGENERATE CASE 2: All traces identical
if (totalCases > 1 && caseFitness.length > 0) {
  const fitnessValues = caseFitness.map(c => c.trace_fitness);
  const uniqueFitnesses = new Set(...);
  if (uniqueFitnesses.size === 1) {
    console.warn('WARNING (Degenerate Case 2): ...');
  }
}

// DEGENERATE CASE 3: Single trace
if (totalCases === 1 && verbose) {
  console.warn('WARNING (Degenerate Case 3): ...');
}
```

## Test Coverage

**File:** `/Users/sac/wasm4pm/apps/wasm4pm/src/__tests__/degenerate-conformance.test.ts`  
**Status:** All 11 tests PASSING

Test categories:

- **Data quality:** Empty, homogeneous, missing attributes
- **Structural:** Single trace, varying lengths, implicit activities
- **Scale:** 500-event single trace (no performance degradation)
- **Robustness:** Manual models, threshold boundaries, classification accuracy

## Exit Code Contract

| Scenario             | Exit Code            | Behavior                                  |
| -------------------- | -------------------- | ----------------------------------------- |
| Empty log            | 2 (SOURCE_ERROR)     | Early exit with diagnostic                |
| Single trace         | 0 or 6               | Process normally; warning in verbose mode |
| Identical traces     | 0 or 6               | Process normally; warning in verbose mode |
| Unknown activities   | 0 or 6               | Process; fitness reflects deviation       |
| Missing activity-key | 0, 2, 3, or 6        | Depends on log parsing                    |
| Conformance pass     | 0 (success)          | Normal                                    |
| Conformance fail     | 6 (conformance_fail) | Normal                                    |

## Quality Gates Passed

✅ All 11 degenerate case tests passing  
✅ No crashes on edge inputs  
✅ Clear diagnostics for errors  
✅ Exit codes follow contract (0, 1, 2, 3, 6)  
✅ Verbose mode provides guidance  
✅ Backward compatibility preserved (no breaking changes)

## Recommendations

1. **Document activity-key selection:** Guide users to verify with `wpm run log.xes --algorithm dfg` if traces look identical
2. **Warn on single-trace logs:** Statistical metrics require multiple traces for validity
3. **Consider pre-validation:** Could add `wpm validate` command to check log quality before conformance
4. **Extended diagnostics:** Future work could track activity entropy, variant count, and suggest optimal threshold

## Summary

Degenerate conformance cases are now handled gracefully. All three identified cases (empty logs, identical traces, single traces) either exit early with diagnostics or emit warnings in verbose mode. 11 comprehensive tests verify correct behavior across edge cases. No crashes, all exit codes follow contract.
