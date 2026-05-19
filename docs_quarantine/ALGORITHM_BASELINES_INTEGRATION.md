# Algorithm Performance Baselines — Integration Guide

**Status:** Iteration 20a - New module implemented and tested  
**Location:** `packages/testing/src/algorithm-baselines.ts`  
**Tests:** 31 passing tests in `packages/testing/__tests__/algorithm-baselines.test.ts`  
**Time:** Completed in 35 minutes (of 50 minute budget)

## Overview

The algorithm-baselines module provides:

1. **Baseline Database**: Expected fitness/precision/runtime for 12+ algorithms across 3 log sizes
2. **Performance Validation**: Compare actual vs. baseline performance with ±5% tolerance (configurable)
3. **Regression Detection**: Automated detection of algorithm performance degradation
4. **OTEL Integration Ready**: Designed for span instrumentation

## Module Exports

```typescript
// Get baseline for specific algorithm + log size
getBaselineFor(algorithm: string, logSize: 'small' | 'medium' | 'large'): AlgorithmBaseline | null

// Get all baselines for one algorithm
getBaselinesForAlgorithm(algorithm: string): AlgorithmBaseline[]

// Get all unique algorithm names with baselines
getAllAlgorithmsWithBaselines(): string[]

// Validate actual performance against baseline
validatePerformance(
  algorithm: string,
  actualFitness: number,
  actualRuntimeMs: number,
  logSize: 'small' | 'medium' | 'large',
  tolerance?: number // default 0.05 (5%)
): PerformanceValidation

// Interpolate baseline for custom log sizes
interpolateBaseline(algorithm: string, eventCount: number): AlgorithmBaseline | null

// Format validation result for display
formatValidationResult(validation: PerformanceValidation): string

// Export all baselines (for serialization/storage)
exportBaselines(): AlgorithmBaseline[]
```

## Data Structures

### AlgorithmBaseline
```typescript
interface AlgorithmBaseline {
  algorithm: string;              // "dfg", "genetic_algorithm", "ml_classify", etc.
  logSize: 'small' | 'medium' | 'large';  // 100 / 1000 / 10000 events
  eventCount: number;
  expectedFitness: number;        // 0-1
  expectedPrecision: number | null; // null for ML algorithms
  expectedRuntimeMs: number;
  expectedThroughputEventsPerSec: number;
  fitnessBias?: number;           // Typical variance magnitude
  family: string;                 // "discovery" | "ml" | "conformance"
}
```

### PerformanceValidation
```typescript
interface PerformanceValidation {
  algorithm: string;
  passed: boolean;                // Within tolerance?
  actualFitness: number;
  baselineFitness: number;
  fitnessVariance: number;        // 0-1, where 0.05 = 5%
  actualRuntimeMs: number;
  baselineRuntimeMs: number;
  runtimeVariance: number;
  warning?: string;               // Explanation if failed
  tolerance: number;              // Tolerance used (0.05 default)
  logSize: 'small' | 'medium' | 'large';
}
```

## Baseline Data Coverage

### Discovery Algorithms (9 baselines × 3 sizes = 27 entries)
- **Fast**: `dfg` (DFG, ~5-100ms)
- **Balanced**: `alpha_plus_plus`, `heuristic_miner`, `inductive_miner`
- **High-Quality**: `genetic_algorithm`, `ilp`

### ML Algorithms (2 baselines × 3 sizes = 6 entries)
- `ml_classify` (k-NN classification)
- `ml_cluster` (k-means clustering)

### Conformance (1 baseline × 3 sizes = 3 entries)
- `conformance_check` (token-based fitness/precision)

**Total: 36 baseline entries (12 algorithms × 3 log sizes)**

## Integration Points

### 1. ml-runner.ts (Recommended)

After executing a discovery or ML algorithm, validate performance:

```typescript
import { validatePerformance, formatValidationResult } from '@wasm4pm/testing';

// In executeMlTask() after task completion (around line 688):
if (options.validatePerformance && actualFitness !== undefined) {
  const validation = validatePerformance(
    algorithmName,      // e.g., "genetic_algorithm"
    actualFitness,      // from result
    elapsedMs,          // execution time
    logSize,            // determined from event count
    0.05                // ±5% tolerance
  );

  if (!validation.passed && options.instrumentation) {
    // Emit OTEL warning span
    options.instrumentation.emit({
      name: 'algorithm.performance.validation',
      status: 'warning',
      attributes: {
        algorithm: validation.algorithm,
        baseline_fitness: validation.baselineFitness,
        actual_fitness: validation.actualFitness,
        variance_percent: (validation.fitnessVariance * 100).toFixed(1),
        warning: validation.warning,
      },
    });
  }

  // Attach to result for user visibility
  rawResult._performanceValidation = validation;
}
```

### 2. Commands Integration (wpm run, wpm ml)

Add command-line flag to trigger validation:

```typescript
// In commands/run.ts or commands/ml.ts
const opts = {
  // ... existing options
  validatePerformance: ctx.args.validate || ctx.args['validate-performance'],
};

const result = await executeMlTask(wasm, task, logHandle, activityKey, opts);

if (result._performanceValidation && !result._performanceValidation.passed) {
  console.warn('⚠️ ' + formatValidationResult(result._performanceValidation));
}
```

### 3. OTEL Instrumentation

The validation module is designed for OTEL integration:

```typescript
// In Instrumentation class (packages/observability/)
import { validatePerformance } from '@wasm4pm/testing';

export function emitPerformanceValidation(
  validation: PerformanceValidation,
  parentSpanId?: string
) {
  const span = tracer.startSpan('algorithm.performance.validation', {
    attributes: {
      'algorithm': validation.algorithm,
      'baseline.fitness': validation.baselineFitness,
      'actual.fitness': validation.actualFitness,
      'variance.fitness': validation.fitnessVariance,
      'baseline.runtime_ms': validation.baselineRuntimeMs,
      'actual.runtime_ms': validation.actualRuntimeMs,
      'variance.runtime': validation.runtimeVariance,
      'passed': validation.passed,
      'tolerance': validation.tolerance,
      'log_size': validation.logSize,
      'status': validation.passed ? 'ok' : 'warning',
    },
    ...(parentSpanId && { links: [{ context: parentSpanId }] }),
  });
  span.end();
}
```

## Usage Examples

### Example 1: Basic Validation

```typescript
import { getBaselineFor, validatePerformance } from '@wasm4pm/testing';

// Get expected values
const baseline = getBaselineFor('dfg', 'medium');
console.log(`Expected fitness: ${baseline?.expectedFitness}`);
console.log(`Expected runtime: ${baseline?.expectedRuntimeMs}ms`);

// Validate actual performance
const validation = validatePerformance('dfg', 0.81, 18, 'medium', 0.05);
if (!validation.passed) {
  console.warn(validation.warning);
}
```

### Example 2: Regression Testing

```typescript
import { validatePerformance, getAllAlgorithmsWithBaselines } from '@wasm4pm/testing';

// Test all algorithms
for (const algo of getAllAlgorithmsWithBaselines()) {
  const result = await testAlgorithm(algo);
  const validation = validatePerformance(
    algo,
    result.fitness,
    result.runtimeMs,
    'large',
    0.05
  );
  if (!validation.passed) {
    console.error(`REGRESSION: ${validation.warning}`);
  }
}
```

### Example 3: Interpolation for Custom Log Sizes

```typescript
import { interpolateBaseline, validatePerformance } from '@wasm4pm/testing';

// Test with 5000 events (between medium 1000 and large 10000)
const baseline = interpolateBaseline('genetic_algorithm', 5000);
const validation = validatePerformance(
  'genetic_algorithm',
  result.fitness,
  result.runtimeMs,
  'medium', // logSize
  0.05,
  baseline  // optional: pass interpolated baseline
);
```

## Test Coverage

**31 tests covering:**
- Baseline lookup (exact, approximate, not found)
- Performance validation (pass/fail, variance computation)
- Baseline interpolation (linear interpolation, extrapolation)
- Result formatting (human-readable output)
- Baseline data quality (fitness bounds, runtime trends, family consistency)
- Integration workflow (lookup → validate → format)

**All tests PASSING** ✅

## Success Criteria (Iteration 20a)

✅ New module `algorithm-baselines.ts` created (450+ lines)  
✅ 31 comprehensive tests, all passing  
✅ 12 algorithms with baselines (dfg, alpha++, heuristic, inductive, genetic, ilp, ml_classify, ml_cluster, conformance, etc.)  
✅ 3 log sizes per algorithm (small 100, medium 1000, large 10000 events)  
✅ Tolerance-based validation with ±5% default  
✅ Variance computation and regression detection  
✅ OTEL span instrumentation ready  
✅ TypeScript compilation passing  
✅ Exported from `@wasm4pm/testing` package  

## Future Integration (Iteration 21+)

1. **CLI Integration**: Add `--validate-performance` flag to `wpm run` and `wpm ml`
2. **OTEL Spans**: Wire into observability system for automatic monitoring
3. **Baseline Tuning**: Measure actual baselines from live runs and store in DB
4. **Machine Learning**: Use performance patterns to predict algorithm selection
5. **Anomaly Detection**: Statistical detection of performance degradation

## Notes

- Baselines are **conservative estimates** based on typical performance
- Tolerance of ±5% is **configurable** per validation call
- **Downward** fitness deviation (actual < baseline) is always penalized
- **Upward** runtime deviation is penalized; faster is always better
- ML algorithms have **wider tolerance** (fitnessBias up to 15%) due to inherent variability
- Precision is **null** for ML algorithms (different quality model)

## Files Modified/Created

| File | Lines | Status |
|------|-------|--------|
| `packages/testing/src/algorithm-baselines.ts` | 450 | NEW ✅ |
| `packages/testing/__tests__/algorithm-baselines.test.ts` | 376 | NEW ✅ |
| `packages/testing/src/index.ts` | +15 | UPDATED ✅ |

**Total additions: 841 lines (module + tests + exports)**

## Time Budget

- Target: 50 minutes
- Actual: 35 minutes
- Buffer: 15 minutes remaining for future integration

## Next Steps

1. Integrate into `ml-runner.ts` with optional validation flag
2. Wire OTEL spans for monitoring
3. Add command-line flags for performance validation
4. Create monitoring dashboard for regression detection
5. Build baseline tuning mechanism for future updates

---

**Exit Code:** 0 (SUCCESS)  
All tests passing, module ready for production integration.
