# @wasm4pm/kernel

Core kernel for algorithm registration and step execution in the wasm4pm process mining pipeline.

## Overview

The kernel package provides:

1. **Algorithm Registry** (`registry.ts`) - Metadata for all 15+ discovery algorithms
2. **Step Handlers** (`handlers.ts`) - Execution bridge between planner and WASM module
3. **Type Definitions** - Interfaces for algorithm metadata, profiles, and parameters

## Architecture

### Three-Layer Design

```
Planner Layer
    ↓ (ExecutionPlan with AlgorithmStep)
Kernel Layer
    ├─ Registry: Algorithm metadata lookup
    └─ Handlers: WASM function invocation
    ↓ (algorithm ID, parameters)
WASM Layer (wasm4pm)
    └─ discover_* functions (Rust compiled to WASM)
```

## Components

### 1. Algorithm Registry

The `AlgorithmRegistry` maintains metadata for all discovery algorithms:

```typescript
import { getRegistry } from '@wasm4pm/kernel';

const registry = getRegistry();

// Get algorithm by ID
const dfg = registry.get('dfg');

// List all algorithms
const all = registry.list();

// Get algorithms for a profile
const fast = registry.getForProfile('fast');

// Suggest best algorithm for profile and log size
const suggested = registry.suggestForProfile('quality', 50000);
```

#### Algorithm Metadata

Each algorithm includes:

- `id`: Unique identifier
- `name`: Display name
- `description`: Long description
- `outputType`: 'dfg' | 'petrinet' | 'tree' | 'declare'
- `complexity`: Complexity class (O(n), O(n²), Exponential, etc.)
- `speedTier`: 0-100 (lower is faster)
- `qualityTier`: 0-100 (higher is better)
- `parameters`: Array of parameter definitions
- `supportedProfiles`: Which execution profiles include this algorithm
- `estimatedDurationMs`: Typical time per 100 events
- `estimatedMemoryMB`: Memory estimate for typical 10k event log
- `robustToNoise`: Whether handles noisy logs well
- `scalesWell`: Whether scales to large logs (100k+ events)

### 2. Execution Profiles

Four execution profiles balance speed vs quality:

| Profile | Use Case | Algorithms | Speed | Quality |
|---------|----------|-----------|-------|---------|
| **fast** | Quick analysis, dashboards, streaming | DFG, Skeleton, Alpha | <10ms/100 events | Basic |
| **balanced** | Standard analysis, reports | Heuristic, Inductive, Alpha++ | 10-50ms/100 events | Good |
| **quality** | Research, optimization, offline | Genetic, ILP, ACO, PSO, A* | 50-500ms/100 events | High |
| **stream** | Real-time processing | DFG, lightweight variants | <1ms/100 events | Minimal |

### 3. Step Handlers

The handler executes algorithm steps:

```typescript
import { implementAlgorithmStep } from '@wasm4pm/kernel';
import { PlanStepType, type PlanStep } from '@wasm4pm/planner';

const step: PlanStep = {
  id: 'discover_dfg',
  name: 'discover_dfg',
  type: PlanStepType.DISCOVER_DFG,
  parameters: { activity_key: 'concept:name' }
};

const output = await implementAlgorithmStep(step, wasmModule, eventLogHandle);
// => { modelHandle, algorithm, outputType, executionTimeMs, parameters, metadata }
```

#### Supported Algorithms (15+)

**DFG-Based:**
- `dfg` - Directly Follows Graph (O(n), fastest)
- `process_skeleton` - Minimal skeleton (O(n))
- `optimized_dfg` - ILP-optimized DFG (NP-Hard)

**Petri Net Discovery:**
- `alpha_plus_plus` - Improved Alpha algorithm (O(n²))
- `heuristic_miner` - Lenient for real-world logs (O(n²))
- `inductive_miner` - Recursive partitioning (O(n log n))

**Evolutionary/Swarm:**
- `genetic_algorithm` - GA for high-quality models (Exponential)
- `pso` - Particle swarm optimization (Exponential)
- `aco` - Ant colony optimization (Exponential)

**Search-Based:**
- `a_star` - Heuristic search (Exponential)
- `hill_climbing` - Greedy local search (O(n²))
- `simulated_annealing` - Probabilistic search (Exponential)

**Optimization:**
- `ilp` - Integer linear programming (NP-Hard, best quality)

**Constraint-Based:**
- `declare` - Declarative constraints (O(n²))

### 4. Parameter Validation

Validate parameters before execution:

```typescript
import { validateAlgorithmParameters } from '@wasm4pm/kernel';

const result = validateAlgorithmParameters('genetic_algorithm', {
  activity_key: 'concept:name',
  population_size: 100,
  generations: 250
});

if (result.valid) {
  // Parameters are valid
} else {
  console.error(result.errors); // Array of validation errors
}
```

## Usage

### Install

```bash
pnpm install @wasm4pm/kernel
```

### Registry Usage

```typescript
import { getRegistry } from '@wasm4pm/kernel';

const registry = getRegistry();

// Find fastest algorithm for quick analysis
const fast = registry.suggestForProfile('fast', 10000);
console.log(`Suggested: ${fast.name}`);

// Find best-quality algorithm for research
const quality = registry.suggestForProfile('quality', 100000);
console.log(`Suggested: ${quality.name}`);

// List all algorithms with their complexity
for (const algo of registry.list()) {
  console.log(`${algo.name}: ${algo.complexity}`);
}
```

### Handler Usage

```typescript
import { implementAlgorithmStep } from '@wasm4pm/kernel';
import { PlanStepType, type PlanStep } from '@wasm4pm/planner';

// Initialize WASM module (from wasm4pm)
const wasmModule = await initWasm4pm();

// Load event log (returns handle string)
const logHandle = await loadEventLog(jsonData);

// Execute algorithm step
const step: PlanStep = {
  id: 'step_1',
  name: 'heuristic_mining',
  type: PlanStepType.DISCOVER_HEURISTIC,
  parameters: {
    activity_key: 'concept:name',
    dependency_threshold: 0.5
  }
};

try {
  const output = await implementAlgorithmStep(step, wasmModule, logHandle);
  
  console.log(`Algorithm: ${output.algorithm}`);
  console.log(`Model handle: ${output.modelHandle}`);
  console.log(`Execution time: ${output.executionTimeMs}ms`);
  console.log(`Output type: ${output.outputType}`);
} catch (error) {
  console.error(`Execution failed: ${error.message}`);
}
```

### Profile-Based Selection

```typescript
import { getRegistry } from '@wasm4pm/kernel';

const registry = getRegistry();

// Get all algorithms for a profile
const balanced = registry.getForProfile('balanced');

// Find algorithms that scale well
const scalable = balanced.filter(a => a.scalesWell);

// Sort by quality tier
scalable.sort((a, b) => b.qualityTier - a.qualityTier);

console.log(`Recommended: ${scalable[0].name}`);
```

## Algorithm Selection Guide

### For Speed (Fast Profile)
- **DFG** - Baseline, always fast (0.5ms per 100 events)
- **Alpha++** - Balanced discovery (5ms per 100 events)
- **Heuristic Miner** - Handles noise well (10ms per 100 events)

### For Balanced (Balanced Profile)
- **Inductive Miner** - Recursive partitioning (15ms)
- **Heuristic Miner** - Dependency-based (10ms)
- **Hill Climbing** - Greedy search (20ms)

### For Quality (Quality Profile)
- **Genetic Algorithm** - Evolutionary (40ms)
- **ILP** - Optimal models (20ms, but slow solver)
- **ACO** - Swarm intelligence (45ms)
- **PSO** - Particle swarm (35ms)
- **A*** - Heuristic search (50ms)

### For Large Logs (100k+ events)
- **DFG** - Linear time
- **Heuristic Miner** - Scales well with noise handling
- **Inductive Miner** - Recursive, sublinear in practice

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Test Coverage

- **registry.test.ts** (25+ tests)
  - Algorithm registration and metadata
  - Profile mapping and suggestions
  - Robustness and scalability flags
  - Singleton instance behavior

- **handlers.test.ts** (30+ tests)
  - Algorithm step execution
  - Parameter handling and defaults
  - WASM function invocation
  - Error handling and validation
  - Output structure validation

- **integration.test.ts** (15+ tests)
  - End-to-end execution pipelines
  - Profile-based selection
  - Real-world scenarios
  - Metadata consistency

Total: **70+ comprehensive tests**

## Performance Notes

### Algorithm Timing (per 100 events)

| Algorithm | Duration | Memory |
|-----------|----------|--------|
| DFG | 0.5ms | 20MB |
| Skeleton | 0.3ms | 10MB |
| Heuristic | 10ms | 150MB |
| Inductive | 15ms | 180MB |
| Genetic | 40ms | 250MB |
| ILP | 20ms | 300MB |
| ACO | 45ms | 200MB |

### Scaling (10k → 100k events)

- **Linear algorithms** (DFG): 10x slower
- **Quadratic algorithms** (Heuristic): 100x slower
- **Exponential algorithms** (Genetic): 1000x+ slower

## API Reference

### Registry

```typescript
interface AlgorithmRegistry {
  get(algorithmId: string): AlgorithmMetadata | undefined;
  list(): AlgorithmMetadata[];
  getForProfile(profile: ExecutionProfile): AlgorithmMetadata[];
  suggestForProfile(profile: ExecutionProfile, logSize: number): AlgorithmMetadata | undefined;
}

function getRegistry(): AlgorithmRegistry;
```

### Handlers

```typescript
async function implementAlgorithmStep(
  step: PlanStep,
  wasmModule: WasmModule,
  eventLogHandle: string
): Promise<AlgorithmStepOutput>;

function listAlgorithms(): Array<{
  id: string;
  name: string;
  outputType: string;
  complexity: string;
}>;

function validateAlgorithmParameters(
  algorithmId: string,
  parameters: Record<string, unknown>
): { valid: boolean; errors: string[] };
```

## Types

```typescript
type ExecutionProfile = 'fast' | 'balanced' | 'quality' | 'stream';
type ComplexityClass = 'O(n)' | 'O(n log n)' | 'O(n²)' | 'O(n³)' | 'Exponential' | 'NP-Hard';
type SpeedTier = number; // 0-100
type QualityTier = number; // 0-100

interface AlgorithmMetadata {
  id: string;
  name: string;
  description: string;
  outputType: 'dfg' | 'petrinet' | 'tree' | 'declare';
  complexity: ComplexityClass;
  speedTier: SpeedTier;
  qualityTier: QualityTier;
  parameters: AlgorithmParameter[];
  supportedProfiles: ExecutionProfile[];
  estimatedDurationMs: number;
  estimatedMemoryMB: number;
  robustToNoise: boolean;
  scalesWell: boolean;
}

interface AlgorithmParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  description: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  options?: unknown[];
}

interface AlgorithmStepOutput {
  modelHandle: string;
  algorithm: string;
  outputType: string;
  executionTimeMs: number;
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

## Integration with Engine

The kernel is integrated into the execution engine:

```
Engine.run(plan)
  ↓
Executor iterates steps
  ↓
For AlgorithmStep:
  call kernel.implementAlgorithmStep(step, wasm, logHandle)
  ↓
  Returns modelHandle for downstream steps
```

## Error Handling

Algorithm execution can fail in several ways:

```typescript
try {
  const output = await implementAlgorithmStep(step, wasm, logHandle);
} catch (error) {
  if (error.message.includes('not found')) {
    // Algorithm not registered
  } else if (error.message.includes('Invalid model handle')) {
    // WASM function returned invalid handle
  } else if (error.message.includes('Invalid event log')) {
    // Event log handle is invalid
  } else {
    // Other WASM execution error
  }
}
```

## References

- [wasm4pm Documentation](https://github.com/seanchatmangpt/wasm4pm)
- [Algorithm Papers](./docs/algorithms.md)
- [Performance Benchmarks](./docs/benchmarks.md)

## License

MIT - See LICENSE file
