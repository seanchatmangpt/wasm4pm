# lab/ Development Guide

This guide explains how to extend the lab validation system with new conformance tests.

## Architecture Overview

The lab system consists of three layers:

1. **Harness** (`harness.ts`)
   - Installs published wasm4pm from npm
   - Captures artifact metadata
   - Runs conformance tests
   - Generates reports

2. **Validation Entry Point** (`validate.ts`)
   - Parses command-line arguments
   - Orchestrates validation workflow
   - Invokes tests from the harness
   - Compares against baselines

3. **Reporting** (`report.ts`)
   - Formats validation reports for humans
   - Tracks regression detection
   - Compares sequential runs

## Adding Conformance Tests

Conformance tests are defined using the `ConformanceTest` interface in `harness.ts`:

```typescript
interface ConformanceTest {
  name: string;              // Human-readable test name
  category: string;          // Test category (algorithms, performance, etc.)
  claim: string;             // Public claim being validated
  timeout?: number;          // Optional timeout in ms (default: 30000)
  observable: () => Promise<any>;  // Function that produces the observable behavior
  assert: (result: any) => {  // Function that checks if behavior matches claim
    passed: boolean;
    details?: Record<string, any>;
  };
}
```

## Example: Algorithm Test

Create a new file `tests/algorithm-tests.ts`:

```typescript
import { ConformanceTest, createTest } from "../harness";
import path from "path";
import fs from "fs";

export const algorithmTests: ConformanceTest[] = [
  createTest({
    name: "DFG Algorithm",
    category: "algorithms",
    claim: "Directly-Follows Graph (0.5ms/100 events)",
    timeout: 5000,
    observable: async () => {
      // 1. Load published wasm4pm
      const pm = await import("wasm4pm");
      
      // 2. Load test log
      const logPath = path.join(__dirname, "../fixtures/sample-100-events.json");
      const logData = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      
      // 3. Run algorithm and measure time
      const startTime = performance.now();
      const log = pm.EventLog.fromJSON(logData);
      const dfg = pm.discoverDFG(log);
      const duration = performance.now() - startTime;
      
      return {
        dfg,
        duration,
        activities: dfg.activities.length,
        edges: dfg.edges.length,
      };
    },
    assert: (result) => {
      // Check observable properties
      const passed = 
        result.dfg !== null &&
        result.activities > 0 &&
        result.edges > 0 &&
        result.duration < 1.0;  // Should be < 1ms (allowing variance)
      
      return {
        passed,
        details: {
          duration_ms: result.duration,
          activities: result.activities,
          edges: result.edges,
        },
      };
    },
  }),
];
```

## Example: Performance Test

```typescript
createTest({
  name: "Genetic Algorithm Performance",
  category: "performance",
  claim: "40ms/100 events",
  timeout: 10000,
  observable: async () => {
    const pm = await import("wasm4pm");
    
    // Generate larger log for realistic measurement
    const log = generateLargeLog(100);  // 100 events
    
    const startTime = performance.now();
    const model = pm.discoverGenetic(log, {
      generations: 10,
      populationSize: 10,
    });
    const duration = performance.now() - startTime;
    
    return { model, duration };
  },
  assert: (result) => {
    const threshold = 50.0;  // Allow 50ms (claim was 40ms)
    return {
      passed: result.duration < threshold,
      details: {
        duration_ms: result.duration,
        threshold_ms: threshold,
        overhead_percent: ((result.duration - 40) / 40) * 100,
      },
    };
  },
})
```

## Example: Conformance Test

```typescript
createTest({
  name: "Token Replay Fitness",
  category: "conformance",
  claim: "Token replay with fitness metrics",
  observable: async () => {
    const pm = await import("wasm4pm");
    
    const log = pm.EventLog.fromJSON(loadLog("sample-100-events.json"));
    const model = pm.discoverDFG(log);  // Get a model
    
    // Check conformance
    const result = pm.checkConformance(log, model);
    
    return result;
  },
  assert: (result) => {
    const hasMetrics = 
      result.fitness !== undefined &&
      result.precision !== undefined &&
      Array.isArray(result.traces);
    
    return {
      passed: hasMetrics && result.fitness >= 0 && result.fitness <= 1,
      details: {
        fitness: result.fitness,
        precision: result.precision,
      },
    };
  },
})
```

## Example: Import/Export Test

```typescript
createTest({
  name: "XES Import",
  category: "io",
  claim: "Support XES log format",
  observable: async () => {
    const pm = await import("wasm4pm");
    
    const xesPath = path.join(__dirname, "../fixtures/sample-xes-1.0.xes");
    const xesContent = fs.readFileSync(xesPath, "utf-8");
    
    // Load from XES
    const log = pm.EventLog.fromXES(xesContent);
    
    return {
      log,
      eventCount: log.events.length,
      traceCount: log.traces.length,
    };
  },
  assert: (result) => {
    return {
      passed: 
        result.log !== null &&
        result.eventCount === 12 &&  // Expected from fixture
        result.traceCount === 3,
    };
  },
})
```

## Integrating Tests into Validation

Tests are integrated by importing them in `validate.ts`:

```typescript
import { algorithmTests } from "./tests/algorithm-tests";
import { performanceTests } from "./tests/performance-tests";
import { conformanceTests } from "./tests/conformance-tests";
import { ioTests } from "./tests/io-tests";
import { analyticsTests } from "./tests/analytics-tests";

const allTests = [
  ...algorithmTests,
  ...performanceTests,
  ...conformanceTests,
  ...ioTests,
  ...analyticsTests,
];

// Filter by category if specified
const testsToRun = options.category
  ? allTests.filter(t => t.category === options.category)
  : allTests;

// Run tests
await runner.runTests(testsToRun);
```

## Test Categories

Tests should be organized by category:

- **algorithms** - Algorithm registration and basic functionality
- **performance** - Timing claims from README
- **conformance** - Conformance checking features
- **io** - Import/export formats (XES, JSON, PNML, DECLARE, OCEL)
- **analytics** - Analytics functions (20+ functions expected)

## Running Tests Locally

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run all tests
npm run validate

# Run specific category
npm run validate:algorithms
npm run validate:performance

# With verbose output
npm run validate:verbose

# Generate detailed report
npm run validate:full
```

## Debugging Tests

Enable verbose logging to see detailed output:

```bash
npm run validate:verbose
```

Add console.log() to test observables:

```typescript
observable: async () => {
  const pm = await import("wasm4pm");
  console.log("Loading log...");
  const log = pm.EventLog.fromJSON(loadLog());
  console.log("Running algorithm...");
  const result = pm.discoverDFG(log);
  console.log("Result:", result);
  return result;
}
```

## Common Patterns

### Loading Test Data
```typescript
function loadLog(filename: string) {
  const path = require("path");
  const fs = require("fs");
  const filePath = path.join(__dirname, "../fixtures", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
```

### Measuring Performance
```typescript
const startTime = performance.now();
// ... operation ...
const duration = performance.now() - startTime;
```

### Asserting on Metrics
```typescript
assert: (result) => {
  const tolerance = 0.1;  // 10% variance acceptable
  const expected = 40;
  const actual = result.duration;
  const variance = Math.abs(actual - expected) / expected;
  
  return {
    passed: variance < tolerance,
    details: { expected, actual, variance },
  };
}
```

## Best Practices

1. **Name tests clearly** - Test names should describe what's being validated
2. **Document claims** - Always include the public claim being tested
3. **Handle errors gracefully** - Tests should not crash, return clear error messages
4. **Use fixtures** - Load test data from `fixtures/` not hardcoded values
5. **Measure precisely** - Use `performance.now()` not `Date.now()`
6. **Assert meaningfully** - Check not just success but observable properties
7. **Include details** - Return details from assert() for debugging
8. **Respect timeouts** - Don't make tests unreasonably slow
9. **Test edge cases** - Include tests for empty logs, single events, etc.
10. **Update baseline** - After release, update `expected-results.json`

## Updating Baselines

After a release, update expected results:

```bash
# Capture new baseline
npm run validate > baseline-output.txt

# Review changes
cat baseline-output.txt

# Manually update fixtures/expected-results.json
# Document what changed and why
```

## Regression Detection

The harness compares results to baselines in `fixtures/expected-results.json`:

- Test added → Noted as new test
- Status changed → Flagged as regression
- Test removed → Noted as removed test

Check regression output in the validation report.

---

**Last Updated**: April 2026
**Status**: Framework ready for test implementation
