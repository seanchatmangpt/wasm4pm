# pictl Testing Fixtures API Reference

**Version:** 1.0  
**Package:** `@pictl/testing`  
**Last Updated:** 2026-04-10

Complete API reference for the pictl testing fixtures ecosystem. Fixtures provide reusable components for algorithm validation, determinism verification, CLI testing, and observability assertion.

---

## Overview

Testing fixtures are specialized utilities that enable consistent, reliable testing patterns across the pictl codebase. They abstract common testing tasks and enforce best practices around evidence collection, state validation, and boundary crossing.

### When to Use Fixtures

- **Algorithm verification:** Validate determinism and explain/run parity
- **CLI integration testing:** Run commands, capture output, assert exit codes
- **Observability testing:** Capture OTEL spans and events, verify attributes
- **Certification gates:** Pre-release quality assurance with pluggable validators
- **Event log validation:** XES format compliance and schema conformance
- **Process model verification:** Petri net soundness, process tree validation, DFG analysis

### Core Philosophy

> The easiest path to passing tests must be real execution. Faking evidence must be harder than crossing the actual boundary.

Fixtures enforce this by:
- Requiring **real boundary crossing** (not mocks or stubs)
- Capturing **unforgeable evidence** (OTel spans, file state, receipt chains)
- Validating **causality**, not just assertions
- Corroborating across **multiple surfaces** (execution, telemetry, state, process)

---

## Parity Verification

### Purpose

The **Parity Checker** verifies that `explain()` output describes exactly the steps that `plan()` executes. This ensures planning clarity and honesty.

### Invariant

For any configuration, the set of steps and their order must match between:
- **Explain phase:** Human-readable plan description
- **Plan/execution phase:** Actual runtime steps

### API Reference

#### `checkParity(planner, config)`

Compares explain output with actual plan steps for a single configuration.

**Parameters:**
- `planner: PlannerLike` — Object with `explain(config)` and `plan(config)` methods
- `config: unknown` — Configuration to test

**Returns:** `Promise<ParityResult>`

**Signature:**
```typescript
interface PlanStep {
  id: string;
  type: string;
  description: string;
  required?: boolean;
  parameters?: Record<string, unknown>;
  dependsOn?: string[];
}

interface ExecutionPlan {
  id: string;
  hash: string;
  steps: PlanStep[];
}

interface PlannerLike {
  plan(config: unknown): Promise<ExecutionPlan> | ExecutionPlan;
  explain(config: unknown): string;
}

interface ParityResult {
  passed: boolean;
  config: unknown;
  explainSteps: string[];        // Step types from explain text
  runSteps: string[];            // Step types from actual plan
  missingFromExplain: string[];  // Steps run but not explained
  missingFromRun: string[];      // Steps explained but not run
  orderMismatch: boolean;        // Steps out of order?
  details: string;               // Human-readable summary
}
```

**Example:**
```typescript
import { checkParity } from '@pictl/testing';

const myPlanner = {
  explain(config) {
    return 'Will: parse input, validate schema, discover DFG, write output';
  },
  async plan(config) {
    return {
      id: 'plan-1',
      hash: 'abc123',
      steps: [
        { id: 's1', type: 'parse_input', description: 'Parse source' },
        { id: 's2', type: 'validate_schema', description: 'Check schema' },
        { id: 's3', type: 'discover_dfg', description: 'Discover DFG' },
        { id: 's4', type: 'write_output', description: 'Write result' },
      ],
    };
  },
};

const result = await checkParity(myPlanner, { algorithm: 'dfg' });
console.log(result.passed);        // true if steps match
console.log(result.details);       // "Parity verified: 4 steps match"
console.log(result.orderMismatch); // false if order is correct
```

#### `checkParityBatch(planner, configs)`

Runs parity check across multiple configurations.

**Parameters:**
- `planner: PlannerLike` — Same as above
- `configs: unknown[]` — Array of configurations to test

**Returns:** `Promise<{ results: ParityResult[]; allPassed: boolean; summary: string }>`

**Example:**
```typescript
const testConfigs = [
  { algorithm: 'dfg', profile: 'fast' },
  { algorithm: 'inductive', profile: 'balanced' },
  { algorithm: 'genetic', profile: 'quality' },
];

const { results, allPassed, summary } = await checkParityBatch(myPlanner, testConfigs);

if (!allPassed) {
  for (const result of results) {
    if (!result.passed) {
      console.error(`Parity failed for config:`, result.config);
      console.error(`Missing from explain: ${result.missingFromExplain.join(', ')}`);
      console.error(`Missing from run: ${result.missingFromRun.join(', ')}`);
    }
  }
}
```

### Failure Diagnosis

**Failure:** `missingFromExplain = ['parse_input', 'validate_schema']`  
→ Explanation skipped steps that were actually executed. **Explain is incomplete.**

**Failure:** `missingFromRun = ['cleanup', 'metrics']`  
→ Explanation promised steps that never executed. **Plan is incomplete or buggy.**

**Failure:** `orderMismatch = true`  
→ Steps are out of order. **Check dependency resolution and scheduling.**

---

## Determinism Validation

### Purpose

The **Determinism Validator** verifies that given identical input (config + event log), the algorithm produces byte-identical output (modulo timestamp and run-ID fields).

### Invariant

For deterministic algorithms:
- **Stable fields** (algorithm parameters, results) must be identical across runs
- **Unstable fields** (timestamps, run IDs) may vary between runs
- Deterministic hash must be identical after stripping unstable fields

### API Reference

#### `checkDeterminism(producer, iterations)`

Runs the same computation multiple times and verifies stable output.

**Parameters:**
- `producer: () => Promise<Record<string, unknown>>` — Function that produces a receipt/result
- `iterations: number` — Number of times to run (default: 5)

**Returns:** `Promise<DeterminismResult>`

**Signature:**
```typescript
interface DeterminismResult {
  passed: boolean;
  iterations: number;
  stableFields: string[];   // Fields identical across runs
  unstableFields: string[]; // Fields that vary (timestamps, etc.)
  hashes: string[];         // Stable hash from each iteration
  details: string;          // Human-readable summary
}
```

**Example:**
```typescript
import { checkDeterminism } from '@pictl/testing';

const result = await checkDeterminism(async () => {
  const receipt = await algorithm.process(inputConfig, eventLog);
  return receipt;
}, 5);

if (!result.passed) {
  console.error('Non-deterministic output detected');
  console.error(`Unique hashes: ${new Set(result.hashes).size}/${result.iterations}`);
  console.error(`Unstable fields: ${result.unstableFields.join(', ')}`);
} else {
  console.log(`Determinism verified across ${result.iterations} iterations`);
  console.log(`Stable hash: ${result.hashes[0]}`);
}
```

#### `stableReceiptHash(receipt)`

Computes a deterministic hash of a receipt by zeroing out non-deterministic fields.

**Parameters:**
- `receipt: Record<string, unknown>` — Receipt object to hash

**Returns:** `string` — FNV-1a 32-bit hash (hex)

**Signature:**
```typescript
export function stableReceiptHash(receipt: Record<string, unknown>): string;
```

**Example:**
```typescript
const receipt1 = await algorithm.process(config, log);
const receipt2 = await algorithm.process(config, log);

const hash1 = stableReceiptHash(receipt1);
const hash2 = stableReceiptHash(receipt2);

console.assert(hash1 === hash2, 'Receipts are not deterministic');
```

#### `receiptsMatch(a, b)`

Compares two receipts for determinism (ignoring unstable fields).

**Parameters:**
- `a: Record<string, unknown>` — First receipt
- `b: Record<string, unknown>` — Second receipt

**Returns:** `boolean` — True if stable fields match

**Example:**
```typescript
const receipt1 = await algorithm.process(config, log);
const receipt2 = await algorithm.process(config, log);

if (!receiptsMatch(receipt1, receipt2)) {
  console.error('Algorithm is not deterministic');
}
```

#### `checkMlDeterminism(producer, iterations, epsilon)`

Validates ML algorithm determinism with floating-point tolerance.

**Parameters:**
- `producer: () => Promise<Record<string, unknown>>` — ML model/prediction function
- `iterations: number` — Number of runs (default: 5)
- `epsilon: number` — Maximum allowed difference for numeric fields (default: 0.01)

**Returns:** `Promise<DeterminismResult>`

**Example:**
```typescript
// ML models may have slight numeric variance due to floating-point nondeterminism
const result = await checkMlDeterminism(async () => {
  return await mlModel.predict(trainingData);
}, 5, 0.001); // Tolerance: 0.1%

if (!result.passed) {
  console.error(`Unstable fields: ${result.unstableFields.join(', ')}`);
  console.error('Consider increasing epsilon tolerance for numeric stability');
}
```

### Unstable Fields (Automatically Excluded)

The following fields are automatically excluded from determinism checks:

- `run_id`, `runId` — Unique execution ID
- `start_time`, `startTime`, `startedAt` — Execution start timestamp
- `end_time`, `endTime`, `finishedAt` — Execution end timestamp
- `duration_ms`, `durationMs` — Elapsed time
- `timestamp` — Generic timestamp field
- `ml.confidence` — ML confidence scores
- `ml.predictions` — ML model predictions

---

## CLI Harness

### Purpose

The **CLI Harness** enables integration testing of command-line tools. It spawns commands as child processes, captures output (stdout/stderr), and provides assertion helpers.

### API Reference

#### `createCliTestEnv(configContent?)`

Creates an isolated temporary environment for CLI tests.

**Parameters:**
- `configContent?: string` — Optional initial config file content (JSON string)

**Returns:** `Promise<CliTestEnv>`

**Signature:**
```typescript
interface CliTestEnv {
  tempDir: string;      // Temp directory root
  configPath: string;   // Path to config file (even if not created)
  outputDir: string;    // Output directory for test artifacts
  cleanup: () => Promise<void>; // Clean up temp files
}
```

**Example:**
```typescript
import { createCliTestEnv } from '@pictl/testing';

let env = await createCliTestEnv(JSON.stringify({
  version: '1.0',
  source: { kind: 'file', path: 'input.xes' },
  execution: { profile: 'balanced' },
}));

try {
  // Use env.tempDir, env.configPath, env.outputDir
} finally {
  await env.cleanup();
}
```

#### `runCli(args, options?)`

Spawns a CLI command and captures output.

**Parameters:**
- `args: string[]` — Command arguments (e.g., `['discover', '--config', 'cfg.json']`)
- `options?: { cwd?: string; env?: Record<string, string>; timeout?: number; cliPath?: string }`
  - `cwd` — Working directory for command execution
  - `env` — Environment variables to pass
  - `timeout` — Max execution time in milliseconds (default: 30000)
  - `cliPath` — Path to CLI binary (default: 'npx', auto-prepends 'pictl')

**Returns:** `Promise<CliResult>`

**Signature:**
```typescript
interface CliResult {
  exitCode: number;   // Process exit code
  stdout: string;     // Standard output
  stderr: string;     // Standard error
  durationMs: number; // Execution time
}
```

**Example:**
```typescript
const result = await runCli(
  ['discover', '--config', 'cfg.json', '--algorithm', 'dfg'],
  { cwd: env.tempDir, timeout: 60000 }
);

console.log(`Exit code: ${result.exitCode}`);
console.log(`Duration: ${result.durationMs}ms`);
console.log(`Output: ${result.stdout.slice(0, 200)}...`);
```

#### `assertExitCode(result, expected)`

Verifies that a CLI result has the expected exit code.

**Parameters:**
- `result: CliResult` — Result from `runCli()`
- `expected: number` — Expected exit code

**Throws:** `Error` with exit code mismatch details

**Example:**
```typescript
assertExitCode(result, EXIT_CODES.SUCCESS); // Expect exit code 0
assertExitCode(result, EXIT_CODES.CONFIG_ERROR); // Expect exit code 1
```

#### `assertJsonOutput(result)`

Parses and validates that stdout contains valid JSON.

**Parameters:**
- `result: CliResult` — Result from `runCli()`

**Returns:** `unknown` — Parsed JSON object

**Throws:** `Error` if stdout is not valid JSON

**Example:**
```typescript
const output = assertJsonOutput(result);
expect(output).toHaveProperty('algorithm', 'dfg');
expect(output.traces).toBeGreaterThan(0);
```

#### `assertErrorCode(result, errorCode)`

Verifies that an error code appears in output (stdout or stderr).

**Parameters:**
- `result: CliResult` — Result from `runCli()`
- `errorCode: string` — Error code string to find

**Throws:** `Error` if error code not found

**Example:**
```typescript
assertErrorCode(result, 'CONFIG_INVALID');
assertErrorCode(result, 'SCHEMA_VIOLATION');
assertErrorCode(result, 'TIMEOUT_EXCEEDED');
```

#### `writeTestConfig(dir, config, filename?)`

Writes a JSON config file to a directory.

**Parameters:**
- `dir: string` — Directory to write to
- `config: Record<string, unknown>` — Configuration object
- `filename?: string` — Filename (default: 'wasm4pm.json')

**Returns:** `Promise<string>` — Full path to written file

**Example:**
```typescript
const configPath = await writeTestConfig(env.tempDir, {
  version: '1.0',
  source: { kind: 'file', path: 'events.xes' },
  execution: { profile: 'fast' },
});
```

#### `readReceipt(outputDir, filename?)`

Reads and parses a receipt JSON file.

**Parameters:**
- `outputDir: string` — Output directory
- `filename?: string` — Filename (default: 'receipt.json')

**Returns:** `Promise<Record<string, unknown>>` — Parsed receipt

**Example:**
```typescript
const receipt = await readReceipt(env.outputDir);
expect(receipt.algorithm).toBe('dfg');
expect(receipt.traces).toBeGreaterThan(0);
```

### Exit Codes

Standard exit codes defined in `EXIT_CODES`:

```typescript
const EXIT_CODES = {
  SUCCESS: 0,          // Successful execution
  CONFIG_ERROR: 1,     // Configuration invalid or missing
  SOURCE_ERROR: 2,     // Input file not found or unreadable
  EXECUTION_ERROR: 3,  // Algorithm execution failed
  PARTIAL_FAILURE: 4,  // Some traces failed, some succeeded
  SYSTEM_ERROR: 5,     // System-level error (memory, timeout, etc.)
};
```

### CLI Test Example

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import {
  createCliTestEnv,
  runCli,
  assertExitCode,
  assertJsonOutput,
  EXIT_CODES,
} from '@pictl/testing';

describe('pictl CLI', () => {
  let env;

  afterEach(async () => {
    if (env) await env.cleanup();
  });

  it('discovers DFG from XES file', async () => {
    env = await createCliTestEnv(JSON.stringify({
      version: '1.0',
      source: { kind: 'file', path: 'events.xes' },
      execution: { profile: 'fast', algorithm: 'dfg' },
      output: { format: 'json' },
    }));

    const result = await runCli(
      ['discover', '--config', env.configPath],
      { cwd: env.tempDir }
    );

    assertExitCode(result, EXIT_CODES.SUCCESS);
    const output = assertJsonOutput(result);
    expect(output).toHaveProperty('algorithm', 'dfg');
  });
});
```

---

## OTEL Capture

### Purpose

The **OTEL Capture** fixture captures OTEL spans, JSON events, and CLI logs in-memory during tests, enabling assertions on observability without a real observability backend.

### API Reference

#### `OtelCapture` Class

In-memory OTEL event collector for testing.

**Constructor:**
```typescript
const capture = new OtelCapture();
```

#### Instance Methods

##### `captureSpan(span)`

Adds an OTEL span to the capture buffer.

**Parameters:**
```typescript
interface CapturedOtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  startTime: number;      // Nanoseconds since epoch
  endTime?: number;       // Nanoseconds since epoch
  status?: { code: string; message?: string };
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
}
```

**Example:**
```typescript
capture.captureSpan({
  traceId: 'abc123',
  spanId: 'span1',
  name: 'discover-dfg',
  startTime: Date.now() * 1_000_000,
  endTime: (Date.now() + 100) * 1_000_000,
  attributes: {
    'algorithm': 'dfg',
    'traces': 42,
    'activities': 7,
  },
  events: [],
});
```

##### `captureJson(event)`

Adds a JSON event to the capture buffer.

**Parameters:**
```typescript
interface CapturedJsonEvent {
  timestamp: string;
  component: string;
  eventType: string;
  runId?: string;
  data: Record<string, unknown>;
}
```

**Example:**
```typescript
capture.captureJson({
  timestamp: new Date().toISOString(),
  component: 'discovery',
  eventType: 'dfg_computed',
  data: { nodes: 12, edges: 45 },
});
```

##### `captureCli(event)`

Adds a CLI log event to the capture buffer.

**Parameters:**
```typescript
interface CapturedCliEvent {
  level: string;      // 'debug', 'info', 'warn', 'error'
  message: string;
  timestamp: Date;
}
```

**Example:**
```typescript
capture.captureCli({
  level: 'info',
  message: 'Discovery completed in 150ms',
  timestamp: new Date(),
});
```

##### `captureRaw(event)`

Convenience method to capture a raw event object (auto-detects type).

**Parameters:**
- `event: Record<string, unknown>` — Event with trace_id/component/level fields

**Example:**
```typescript
// Auto-detects span from trace_id field
capture.captureRaw({
  trace_id: 'abc123',
  span_id: 'span1',
  name: 'discovery',
  attributes: { algorithm: 'dfg' },
});

// Auto-detects JSON event from component field
capture.captureRaw({
  component: 'discovery',
  event_type: 'started',
  data: { algorithm: 'dfg' },
});
```

##### `clear()`

Clears all captured events.

**Example:**
```typescript
capture.captureSpan(...);
capture.captureJson(...);
capture.clear(); // Remove all captured events
```

#### Accessors & Queries

##### `get spans()`

Returns all captured OTEL spans.

**Returns:** `readonly CapturedOtelSpan[]`

```typescript
const allSpans = capture.spans;
console.log(`Captured ${allSpans.length} spans`);
```

##### `get jsonEvents()`

Returns all captured JSON events.

**Returns:** `readonly CapturedJsonEvent[]`

```typescript
const events = capture.jsonEvents;
```

##### `get cliEvents()`

Returns all captured CLI events.

**Returns:** `readonly CapturedCliEvent[]`

```typescript
const logs = capture.cliEvents;
```

##### `stats()`

Returns summary statistics.

**Returns:** `OtelCaptureStats`

```typescript
interface OtelCaptureStats {
  spanCount: number;
  eventCount: number;       // Events within spans
  jsonEventCount: number;
  cliEventCount: number;
  traceIds: string[];
  components: string[];
}
```

**Example:**
```typescript
const stats = capture.stats();
console.log(`Spans: ${stats.spanCount}, Traces: ${stats.traceIds.length}`);
```

##### `findSpans(namePattern)`

Finds spans matching a name pattern.

**Parameters:**
- `namePattern: string | RegExp` — Pattern to match span names

**Returns:** `CapturedOtelSpan[]`

**Example:**
```typescript
const discoverySpans = capture.findSpans('discover');
const dfgSpans = capture.findSpans(/dfg|DFG/);
```

##### `findSpansByAttribute(key, value?)`

Finds spans that have a specific attribute.

**Parameters:**
- `key: string` — Attribute key to find
- `value?: unknown` — Optional value to match (if omitted, matches any value)

**Returns:** `CapturedOtelSpan[]`

**Example:**
```typescript
const dfgSpans = capture.findSpansByAttribute('algorithm', 'dfg');
const anyAlgorithmSpans = capture.findSpansByAttribute('algorithm');
```

##### `findJsonEvents(component)`

Finds JSON events from a specific component.

**Parameters:**
- `component: string` — Component name

**Returns:** `CapturedJsonEvent[]`

**Example:**
```typescript
const discoveryEvents = capture.findJsonEvents('discovery');
```

#### Assertion Helpers

##### `assertRequiredAttributes(requiredKeys)`

Verifies that all spans have required OTEL attributes.

**Parameters:**
- `requiredKeys: string[]` — List of required attribute keys

**Returns:** `string[]` — Error messages (empty if all valid)

**Example:**
```typescript
const errors = capture.assertRequiredAttributes(['algorithm', 'traces', 'duration']);
if (errors.length > 0) {
  console.error('Missing required attributes:', errors);
}
```

##### `assertNonBlocking(maxDurationMs)`

Verifies that no span exceeds a duration threshold (useful for performance tests).

**Parameters:**
- `maxDurationMs: number` — Maximum allowed span duration

**Returns:** `string[]` — Error messages (empty if all valid)

**Example:**
```typescript
const errors = capture.assertNonBlocking(1000); // Max 1 second per span
if (errors.length > 0) {
  console.error('Performance violations:', errors);
}
```

##### `assertValidTraces()`

Verifies that span parent-child relationships form valid trees.

**Returns:** `string[]` — Error messages (empty if valid)

**Example:**
```typescript
const errors = capture.assertValidTraces();
if (errors.length > 0) {
  console.error('Invalid trace structure:', errors);
}
```

#### Factory Function

##### `createOtelCapture()`

Creates a new OtelCapture instance.

**Returns:** `OtelCapture`

**Example:**
```typescript
import { createOtelCapture } from '@pictl/testing';
const capture = createOtelCapture();
```

### OTEL Capture Example

```typescript
import { describe, it, expect } from 'vitest';
import { createOtelCapture } from '@pictl/testing';

describe('Observability', () => {
  it('captures discovery algorithm spans', async () => {
    const capture = createOtelCapture();

    // Run algorithm with telemetry
    const result = await algorithm.discover(config, { capture });

    // Assert spans were captured
    const stats = capture.stats();
    expect(stats.spanCount).toBeGreaterThan(0);

    // Find discovery spans
    const discoverySpans = capture.findSpans('discover');
    expect(discoverySpans.length).toBeGreaterThan(0);

    // Assert required attributes
    const attrErrors = capture.assertRequiredAttributes(['algorithm', 'traces']);
    expect(attrErrors).toHaveLength(0);

    // Assert trace validity
    const traceErrors = capture.assertValidTraces();
    expect(traceErrors).toHaveLength(0);

    // Assert performance
    const perfErrors = capture.assertNonBlocking(5000); // Max 5 seconds
    expect(perfErrors).toHaveLength(0);
  });
});
```

---

## Certification Gates

### Purpose

The **Certification Gates** framework provides a pluggable, pre-release quality assurance checklist. Each gate is a function that validates a specific aspect (schemas, parity, observability, security, performance, etc.). Gates run in parallel and produce a certification report.

### Invariant

A release is certified only if **all gates pass**. Each gate is independently verifiable and produces unforgeable evidence.

### API Reference

#### `registerGate(name, fn)`

Registers a certification gate.

**Parameters:**
- `name: string` — Gate identifier (e.g., 'contracts:schemas')
- `fn: GateFunction` — Gate validation function

**Signature:**
```typescript
type GateFunction = () => Promise<GateResult> | GateResult;

interface GateResult {
  gate: string;
  passed: boolean;
  details: string;
  duration_ms: number;
}
```

**Example:**
```typescript
import { registerGate } from '@pictl/testing';

registerGate('my:custom-check', async () => {
  const passed = await validateSomething();
  return {
    gate: 'my:custom-check',
    passed,
    details: passed ? 'Check passed' : 'Check failed',
    duration_ms: 0,
  };
});
```

#### `runCertification(version)`

Runs all registered certification gates.

**Parameters:**
- `version: string` — Version number for the report

**Returns:** `Promise<CertificationReport>`

**Signature:**
```typescript
interface CertificationReport {
  timestamp: string;
  version: string;
  gates: GateResult[];
  passed: boolean;
  summary: string;
}
```

**Example:**
```typescript
const report = await runCertification('1.2.3');

if (report.passed) {
  console.log('Release certified!');
} else {
  console.log(`Release blocked: ${report.summary}`);
  for (const gate of report.gates) {
    if (!gate.passed) {
      console.error(`- ${gate.gate}: ${gate.details}`);
    }
  }
}
```

#### `createGate(name, check, details?)`

Convenience function to create a gate from a boolean check function.

**Parameters:**
- `name: string` — Gate identifier
- `check: () => Promise<boolean> | boolean` — Check function
- `details?: string` — Optional success message

**Example:**
```typescript
createGate('performance:latency', async () => {
  const latency = await measureLatency();
  return latency < 1000; // Must be under 1 second
}, 'Latency within acceptable range');
```

#### `formatReport(report)`

Formats a certification report for console output.

**Parameters:**
- `report: CertificationReport` — Report from `runCertification()`

**Returns:** `string` — Formatted report

**Example:**
```typescript
const report = await runCertification('1.2.3');
console.log(formatReport(report));

// Output:
// Certification Report — v1.2.3
// Timestamp: 2026-04-10T12:34:56.789Z
// Status: PASSED
//
// Gates:
//   [PASS] contracts:schemas (45ms) — Schema validation passed
//   [PASS] parity:explain-run (230ms) — Parity verified: 8 steps match
//   [PASS] observability:otel (12ms) — OTEL spans present and valid
//   [PASS] security:redaction (5ms) — No secrets in output
//
// 4/4 gates passed
```

#### `clearGates()`

Clears all registered gates (for testing the certification system).

**Example:**
```typescript
clearGates();
// Now registerGate() starts fresh
```

#### `getRegisteredGates()`

Lists all registered gate names.

**Returns:** `string[]`

**Example:**
```typescript
const gateNames = getRegisteredGates();
console.log('Registered gates:', gateNames);
```

### Built-in Gates

The certification framework provides placeholder gates that can be overridden:

- `contracts:schemas` — Schema validation
- `parity:explain-run` — Explain/run parity
- `observability:otel-optional` — OTEL observability
- `security:redaction` — Secret redaction
- `watch:reconnect` — Watch mode reconnection
- `cli:exit-codes` — CLI exit codes
- `config:resolution` — Config resolution
- `performance:benchmarks` — Benchmark performance

### Certification Example

```typescript
import {
  registerGate,
  runCertification,
  formatReport,
  checkParity,
  checkDeterminism,
  OtelCapture,
} from '@pictl/testing';

async function certifyRelease(version) {
  // Register custom gates
  registerGate('parity:explain-run', async () => {
    const result = await checkParity(myPlanner, testConfigs);
    return {
      gate: 'parity:explain-run',
      passed: result.allPassed,
      details: result.summary,
      duration_ms: 0,
    };
  });

  registerGate('determinism:output', async () => {
    const result = await checkDeterminism(
      () => algorithm.process(config, log),
      10
    );
    return {
      gate: 'determinism:output',
      passed: result.passed,
      details: result.details,
      duration_ms: 0,
    };
  });

  registerGate('observability:spans', async () => {
    const capture = createOtelCapture();
    await algorithm.process(config, { capture });
    const stats = capture.stats();
    const passed = stats.spanCount > 0;
    return {
      gate: 'observability:spans',
      passed,
      details: passed ? `${stats.spanCount} spans captured` : 'No spans captured',
      duration_ms: 0,
    };
  });

  // Run certification
  const report = await runCertification(version);
  console.log(formatReport(report));

  return report.passed;
}
```

---

## Integration Examples

### Complete Test Suite Pattern

```typescript
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import {
  checkParity,
  checkDeterminism,
  createCliTestEnv,
  runCli,
  assertExitCode,
  assertJsonOutput,
  createOtelCapture,
  ALL_VALID_CONFIGS,
  SIMPLE_SEQUENTIAL,
} from '@pictl/testing';

describe('pictl Algorithm Suite', () => {
  let env;

  beforeAll(() => {
    // Initialize algorithm under test
  });

  afterEach(async () => {
    if (env) await env.cleanup();
  });

  describe('DFG Discovery', () => {
    it('has parity between explain and plan', async () => {
      const result = await checkParity(algorithm, {
        kind: 'file',
        algorithm: 'dfg',
        profile: 'fast',
      });
      expect(result.passed).toBe(true);
    });

    it('is deterministic', async () => {
      const result = await checkDeterminism(
        () => algorithm.process(config, SIMPLE_SEQUENTIAL),
        5
      );
      expect(result.passed).toBe(true);
    });

    it('produces valid CLI output', async () => {
      env = await createCliTestEnv(JSON.stringify({
        version: '1.0',
        source: { kind: 'inline', content: SAMPLE_XES },
        execution: { algorithm: 'dfg', profile: 'fast' },
        output: { format: 'json' },
      }));

      const result = await runCli(['discover', '--config', env.configPath], {
        cwd: env.tempDir,
      });

      assertExitCode(result, 0);
      const output = assertJsonOutput(result);
      expect(output).toHaveProperty('algorithm', 'dfg');
      expect(output).toHaveProperty('traces');
    });

    it('emits OTEL spans', async () => {
      const capture = createOtelCapture();
      await algorithm.process(config, SIMPLE_SEQUENTIAL, { capture });

      const discoverySpans = capture.findSpans(/dfg|discovery/);
      expect(discoverySpans.length).toBeGreaterThan(0);

      const errors = capture.assertRequiredAttributes(['algorithm', 'traces']);
      expect(errors).toHaveLength(0);
    });
  });
});
```

---

## Common Patterns

### Testing All Valid Configs

```typescript
import { ALL_VALID_CONFIGS } from '@pictl/testing';

for (const config of ALL_VALID_CONFIGS) {
  it(`works with ${config.execution.profile} profile`, async () => {
    // Test with this config
  });
}
```

### Testing Event Logs

```typescript
import {
  SIMPLE_SEQUENTIAL,
  PARALLEL_SPLIT,
  EXCLUSIVE_CHOICE,
  LOOP_PROCESS,
} from '@pictl/testing';

const eventLogs = [
  SIMPLE_SEQUENTIAL,
  PARALLEL_SPLIT,
  EXCLUSIVE_CHOICE,
  LOOP_PROCESS,
];

for (const log of eventLogs) {
  it(`processes ${log.name}`, async () => {
    const result = await algorithm.discover(config, log);
    expect(result).toBeDefined();
  });
}
```

### Batch Testing

```typescript
const configs = [
  { algorithm: 'dfg', profile: 'fast' },
  { algorithm: 'inductive', profile: 'balanced' },
  { algorithm: 'genetic', profile: 'quality' },
];

const { results, allPassed } = await checkParityBatch(planner, configs);
expect(allPassed).toBe(true);
```

---

## Best Practices

1. **Always clean up CLI test environments:**
   ```typescript
   afterEach(async () => {
     if (env) await env.cleanup();
   });
   ```

2. **Capture observability as evidence, not decoration:**
   - Use `OtelCapture` to validate causality
   - Assert on span attributes, not just existence
   - Verify trace trees are valid

3. **Test determinism with sufficient iterations:**
   - Use 5-10 iterations for normal algorithms
   - Use epsilon tolerance for ML algorithms
   - Document expected variance

4. **Verify parity across diverse configs:**
   - Test with different profiles (fast, balanced, quality)
   - Test with different algorithms
   - Test with edge case configurations

5. **Use certification gates for pre-release validation:**
   - Register gates for your custom quality criteria
   - Run gates in CI/CD before tagging releases
   - Document what each gate validates

---

## Troubleshooting

### Parity Failed

**Problem:** `missingFromExplain` or `missingFromRun` is non-empty

**Solution:**
1. Check that `explain()` is calling `plan()` internally (not from stale code)
2. Verify step type names match (case-sensitive, underscores)
3. Run both `explain()` and `plan()` separately to debug

### Determinism Failed

**Problem:** `passed = false`, unique hashes vary

**Solution:**
1. Check if you're including unstable fields in your comparison
2. Use `stableReceiptHash()` to exclude timestamps and run IDs
3. For ML algorithms, use `checkMlDeterminism()` with epsilon tolerance
4. Verify input is truly identical (config, event log, random seed)

### OTEL Spans Not Captured

**Problem:** `capture.spans` is empty

**Solution:**
1. Verify algorithm actually emits spans (not mocking)
2. Pass capture to algorithm: `algorithm.process(config, { capture })`
3. Check that spans are captured before calling `capture.spans`
4. Use `captureRaw()` for flexible capture

### CLI Tests Timeout

**Problem:** `runCli()` times out after 30 seconds

**Solution:**
1. Increase timeout: `runCli(args, { timeout: 60000 })`
2. Check for hanging processes: kill manually
3. Simplify test input (smaller event log)
4. Profile algorithm to find bottleneck

---

## API Summary Table

| Fixture | Purpose | Entry Point |
|---------|---------|-------------|
| **Parity Checker** | Explain/run consistency | `checkParity()`, `checkParityBatch()` |
| **Determinism Validator** | Output stability | `checkDeterminism()`, `stableReceiptHash()` |
| **CLI Harness** | Command-line testing | `runCli()`, `createCliTestEnv()` |
| **OTEL Capture** | Observability assertion | `OtelCapture`, `createOtelCapture()` |
| **Certification Gates** | Pre-release QA | `registerGate()`, `runCertification()` |
| **Config Fixtures** | Test configurations | `ALL_VALID_CONFIGS`, `MINIMAL_CONFIG` |
| **Event Log Fixtures** | Test event logs | `SIMPLE_SEQUENTIAL`, `PARALLEL_SPLIT` |
| **Receipt Fixtures** | Expected outputs | `SUCCESS_RECEIPT`, `validateReceiptShape()` |

---

**Last Updated:** 2026-04-10  
**Maintained by:** pictl core team  
**License:** MIT
