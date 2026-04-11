# Package Integration Guide

**Last Updated:** April 2026  
**Audience:** Developers integrating pictl packages, architects designing cross-package workflows  
**Status:** Production-ready

## Overview

The pictl monorepo comprises 9 interdependent packages that form a unified system for process mining and discovery. This guide explains how these packages relate, how they depend on each other, and how they work together in real workflows.

**Core Philosophy:** Each package has a single, well-defined responsibility. Integration happens through stable contracts (types) and well-defined interfaces. Packages depend on layers below them but never upward.

---

## Package Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│  (CLI, APIs, MCP servers using the packages)                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼────────────────┬──────────────┐
         │               │                │              │
    ┌────▼─────┐   ┌─────▼──────┐  ┌─────▼─────┐  ┌───▼──────┐
    │ @pictl/  │   │ @pictl/    │  │ @pictl/   │  │@pictl/   │
    │  engine  │   │  planner   │  │    ml     │  │ swarm    │
    │  (state  │   │ (execution │  │(predictions│ │(async   │
    │ machine) │   │   plans)   │  │)          │ │orchestr.)│
    └────┬─────┘   └─────┬──────┘  └─────┬─────┘  └───┬──────┘
         │                │               │            │
         └───────────────┬┴───────────────┴────────────┘
                         │
         ┌───────────────┼────────────┬─────────────┐
         │               │            │             │
    ┌────▼──────┐  ┌─────▼──────┐   │        ┌─────▼────┐
    │@pictl/    │  │ @pictl/    │   │        │ @pictl/  │
    │observability│ │   config  │   │        │ testing  │
    │(OTel, JSON)│ │ (zod,TOML) │   │        │(assertions)
    └────┬───────┘  └─────┬──────┘   │        └─────┬─────┘
         │                │          │              │
         └───────────────┬┴──────────┴──────────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         ┌────▼────┐ ┌───▼──┐ ┌────▼─────┐
         │@pictl/  │ │@pictl│ │ @pictl/  │
         │contracts│ │kernel│ │ (base)   │
         │(types)  │ │(WASM)│ │ ontology │
         └──────────┘ └──────┘ └──────────┘

```

**Direction of dependencies:**
- Layer 0 (bottom): `@pictl/contracts`, `@pictl/kernel` — no internal dependencies
- Layer 1: `@pictl/config`, `@pictl/observability` — depend on contracts
- Layer 2: `@pictl/engine` — depends on contracts + observability
- Layer 3: `@pictl/planner`, `@pictl/ml` — depend on contracts + config
- Layer 4: `@pictl/testing`, `@pictl/swarm` — depend on engine + planner + ml

**Backward dependency rule:** A package at layer N may NEVER depend on layer N+1 or higher. Only downward dependencies are allowed.

---

## Package Responsibilities

### Layer 0: Foundation

#### `@pictl/contracts` (~500 lines)
**Purpose:** Type definitions and schemas—the lingua franca of pictl  
**Exports:**
- `EngineState` — union of 8 valid states (uninitialized, bootstrapping, ready, planning, running, watching, degraded, failed)
- `ExecutionPlan` — DAG of execution steps with dependencies
- `ExecutionReceipt` — result of a completed execution
- `EngineStatus` — point-in-time snapshot of engine state + progress
- `TypedError` — tagged error system with codes, severity levels
- `Receipt` — BLAKE3 receipt for deterministic reproducibility
- JSON schemas for all types (via `@json-schema/zod`)

**Core file:** `packages/contracts/src/types.ts`  
**No dependencies** (except on TypeScript standard library and zod for validation)

```typescript
// From packages/contracts/src/types.ts
export type EngineState = 
  | 'uninitialized'
  | 'bootstrapping'
  | 'ready'
  | 'planning'
  | 'running'
  | 'watching'
  | 'degraded'
  | 'failed';

export interface ExecutionPlan {
  planId: string;
  steps: PlanStep[];
  totalSteps: number;
  estimatedDurationMs?: number;
}

export interface ExecutionReceipt {
  runId: string;
  planId: string;
  state: EngineState;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  progress: number;
  errors: TypedError[];
}

export interface EngineStatus {
  state: EngineState;
  uptime?: number;
  progress: number;
  runId?: string;
  plan?: ExecutionPlan;
  errors: TypedError[];
  lastUpdate: Date;
}
```

#### `@pictl/kernel` (~800 lines)
**Purpose:** Type-safe API facade over wasm4pm WASM algorithms  
**Exports:**
- `Kernel` class — interface to load and invoke WASM algorithms
- `AlgorithmRegistry` — catalog of available algorithms with metadata
- Versioning utilities (`KERNEL_VERSION`, `MIN_WASM4PM_VERSION`, `checkCompatibility()`)
- Hashing utilities (`hashOutput()`, `canonicalize()`, `verifyOutputHash()`)
- Error classification (`classifyRustError()`, `toTypedError()`)

**Core files:** `packages/kernel/src/{api.ts, registry.ts, versioning.ts, errors.ts}`

```typescript
// From packages/kernel/src/api.ts
export class Kernel {
  async init(): Promise<void>;
  async shutdown(): Promise<void>;
  isReady(): boolean;
  async run(
    algorithmName: string,
    eventLogHandle: string,
    params?: Record<string, unknown>
  ): Promise<KernelResult>;
}

export interface KernelResult {
  handle: string;
  algorithm: string;
  outputType: string;
  durationMs: number;
  hash: string;
}

export interface AlgorithmMetadata {
  id: string;
  name: string;
  outputType: string;
  complexity?: string;
  qualityTier?: 'basic' | 'standard' | 'premium';
}
```

### Layer 1: Infrastructure

#### `@pictl/config` (~1200 lines)
**Purpose:** Configuration management with Zod validation and provenance tracking  
**Exports:**
- `resolveConfig()` — CLI + file + env var → merged config with provenance
- `configSchema` — Zod schema covering all sections (sources, sinks, algorithms, observability)
- `trackProvenance()` — per-key source tracking (CLI override? env var? file?)
- `hashConfig()`, `verifyConfigHash()` — deterministic config hashing

**Core files:** `packages/config/src/{resolver.ts, schema.ts, provenance.ts, hash.ts}`

**Depends on:** `@pictl/contracts`

```typescript
// From packages/config/src/types.ts
export interface Config {
  sources?: SourceConfig[];
  sinks?: SinkConfig[];
  algorithm?: AlgorithmConfig;
  execution?: ExecutionConfig;
  observability?: ObservabilityConfig;
  watch?: WatchConfig;
  output?: OutputConfig;
  prediction?: PredictionConfig;
}

export interface SourceConfig {
  kind: 'csv' | 'json' | 'parquet' | 'http' | 'ws';
  path?: string;
  url?: string;
  // ... algorithm-specific options
}

export interface ExecutionConfig {
  profile?: 'quality' | 'balanced' | 'speed';
  timeoutMs?: number;
  retryPolicy?: { maxRetries: number; backoffMs: number };
}

export interface ProvenanceMap {
  [key: string]: ProvenanceSource;
}

export interface Provenance {
  map: ProvenanceMap;
  original: Partial<Config>;
}
```

**Real example: resolveConfig flow**
```typescript
// User calls: pictl discover --config pictl.toml --profile quality
const config = await resolveConfig({
  fileConfig: await loadToml('pictl.toml'),
  cliOverrides: { execution: { profile: 'quality' } },
  envVars: process.env,
});

// Result includes provenance:
console.log(config.metadata.provenance['execution.profile']);
// → { source: 'cli', value: 'quality' }

console.log(config.metadata.provenance['observability.otel.enabled']);
// → { source: 'env', key: 'PICTL_OTEL_ENABLED', value: true }
```

#### `@pictl/observability` (~1500 lines)
**Purpose:** OpenTelemetry + JSON logging integration  
**Exports:**
- `ObservabilityWrapper` — unified OTel + JSON logging
- `Instrumentation` — event builders (bootstrap, planning, execution, errors)
- `OtelExporter` — configurable exporters (OTLP, Jaeger, Datadog)
- `SecretRedaction` — automatic PII/secrets redaction
- `JsonWriter` — async JSON event writer

**Core files:** `packages/observability/src/{instrumentation.ts, observability-wrapper.ts, otel-exporter.ts, secret-redaction.ts}`

**Depends on:** `@pictl/contracts`

```typescript
// From packages/observability/src/instrumentation.ts
export class Instrumentation {
  static generateTraceId(): string;
  
  static createStateChangeEvent(
    traceId: string,
    fromState: EngineState,
    toState: EngineState,
    requiredOtelAttrs: RequiredOtelAttributes,
    metadata?: Record<string, unknown>
  ): { otelEvent: OtelEvent; jsonEvent: JsonEvent };

  static createErrorEvent(
    traceId: string,
    code: string,
    message: string,
    requiredOtelAttrs: RequiredOtelAttributes,
    metadata?: Record<string, unknown>
  ): { otelEvent: OtelEvent; jsonEvent: JsonEvent };

  static createPlanGeneratedEvent(
    traceId: string,
    planId: string,
    planHash: string,
    totalSteps: number,
    requiredOtelAttrs: RequiredOtelAttributes,
    metadata?: Record<string, unknown>
  ): { otelEvent: OtelEvent; jsonEvent: JsonEvent };
}

export interface RequiredOtelAttributes {
  'run.id': string;
  'config.hash': string;
  'input.hash': string;
  'plan.hash': string;
  'execution.profile': string;
  'source.kind': string;
  'sink.kind': string;
}
```

**Real example: observability in engine bootstrap**
```typescript
// From packages/engine/src/engine.ts (lines 149-189)
async bootstrap(timeoutMs: number = 30000): Promise<void> {
  if (!this.traceId) {
    this.traceId = Instrumentation.generateTraceId();
  }

  const stateChangeStart = Instrumentation.createStateChangeEvent(
    this.traceId,
    'uninitialized',
    'bootstrapping',
    this.requiredOtelAttrs,
    { reason: 'Starting WASM and kernel initialization' }
  );
  this.observability.emitOtelSafe(stateChangeStart.otelEvent);

  // ... actual bootstrap work ...

  const stateChangeReady = Instrumentation.createStateChangeEvent(
    this.traceId,
    'bootstrapping',
    'ready',
    this.requiredOtelAttrs,
    { reason: 'WASM and kernel initialized successfully' }
  );
  stateChangeReady.event.durationMs = result.durationMs;
  this.observability.emitOtelSafe(stateChangeReady.otelEvent);
}
```

### Layer 2: Core Orchestration

#### `@pictl/engine` (~2000 lines)
**Purpose:** State machine orchestrating bootstrap → planning → execution → monitoring  
**Exports:**
- `Engine` class — main state machine (8 states, 12 transitions)
- `StateMachine` — low-level state transitions with listeners
- `StatusTracker` — in-memory status tracking with error accumulation
- Transition validation and recovery suggestion

**Core files:** `packages/engine/src/{engine.ts, lifecycle.ts, transitions.ts, state.ts, bootstrap.ts}`

**Depends on:** `@pictl/contracts`, `@pictl/observability`

```typescript
// From packages/engine/src/engine.ts (lines 74–125)
export class Engine {
  constructor(
    kernel: Kernel,
    planner?: Planner,
    executor?: Executor,
    wasmLoaderConfig?: WasmLoaderConfig,
    observabilityConfig?: ObservabilityConfig,
    watchConfig?: WatchConfig
  );

  state(): EngineState;
  status(): EngineStatus;

  async bootstrap(timeoutMs?: number): Promise<void>;
  async plan(config: unknown, timeoutMs?: number): Promise<ExecutionPlan>;
  async run(plan: ExecutionPlan, timeoutMs?: number): Promise<ExecutionReceipt>;
  async *watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate>;
  async shutdown(): Promise<void>;
}

export interface Kernel {
  init(): Promise<void>;
  shutdown(): Promise<void>;
  isReady(): boolean;
  run?(algorithmName: string, eventLogHandle: string, params?: Record<string, unknown>): Promise<KernelRunResult>;
}

export interface Planner {
  plan(config: unknown): Promise<ExecutionPlan>;
}

export interface Executor {
  run(plan: ExecutionPlan): Promise<ExecutionReceipt>;
  watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate>;
}
```

**State transitions (from `packages/engine/src/transitions.ts`):**
```typescript
export const VALID_TRANSITIONS: Record<EngineState, Set<EngineState>> = {
  uninitialized: new Set(['bootstrapping']),
  bootstrapping: new Set(['ready', 'failed']),
  ready: new Set(['planning', 'degraded', 'failed']),
  planning: new Set(['running', 'ready', 'degraded', 'failed']),
  running: new Set(['watching', 'ready', 'degraded', 'failed']),
  watching: new Set(['ready', 'degraded', 'failed']),
  degraded: new Set(['ready', 'bootstrapping', 'failed']),
  failed: new Set(['bootstrapping']),
};
```

### Layer 3: Execution Strategies

#### `@pictl/planner` (~1200 lines)
**Purpose:** Generate deterministic execution plans from process mining configurations  
**Exports:**
- `plan(config)` → `ExecutionPlan` — DAG of steps with dependencies
- `explain(config)` → `string` — human-readable plan explanation (same plan as execution)
- `toContractsPlan(plan)` → `Plan` — convert to contracts schema
- DAG utilities: `topologicalSort()`, `hasCycle()`, `validateDAG()`
- Step factories: `createBootstrapStep()`, `createAlgorithmStep()`, `createAnalysisStep()`, etc.

**Core files:** `packages/planner/src/{planner.ts, dag.ts, steps.ts, explain.ts}`

**Depends on:** `@pictl/contracts`, `@pictl/config`

```typescript
// From packages/planner/src/planner.ts
export async function plan(config: unknown): Promise<ExecutionPlan> {
  // Validate config schema
  const validated = configSchema.parse(config);

  // Determine steps based on algorithm type
  const steps: PlanStep[] = [];
  
  // Add bootstrap (always first)
  steps.push(createBootstrapStep());
  
  // Add algorithm-specific steps
  if (validated.algorithm?.id === 'discover-inductive') {
    steps.push(createAlgorithmStep('discover-inductive', validated.algorithm));
  }
  
  // Add post-processing steps
  steps.push(createAnalysisStep('conformance-check'));
  steps.push(createSinkStep(validated.sinks));

  // Build DAG and validate no cycles
  const dag = buildDAG(steps);
  if (hasCycle(dag)) {
    throw new PlannerError('CYCLIC_PLAN', 'Plan contains a cycle');
  }

  return {
    planId: generateId(),
    steps,
    totalSteps: steps.length,
    estimatedDurationMs: estimateDuration(steps),
  };
}

export async function explain(config: unknown): Promise<string> {
  // Per PRD §11: explain() uses the same plan as run()
  const executionPlan = await plan(config);
  return formatPlanAsText(executionPlan);
}
```

**Real example: plan for discovery algorithm**
```typescript
const config = {
  sources: [{ kind: 'csv', path: 'events.csv' }],
  algorithm: { id: 'discover-inductive', maxDepth: 5 },
  sinks: [{ kind: 'json', path: 'model.json' }],
};

const executionPlan = await plan(config);
console.log(executionPlan);
// {
//   planId: 'plan_abc123',
//   steps: [
//     { id: 'step_0', name: 'Bootstrap', ... },
//     { id: 'step_1', name: 'Load CSV', dependencies: ['step_0'] },
//     { id: 'step_2', name: 'Discover Inductive Miner', dependencies: ['step_1'] },
//     { id: 'step_3', name: 'Conformance Check', dependencies: ['step_2'] },
//     { id: 'step_4', name: 'Write JSON', dependencies: ['step_3'] },
//   ],
//   totalSteps: 5,
//   estimatedDurationMs: 2000,
// }
```

#### `@pictl/ml` (~400 lines)
**Purpose:** Prediction models and ML-based workflow orchestration  
**Exports:**
- `PredictionEngine` — score future states
- `ParameterOptimizer` — tune algorithm parameters for quality/speed
- Model training utilities

**Depends on:** `@pictl/contracts`, `@pictl/config`

### Layer 4: High-Level Abstractions

#### `@pictl/testing` (~800 lines)
**Purpose:** Test utilities and assertions for pictl workflows  
**Exports:**
- `createMockKernel()`, `createMockPlanner()`, `createMockExecutor()`
- `assertStateTransition()` — validate state machines
- `assertPlanValid()` — DAG validation
- `assertReceiptValid()` — receipt structure and hash validation

**Depends on:** `@pictl/contracts`, `@pictl/engine`, `@pictl/planner`

#### `@pictl/swarm` (~600 lines)
**Purpose:** Async orchestration of multiple engines or discovery workflows  
**Exports:**
- `SwarmPool` — manage multiple engine instances
- `WorkflowScheduler` — queue and execute jobs
- `ResultAggregator` — combine results from parallel executions

**Depends on:** `@pictl/engine`, `@pictl/planner`, `@pictl/config`

---

## Version Alignment Strategy

All packages ship with synchronized versions. The monorepo enforces this:

```json
{
  "packages": {
    "contracts": { "version": "26.4.10" },
    "kernel": { "version": "26.4.10" },
    "config": { "version": "26.4.10" },
    "observability": { "version": "26.4.10" },
    "engine": { "version": "26.4.10" },
    "planner": { "version": "26.4.10" },
    "ml": { "version": "26.4.10" },
    "testing": { "version": "26.4.10" },
    "swarm": { "version": "26.4.10" }
  }
}
```

**Why:**
- Contracts might change (new `EngineState`, new error code)
- All packages depend transitively on contracts
- If contracts v26.4.10 and engine v26.4.9 are mixed, types mismatch
- Synchronized release prevents this

**Consuming semver:**
```json
{
  "dependencies": {
    "@pictl/engine": "^26.4.0",
    "@pictl/planner": "^26.4.0",
    "@pictl/config": "^26.4.0"
  }
}
```

Consumers can take any patch within the same minor version (26.4.0–26.4.99), but major and minor must match the monorepo release.

---

## Cross-Package Data Flow: Real Integration Example

**Scenario:** Discover a process model using inductive miner, generate conformance report, export to JSON.

### Step 1: Configuration → Engine

```typescript
// packages/config/src/resolver.ts
const config = await resolveConfig({
  fileConfig: {
    sources: [{ kind: 'csv', path: './events.csv' }],
    algorithm: { id: 'discover-inductive', maxDepth: 5 },
    sinks: [{ kind: 'json', path: './model.json' }],
    execution: { profile: 'quality' },
    observability: {
      otel: { enabled: true, exporterUrl: 'http://localhost:4318' }
    },
  },
  cliOverrides: { execution: { profile: 'speed' } }, // Override file
});

// config now has:
// {
//   sources: [{ kind: 'csv', path: './events.csv' }],
//   algorithm: { id: 'discover-inductive', maxDepth: 5 },
//   sinks: [{ kind: 'json', path: './model.json' }],
//   execution: { profile: 'speed' }, // ← CLI won
//   observability: { otel: { enabled: true, ... } },
//   metadata: {
//     hash: 'sha256:...',
//     provenance: {
//       'execution.profile': { source: 'cli', value: 'speed' },
//       'observability.otel.enabled': { source: 'file', value: true },
//     }
//   }
// }
```

### Step 2: Engine Initialization

```typescript
// packages/engine/src/engine.ts (application layer)
import { Kernel } from '@pictl/kernel';
import { Engine } from '@pictl/engine';
import { resolveConfig } from '@pictl/config';

const kernel = new Kernel();
const planner = new PlannerImpl(); // Implements Planner interface
const executor = new ExecutorImpl(); // Implements Executor interface
const obsConfig = {
  otel: {
    enabled: config.observability.otel.enabled,
    exporterUrl: config.observability.otel.exporterUrl,
  },
};

const engine = new Engine(kernel, planner, executor, undefined, obsConfig);
```

### Step 3: Bootstrap

```typescript
// engine.ts state machine
await engine.bootstrap();
// engine state: uninitialized → bootstrapping → ready
// Emits OTel spans:
//   - span(name='state_change', attributes={ from: 'uninitialized', to: 'bootstrapping' })
//   - span(name='wasm_load', attributes={ duration_ms: 150 })
//   - span(name='state_change', attributes={ from: 'bootstrapping', to: 'ready' })
```

### Step 4: Plan Generation

```typescript
// planner.ts
const executionPlan = await engine.plan(config);
// engine state: ready → planning → ready
// executionPlan contains:
// {
//   planId: 'plan_xyz',
//   steps: [
//     { id: 'step_1', name: 'Load CSV', dependencies: [] },
//     { id: 'step_2', name: 'Discover Inductive Miner', dependencies: ['step_1'], algorithm: 'discover-inductive' },
//     { id: 'step_3', name: 'Conformance Check', dependencies: ['step_2'] },
//     { id: 'step_4', name: 'Write JSON', dependencies: ['step_3'] },
//   ],
//   totalSteps: 4,
//   estimatedDurationMs: 3000,
// }

// Emits OTel spans:
//   - span(name='state_change', attributes={ from: 'ready', to: 'planning' })
//   - span(name='plan_generated', attributes={ plan_id: 'plan_xyz', steps: 4 })
//   - span(name='state_change', attributes={ from: 'planning', to: 'ready' })
```

### Step 5: Execution

```typescript
// executor.ts (application layer implementation)
const receipt = await engine.run(executionPlan);
// engine state: ready → running → ready
// receipt:
// {
//   runId: 'run_abc',
//   planId: 'plan_xyz',
//   state: 'ready',
//   startedAt: 2026-04-10T12:00:00Z,
//   finishedAt: 2026-04-10T12:00:03Z,
//   durationMs: 3000,
//   progress: 100,
//   errors: [],
// }

// Emits OTel spans per step:
//   - span(name='step_execute', step_id='step_1', step_name='Load CSV', ...)
//   - span(name='step_execute', step_id='step_2', step_name='Discover Inductive Miner', algorithm='discover-inductive', ...)
//   - span(name='step_execute', step_id='step_3', step_name='Conformance Check', ...)
//   - span(name='step_execute', step_id='step_4', step_name='Write JSON', ...)
```

### Step 6: Watched Execution (Alternative)

```typescript
// For long-running jobs, stream updates
for await (const update of engine.watch(executionPlan)) {
  console.log(`Progress: ${update.progress}%, State: ${update.state}`);
  // update: { timestamp: ..., state: 'running', progress: 25 }
  // update: { timestamp: ..., state: 'running', progress: 50 }
  // update: { timestamp: ..., state: 'running', progress: 75 }
  // update: { timestamp: ..., state: 'ready', progress: 100 }
}

// Emits OTel spans:
//   - span(name='state_change', attributes={ from: 'ready', to: 'watching' })
//   - span(name='checkpoint', attributes={ progress: 25, ... })
//   - span(name='checkpoint', attributes={ progress: 50, ... })
//   - span(name='state_change', attributes={ from: 'watching', to: 'ready' })
```

---

## Common Integration Patterns

### Pattern 1: Bootstrap Once, Plan-Run Many

**Use case:** HTTP API server that bootstraps on startup, accepts requests to discover different models.

```typescript
import { Engine } from '@pictl/engine';
import { Kernel } from '@pictl/kernel';

const engine = new Engine(new Kernel(), planner, executor);
await engine.bootstrap(); // Once at startup

// In HTTP handler
app.post('/discover', async (req, res) => {
  const config = req.body; // { algorithm: 'discover-inductive', ... }
  const plan = await engine.plan(config);
  const receipt = await engine.run(plan);
  res.json(receipt);
});
```

### Pattern 2: Multiple Engines for Parallel Work

**Use case:** Batch processing many event logs independently.

```typescript
import { SwarmPool } from '@pictl/swarm';

const pool = new SwarmPool(4); // 4 parallel engines
const configs = [config1, config2, config3, config4];

for (const config of configs) {
  pool.enqueue(async (engine) => {
    await engine.bootstrap();
    const plan = await engine.plan(config);
    return await engine.run(plan);
  });
}

const receipts = await pool.drainAll();
```

### Pattern 3: Error Recovery

**Use case:** Auto-recover from recoverable errors (timeout, transient failure).

```typescript
const engine = new Engine(kernel, planner, executor);
await engine.bootstrap();

try {
  const plan = await engine.plan(config);
  const receipt = await engine.run(plan);
} catch (err) {
  const status = engine.status();
  
  // Check if error is recoverable
  if (status.errors.some(e => e.recoverable)) {
    console.log('Recoverable error. Suggesting recovery state:', status.errors[0].suggestion);
    
    // Engine auto-transitioned to degraded or ready
    // Retry with adjusted config
    const adjustedConfig = { ...config, execution: { timeoutMs: 60000 } };
    const plan = await engine.plan(adjustedConfig);
    const receipt = await engine.run(plan);
  } else {
    throw err;
  }
}
```

### Pattern 4: Observability Integration

**Use case:** Ship OTel spans to Datadog and JSON logs to file simultaneously.

```typescript
import { resolveConfig } from '@pictl/config';

const config = await resolveConfig({
  fileConfig: {
    observability: {
      otel: {
        enabled: true,
        exporter: 'datadog',
        exporterUrl: 'http://localhost:8126',
        attributes: { service: 'pictl-discovery', env: 'prod' },
      },
      jsonOutput: {
        enabled: true,
        path: '/var/log/pictl/events.jsonl',
      },
    },
  },
});

const engine = new Engine(kernel, planner, executor, undefined, config.observability);
await engine.bootstrap();
// Spans sent to Datadog, JSON events appended to /var/log/pictl/events.jsonl
```

---

## Troubleshooting Integration Issues

### Issue: Type Mismatch Between Packages

**Symptom:** TypeScript compilation fails with "Type 'X' is not assignable to 'Y'"

**Cause:** Mixed package versions (`@pictl/engine@26.4.9` + `@pictl/contracts@26.4.10`)

**Fix:**
```bash
npm ls @pictl/*
# Check all are the same version
# If not:
npm install @pictl/engine@26.4.10 @pictl/contracts@26.4.10 @pictl/planner@26.4.10
```

### Issue: Engine State Refuses Transition

**Symptom:** `Error: Invalid state transition: planning -> degraded`

**Cause:** Attempted invalid transition per `VALID_TRANSITIONS`

**Fix:** Consult the transition table and call the correct method:
```typescript
const state = engine.state();
const valid = engine.status().validTransitions; // Get valid next states
console.log(`Current: ${state}, Valid next: ${valid}`);

// Or use TransitionValidator
const suggestion = TransitionValidator.suggestRecoveryState(state, errors);
```

### Issue: Observability Spans Not Appearing

**Symptom:** OTel exporter configured but no spans in Datadog/Jaeger

**Cause:** Observability might be skipping errors silently (OTel is fire-and-forget)

**Fix:**
```typescript
// Check if observability had errors
const engine = ...;
await engine.bootstrap();
const status = engine.status();
console.log(status.observabilityErrors); // May have OTel export failures
```

### Issue: Plan Validation Fails

**Symptom:** `Error: Plan contains cyclic dependency`

**Cause:** Planner generated invalid DAG

**Fix:** Check source → sink compatibility:
```typescript
import { validateSourceSinkCompatibility } from '@pictl/planner';

const errors = validateSourceSinkCompatibility(
  config.sources,
  config.algorithm,
  config.sinks
);
if (errors.length > 0) {
  console.error('Incompatible sources/sinks:', errors);
}
```

---

## Architecture Decisions

### Why Packages Depend Only Downward

**Consequence:** Changes to `@pictl/contracts` can affect all packages, but changes to `@pictl/engine` only affect high-level integrations.

**Benefit:** Stable core. Contract changes are explicitly versioned. Application-layer code can be loose without breaking the foundation.

### Why @pictl/config Is Separate from @pictl/engine

**Consequence:** Engine doesn't know about TOML, environment variables, or file resolution.

**Benefit:** Engine is reusable for programmatic use cases (REST API, MCP server, testing). Configuration is an application concern.

### Why @pictl/observability Is Separate from @pictl/engine

**Consequence:** Engine doesn't couple to OTEL. Observability is passed in via `ObservabilityConfig`.

**Benefit:** Engine works with mocked observability in tests. Production can inject real OTel.

---

## Performance Considerations

### Memory
- **@pictl/engine:** ~10 MB for kernel WASM + state
- **@pictl/planner:** ~2–5 MB for large plans (100+ steps)
- **@pictl/observability:** ~5–20 MB for buffered spans (depends on exporter batch size)

**Mitigation:** Use `SwarmPool` with limited concurrency if memory is tight.

### Latency
- **Bootstrap:** 100–500 ms (WASM load)
- **Planning:** 10–100 ms (DAG construction)
- **Execution:** Depends on algorithm (100 ms to several seconds)
- **Observability export:** 10–100 ms (batched, async)

**Mitigation:** Bootstrap once; reuse engine for multiple plans.

---

## Conclusion

The 9 packages form a coherent stack where each layer has clear responsibility. Integration happens through stable types and well-defined interfaces. Version alignment ensures consistency, and downward-only dependencies keep the architecture stable.

Start with `@pictl/contracts` to understand types, then move up through `@pictl/engine`, `@pictl/planner`, and `@pictl/config` as your use case demands.
