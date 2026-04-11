# @pictl/planner

Execution plan generation for the pictl process mining engine.

Generates deterministic, reproducible execution plans from process mining configurations. Plans are used by both the `explain()` and `run()` functions (per PRD §11: explain() == run()).

## Features

- **Deterministic Plans**: Same configuration always produces the same plan structure and hash
- **Reproducible Execution**: Plans are acyclic and can be executed in topologically sorted order
- **Human-Readable Explanations**: Generate markdown documentation of execution plans
- **DAG Validation**: Automatic cycle detection and dependency graph validation
- **Profile-Based Planning**: Predefined execution profiles (fast, balanced, quality, stream, research)
- **Resource Estimation**: Step-level duration and memory estimates
- **Parallelization Analysis**: Identifies parallelizable steps for concurrent execution

## Installation

```bash
npm install @pictl/planner
```

## Quick Start

```typescript
import { plan, explain } from '@pictl/planner';

// Create a configuration
const config = {
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'balanced' },
};

// Generate an execution plan
const executionPlan = plan(config);

console.log(`Plan ID: ${executionPlan.id}`);
console.log(`Hash: ${executionPlan.hash}`);
console.log(`Steps: ${executionPlan.steps.length}`);

// Generate a human-readable explanation
const explanation = explain(config);
console.log(explanation);
```

## API Reference

### `plan(config: Config): ExecutionPlan`

Generates an execution plan from a configuration.

**Parameters:**
- `config` - Process mining configuration

**Returns:** ExecutionPlan with steps, dependency graph, and metadata

**Throws:** Error if configuration is invalid

**Example:**
```typescript
const plan = plan({
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'fast' },
});
```

### `explain(config: Config): string`

Generates a human-readable markdown explanation of an execution plan.

**Parameters:**
- `config` - Process mining configuration

**Returns:** Markdown string describing the plan

**Example:**
```typescript
const markdown = explain(config);
console.log(markdown); // Print to console or save to file
```

### `explainBrief(config: Config): string`

Generates a brief summary explanation (shorter version of explain).

**Parameters:**
- `config` - Process mining configuration

**Returns:** Brief markdown summary

### `topologicalSort(dag: DAG): string[]`

Performs topological sort on a DAG.

**Parameters:**
- `dag` - Directed acyclic graph

**Returns:** Array of node IDs in topological order

**Throws:** Error if graph contains cycles

### `hasCycle(dag: DAG): boolean`

Detects if a graph contains a cycle.

**Parameters:**
- `dag` - Directed acyclic graph

**Returns:** true if cycle detected, false otherwise

### `validateDAG(dag: DAG): string[]`

Validates DAG structure.

**Parameters:**
- `dag` - Directed acyclic graph

**Returns:** Array of validation errors (empty if valid)

### `validatePlan(plan: ExecutionPlan): ValidationError[]`

Validates an execution plan.

**Parameters:**
- `plan` - Execution plan to validate

**Returns:** Array of validation errors (empty if valid)

### `assertPlanValid(plan: ExecutionPlan): void`

Asserts that a plan is valid.

**Parameters:**
- `plan` - Execution plan to validate

**Throws:** Error if plan is invalid

## Execution Profiles

### `fast`
Quick overview with minimal algorithm coverage
- DFG discovery
- Statistics analysis
- ~1-5ms per 100 events

### `balanced`
Balanced accuracy and performance (default)
- Alpha++ discovery
- Statistics, conformance, variants analysis
- ~20-50ms per 100 events

### `quality`
High-quality results with comprehensive analysis
- Heuristic & Inductive Miner discovery
- Statistics, conformance, variants, performance analysis
- ~100-500ms per 100 events

### `stream`
Streaming mode for online processing
- Streaming DFG
- Real-time statistics
- Suitable for event streams

### `research`
All algorithms for research and experimentation
- All discovery algorithms (DFG, Alpha++, Heuristic, Inductive, Genetic, PSO, A*, ILP, ACO, Simulated Annealing)
- Complete analysis suite
- ~500ms-5s per 100 events

## Configuration Structure

```typescript
interface Config {
  version: '1.0';
  source: {
    format: 'xes' | 'csv' | 'json' | 'parquet' | 'arrow';
    content?: string;
  };
  execution: {
    profile: 'fast' | 'balanced' | 'quality' | 'stream' | 'research';
    mode?: 'sync' | 'worker' | 'streaming';
    maxEvents?: number;
    maxMemoryMB?: number;
    timeoutMs?: number;
    enableProfiling?: boolean;
    parameters?: Record<string, unknown>;
  };
  output?: {
    generateReports?: boolean;
    includeMetrics?: boolean;
    includeRawResults?: boolean;
    format?: 'json' | 'csv' | 'parquet';
  };
  pipeline?: PipelineStep[];
  metadata?: {
    name?: string;
    description?: string;
    tags?: string[];
  };
}
```

## Execution Plan Structure

```typescript
interface ExecutionPlan {
  id: string;              // UUID
  hash: string;            // Deterministic hash
  config: Config;          // Original configuration
  steps: PlanStep[];       // Ordered execution steps
  graph: DAG;              // Dependency graph
  sourceKind: string;      // Source format
  sinkKind: string;        // Output format
  profile: string;         // Execution profile
}
```

## Plan Steps

Each step in an execution plan includes:
- **id**: Unique identifier
- **type**: PlanStepType enum (BOOTSTRAP, LOAD_SOURCE, DISCOVER_DFG, etc.)
- **description**: Human-readable description
- **required**: Whether step must complete before proceeding
- **parameters**: Step-specific parameters
- **dependsOn**: Array of prerequisite step IDs
- **parallelizable**: Whether step can run concurrently with others
- **estimatedDurationMs**: Estimated execution time
- **estimatedMemoryMB**: Estimated memory usage

## DAG Structure

```typescript
interface DAG {
  nodes: string[];           // Step IDs
  edges: [string, string][]; // Directed edges [source, target]
}
```

## Testing

```bash
npm test                   # Run all tests
npm run test:watch        # Run in watch mode
```

Test coverage includes:
- Plan generation for all profiles
- DAG cycle detection and validation
- Topological sorting
- Configuration validation
- Deterministic hashing
- Plan explanation generation
- 130+ test cases

## Per PRD §11: explain() == run()

The same plan structure is used for both explanation and execution:

```typescript
// Generate a plan
const executionPlan = plan(config);

// Explain it (print markdown)
const explanation = explain(config);  // Uses same plan internally

// Run it (execute steps)
// const results = await run(executionPlan);  // (not in planner package)
```

This ensures consistency: the explanation shows exactly what will be executed.

## Examples

### Generate a Plan for XES File

```typescript
import { plan, explain } from '@pictl/planner';

const config = {
  version: '1.0',
  source: { format: 'xes' },
  execution: { profile: 'balanced' },
};

const executionPlan = plan(config);
const markdown = explain(config);

console.log(`Generated plan: ${executionPlan.id}`);
console.log(`Plan hash: ${executionPlan.hash}`);
console.log(`\nPlan explanation:\n${markdown}`);
```

### Validate a Plan

```typescript
import { validatePlan, assertPlanValid } from '@pictl/planner';

const errors = validatePlan(executionPlan);
if (errors.length > 0) {
  console.error('Plan validation failed:');
  for (const error of errors) {
    console.error(`  ${error.path}: ${error.message}`);
  }
} else {
  console.log('Plan is valid');
}

// Or use assertion
try {
  assertPlanValid(executionPlan);
  console.log('Plan is valid');
} catch (err) {
  console.error('Invalid plan:', err);
}
```

### Analyze Plan Dependencies

```typescript
import { getDependencies, getDependents, topologicalSort } from '@pictl/planner';

// Get all prerequisites for a step
const deps = getDependencies(executionPlan.graph, 'analyze_statistics');
console.log(`Dependencies for analyze_statistics:`, deps);

// Get all dependent steps
const dependents = getDependents(executionPlan.graph, 'validate_source');
console.log(`Steps depending on validate_source:`, dependents);

// Get execution order
const order = topologicalSort(executionPlan.graph);
console.log(`Execution order:`, order);
```

### Compare Plans

```typescript
const fastPlan = plan({ ...config, execution: { profile: 'fast' } });
const balancedPlan = plan({ ...config, execution: { profile: 'balanced' } });

console.log(`Fast plan: ${fastPlan.steps.length} steps`);
console.log(`Balanced plan: ${balancedPlan.steps.length} steps`);
console.log(`Fast plan hash: ${fastPlan.hash}`);
console.log(`Balanced plan hash: ${balancedPlan.hash}`);
```

## Architecture

### Core Modules

- **planner.ts**: Plan generation from configuration
- **explain.ts**: Human-readable plan explanation
- **dag.ts**: Directed acyclic graph utilities
- **steps.ts**: Execution step types and factories
- **validation.ts**: Plan validation utilities

### Design Principles

1. **Determinism**: Same input → same output (for reproducibility)
2. **Validation**: All generated plans are validated before returning
3. **Immutability**: Plans are immutable after generation
4. **Type Safety**: Full TypeScript support with strict types
5. **No Dependencies**: Minimal external dependencies (only uuid)

## Performance

- Plan generation: O(profile) complexity (typically < 1ms)
- Cycle detection: O(n + e) where n=nodes, e=edges
- Topological sort: O(n + e)
- Memory: O(n + e) for DAG representation

## Roadmap

- [ ] Custom pipeline step ordering
- [ ] Plan caching and memoization
- [ ] Performance profiling hooks
- [ ] Step dependency visualization
- [ ] JSON Schema validation for configs
- [ ] Plan merging for composite workflows

## Contributing

See the main pictl repository for contribution guidelines.

## License

MIT - See LICENSE file for details
