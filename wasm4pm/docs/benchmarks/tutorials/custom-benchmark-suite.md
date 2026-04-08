# Creating Custom Benchmark Suites

> Add your own algorithm to the benchmark suite, run it, and document the results.
> Estimated time: 25 minutes.

## What you will build

By the end of this tutorial you will have:

1. Registered a new algorithm in the TypeScript kernel registry
2. Implemented the WASM function in Rust (or used an existing one)
3. Added a benchmark task to the Node.js benchmark runner
4. Added a browser benchmark to the TypeScript test suite
5. Run the benchmarks and verified the results
6. Documented the results in the project's BENCHMARKS.md

This tutorial assumes you have already implemented a Rust algorithm and compiled it to WASM. If you are adding a benchmark for an existing algorithm, skip Step 0.

## Prerequisites

- Completed [Your First Benchmark](first-benchmark.md) tutorial
- TypeScript knowledge (interfaces, type annotations)
- Basic Rust knowledge (function signatures, `#[wasm_bindgen]`)
- pictl source code checked out and building (`pnpm install` succeeds)
- WASM core compiled (`cd wasm4pm && npm run build:nodejs` succeeds)

---

## Step 0: Implement the algorithm in Rust (if needed)

If you are benchmarking an algorithm that already exists in the WASM core, skip to Step 1.

For a new algorithm, you need a Rust function in `wasm4pm/src/` that:

1. Takes an event log handle (u32) and algorithm parameters
2. Returns a result (JSON string or structured data)
3. Is exported via `#[wasm_bindgen]`

Example skeleton in `wasm4pm/src/discovery.rs`:

```rust
#[wasm_bindgen]
pub fn discover_my_algorithm(
    log_handle: u32,
    activity_key: &str,
    param_a: f64,
) -> String {
    let log = get_log(log_handle);
    let result = my_algorithm::discover(&log, activity_key, param_a);
    serde_json::to_string(&result).unwrap_or_default()
}
```

Compile the WASM:

```bash
cd wasm4pm
npm run build:nodejs
```

Verify the function is exported:

```bash
node -e "const pm = require('./pkg-nodejs/wasm4pm.js'); pm.init(); console.log(typeof pm.discover_my_algorithm)"
```

This should print `function`. If it prints `undefined`, the function is not exported. Check that the Rust function has `#[wasm_bindgen]` and that `wasm-pack build` completed without errors.

---

## Step 1: Register your algorithm in the TypeScript kernel registry

The `AlgorithmRegistry` in `packages/kernel/src/registry.ts` defines metadata for all 21 algorithms. Your new algorithm needs an entry here so that the planner, CLI, and documentation system know about it.

Open `packages/kernel/src/registry.ts` and add a new `this.register(...)` call inside the `registerAllAlgorithms()` method. Place it in the appropriate section (discovery, analytics, or ML).

```typescript
// In packages/kernel/src/registry.ts, inside registerAllAlgorithms():

this.register({
  id: 'my_algorithm',
  name: 'My Custom Algorithm',
  description: 'Description of what your algorithm does and when to use it.',
  outputType: 'dfg', // 'dfg' | 'petrinet' | 'declare' | 'tree' | 'ml_result'
  complexity: 'O(n)', // 'O(n)' | 'O(n log n)' | 'O(n^2)' | 'Exponential' | 'NP-Hard'
  speedTier: 15, // 0-100, lower = faster
  qualityTier: 40, // 0-100, higher = better quality
  parameters: [
    {
      name: 'activity_key',
      type: 'string',
      description: 'Event attribute key for activity names',
      required: true,
      default: 'concept:name',
    },
    {
      name: 'param_a',
      type: 'number',
      description: 'Tunable parameter for the algorithm',
      required: false,
      default: 0.5,
      min: 0.0,
      max: 1.0,
    },
  ],
  supportedProfiles: ['fast', 'balanced', 'quality'],
  estimatedDurationMs: 5, // rough estimate per 100 events
  estimatedMemoryMB: 50, // rough estimate for 10K-case log
  robustToNoise: true,
  scalesWell: true,
  references: ['Author et al., "Paper Title", Conference 2024'],
});
```

### Choosing speed and quality tiers

Use these guidelines based on your algorithm's characteristics:

| Speed tier | Meaning                      | Example                            |
| ---------- | ---------------------------- | ---------------------------------- |
| 0-10       | Sub-millisecond at 10K cases | DFG (5), Process Skeleton (3)      |
| 10-30      | 1-10 ms at 10K cases         | Alpha++ (20), Heuristic Miner (25) |
| 30-50      | 10-100 ms at 10K cases       | Inductive Miner (30), Declare (35) |
| 50-70      | 100 ms - 1 s at 10K cases    | A\* (60), ACO (65)                 |
| 70-85      | 1-10 s at 10K cases          | Genetic (75), ILP (80)             |
| 85-100     | 10+ seconds                  | Trace Similarity (90)              |

| Quality tier | Meaning                       | Example                            |
| ------------ | ----------------------------- | ---------------------------------- |
| 0-30         | Basic abstraction             | DFG (30), Process Skeleton (25)    |
| 30-50        | Good quality with limitations | Heuristic Miner (50), Declare (50) |
| 50-70        | High quality                  | Inductive Miner (55), ACO (75)     |
| 70-85        | Very high quality             | Optimized DFG (85)                 |
| 85-100       | Optimal (provable)            | ILP (90)                           |

### Verifying the registration

After adding the registration, run the TypeScript build to verify there are no type errors:

```bash
cd packages/kernel
npm run build
```

You can also verify programmatically:

```bash
node -e "
  const { getRegistry } = require('./dist/registry.js');
  const reg = getRegistry();
  const algo = reg.get('my_algorithm');
  console.log(algo.name, algo.speedTier, algo.qualityTier);
"
```

---

## Step 2: Add a benchmark task in the Node.js runner

The Node.js benchmark runner (`wasm4pm/benchmarks/wasm_bench_runner.js`) defines algorithm groups, each running in a separate Worker thread. You need to add your algorithm to one of these groups.

### Choose the right group

The runner has four groups:

| Group              | Algorithms                                    | Speed range | Max cases |
| ------------------ | --------------------------------------------- | ----------- | --------- |
| `fast_discovery`   | DFG, Heuristic, Inductive, Skeleton           | < 50 ms     | 10,000    |
| `medium_discovery` | A\*, Simulated Annealing, ACO                 | 50-500 ms   | 5,000     |
| `slow_discovery`   | Genetic, PSO, ILP                             | > 500 ms    | 1,000     |
| `analytics`        | Rework detection, Variants, Transition Matrix | Varies      | 10,000    |

Place your algorithm in the group that matches its expected speed. If you are unsure, start with `fast_discovery` at 1,000 cases and adjust after the first run.

### Add the task

Edit `wasm4pm/benchmarks/wasm_bench_runner.js` and add an entry to the appropriate group:

```javascript
// In the fast_discovery group:
{
  name: 'fast_discovery',
  tasks: [
    // ... existing tasks ...
    {
      algorithm: 'discover_my_algorithm',    // Must match the WASM export name
      sizes: [100, 1_000, 5_000, 10_000],   // Start small, increase after verifying
      params: { paramA: 0.5 },               // Algorithm-specific parameters
    },
  ],
},
```

### Add the dispatcher

Open `wasm4pm/benchmarks/wasm_bench_worker.js` and add a case to the `callAlgorithm` function:

```javascript
function callAlgorithm(name, handle, params) {
  switch (name) {
    // ... existing cases ...
    case 'discover_my_algorithm':
      return pm.discover_my_algorithm(
        handle,
        params.activityKey || ACTIVITY_KEY,
        params.paramA ?? 0.5
      );
    default:
      throw new Error(`Unknown algorithm: ${name}`);
  }
}
```

### Run the benchmark

```bash
cd wasm4pm
npm run build:nodejs
node benchmarks/wasm_bench_runner.js
```

Check the output for your algorithm. If you see `Unknown algorithm: discover_my_algorithm`, the dispatcher is missing the case or the WASM function name is different.

If you see an error from the WASM module, check that:

1. The Rust function is exported with `#[wasm_bindgen]`
2. The parameter types match (Rust `f64` for JavaScript numbers, `&str` for strings)
3. The WASM build completed successfully

---

## Step 3: Add a browser benchmark

Browser benchmarks verify that your algorithm works in the WebAssembly browser environment, which has different performance characteristics than Node.js (single-threaded, no Worker threads, ~100 MB memory limit per tab).

### Create the benchmark file

Create or edit the browser benchmark file at `wasm4pm/__tests__/benchmarks/browser.bench.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import init, { load_eventlog_from_xes, discover_my_algorithm } from '../../pkg/wasm4pm';

describe('my_algorithm browser benchmark', () => {
  beforeAll(async () => {
    await init();
  });

  it('discovers a model from 1000 cases within 50 ms', () => {
    const xes = generateSyntheticXES(1000);
    const handle = load_eventlog_from_xes(xes);

    const start = performance.now();
    const result = discover_my_algorithm(handle, 'concept:name', 0.5);
    const elapsed = performance.now() - start;

    expect(result).toBeTruthy();
    expect(elapsed).toBeLessThan(50); // Adjust threshold based on your algorithm
    // eslint-disable-next-line no-console
    console.log(`my_algorithm (1K cases): ${elapsed.toFixed(2)} ms`);
  });

  it('scales linearly from 100 to 5K cases', () => {
    const sizes = [100, 500, 1000, 5000];
    const timings: number[] = [];

    for (const size of sizes) {
      const xes = generateSyntheticXES(size);
      const handle = load_eventlog_from_xes(xes);

      const start = performance.now();
      discover_my_algorithm(handle, 'concept:name', 0.5);
      const elapsed = performance.now() - start;

      timings.push(elapsed);
      // eslint-disable-next-line no-console
      console.log(`  ${size} cases: ${elapsed.toFixed(2)} ms`);
    }

    // Check that 5K is not more than 60x slower than 100
    // (allows for linear + constant overhead)
    const ratio = timings[3] / timings[0];
    expect(ratio).toBeLessThan(60);
  });
});

/**
 * Minimal XES generator for browser benchmarks.
 * Produces deterministic output for reproducible measurements.
 */
function generateSyntheticXES(numCases: number): string {
  const activities = ['A', 'B', 'C', 'D', 'E', 'F'];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<log xes.version="1.0" xes.features="nested-attributes">',
  ];

  for (let i = 0; i < numCases; i++) {
    lines.push('  <trace>');
    lines.push(`    <string key="concept:name" value="case_${i}"/>`);
    const numEvents = 5 + (i % 10);
    for (let j = 0; j < numEvents; j++) {
      const act = activities[j % activities.length];
      lines.push('    <event>');
      lines.push(`      <string key="concept:name" value="${act}"/>`);
      lines.push('    </event>');
    }
    lines.push('  </trace>');
  }

  lines.push('</log>');
  return lines.join('\n');
}
```

### Run the browser benchmark

```bash
cd wasm4pm
npm run build          # Build the bundler target for browsers
npx vitest run __tests__/benchmarks/browser.bench.ts
```

### Important browser caveats

1. **Memory limit**: Browser tabs have approximately 100 MB available. Test at 5,000 cases maximum.
2. **Single-threaded**: You cannot use Worker threads in browser benchmarks. Each test runs sequentially.
3. **WASM startup**: The first call to any WASM function includes module initialization overhead (~200-500 ms). Use `beforeAll` to amortize this.
4. **GC pressure**: Browsers have more aggressive GC than Node.js. Run each test in isolation and avoid creating large temporary objects.

---

## Step 4: Run and verify results

After adding your algorithm to both the Node.js and browser benchmarks, run the full suite and verify the results are reasonable.

### Run the Node.js benchmark

```bash
cd wasm4pm
node benchmarks/wasm_bench_runner.js 2>&1 | grep my_algorithm
```

You should see rows like:

```
discover_my_algorithm                         100        0.15        0.18
discover_my_algorithm                         1000       1.23        1.45
discover_my_algorithm                         5000       6.78        7.12
discover_my_algorithm                         10000      13.45       14.22
```

### Sanity checks

Perform these checks before considering the benchmark valid:

1. **Monotonically increasing**: Time should increase with dataset size. If 1K is faster than 100, the measurement is noisy. Increase iterations.

2. **Reasonable scaling**: Check the ratio between sizes. For a linear algorithm:
   - 1K / 100 should be approximately 10x
   - 5K / 1K should be approximately 5x
   - 10K / 5K should be approximately 2x

3. **Median-p95 gap**: Should be less than 20% of the median. Larger gaps indicate measurement noise.

4. **Consistent with category**: An algorithm in the `fast_discovery` group should complete 10K cases in under 50 ms. If it takes longer, move it to a slower group.

### Run the browser benchmark

```bash
npx vitest run __tests__/benchmarks/browser.bench.ts --reporter=verbose
```

Browser timings should be within 2x of Node.js timings for linear algorithms. If the browser is more than 5x slower, investigate WASM compilation flags or memory layout issues.

---

## Step 5: Document results in BENCHMARKS.md

The project maintains a living benchmark document at `wasm4pm/docs/BENCHMARKS.md`. When you add a new algorithm, update the relevant sections.

### Update the Quick Reference table

Add your algorithm to the "Discovery Algorithms (10K cases)" table:

```markdown
| **My Algorithm** | ~13 | Balanced | Your description here |
```

Place it in the correct position (sorted by time, fastest first).

### Update the Full Dataset Results table

Add a row to the "Batch Algorithms -- 4 Dataset Sizes" table:

```markdown
| **My Algorithm** | ~15 us | ~1.2 ms | ~13 ms | ~130 ms | ~Linear |
```

Fill in all four size columns with actual measurements from your benchmark run. The Scaling column should reflect the observed behavior (use "~Linear" if the ratios are within 2x of expected).

### Update the Algorithm Categories section

If your algorithm defines a new category or significantly differs from existing ones, add a subsection. For example, if your algorithm is a new type of streaming discovery:

```markdown
### Your New Category (< Xms @ 10K cases)

Best for: Description of when to use this algorithm

- My Algorithm (~13 ms) -- brief description
```

### Add a selection guide entry

If your algorithm is a strong choice for a specific use case, add it to the "Algorithm Selection Guide" section:

```markdown
### For [Your Use Case]

1. **My Algorithm** (~13 ms) -- why it is the best choice
2. [existing algorithm] -- fallback option
```

### Commit the changes

After updating BENCHMARKS.md, commit with a descriptive message:

```bash
git add wasm4pm/docs/BENCHMARKS.md
git commit -m "docs(benchmarks): add My Algorithm to benchmark results"
```

---

## Complete example: adding a hypothetical "Frequency DFG" algorithm

To make the workflow concrete, here is the full diff for adding a hypothetical `discover_frequency_dfg` algorithm that filters edges below a frequency threshold.

### Registry entry (`packages/kernel/src/registry.ts`)

```typescript
this.register({
  id: 'frequency_dfg',
  name: 'Frequency-Filtered DFG',
  description:
    'DFG discovery that removes edges below a configurable frequency threshold. Faster than Heuristic Miner for simple noise filtering.',
  outputType: 'dfg',
  complexity: 'O(n)',
  speedTier: 10,
  qualityTier: 35,
  parameters: [
    {
      name: 'activity_key',
      type: 'string',
      description: 'Activity key',
      required: true,
      default: 'concept:name',
    },
    {
      name: 'min_frequency',
      type: 'number',
      description: 'Minimum edge frequency (0-1)',
      required: false,
      default: 0.1,
      min: 0,
      max: 1,
    },
  ],
  supportedProfiles: ['fast', 'balanced'],
  estimatedDurationMs: 2,
  estimatedMemoryMB: 25,
  robustToNoise: true,
  scalesWell: true,
});
```

### Benchmark task (`wasm4pm/benchmarks/wasm_bench_runner.js`)

```javascript
// Added to fast_discovery group:
{ algorithm: 'discover_frequency_dfg', sizes: [100, 1_000, 5_000, 10_000], params: { minFrequency: 0.1 } },
```

### Worker dispatcher (`wasm4pm/benchmarks/wasm_bench_worker.js`)

```javascript
case 'discover_frequency_dfg':
  return pm.discover_frequency_dfg(
    handle,
    params.activityKey || ACTIVITY_KEY,
    params.minFrequency ?? 0.1
  );
```

### Expected results

If the implementation is correct, you would expect timings similar to DFG (since the filtering is O(E) where E is the number of edges, which is much smaller than the number of events):

```
discover_frequency_dfg                       100        0.03        0.04
discover_frequency_dfg                       1000       0.32        0.35
discover_frequency_dfg                       5000       1.65        1.82
discover_frequency_dfg                       10000      3.35        3.68
```

---

## What you have learned

- **Registry pattern**: Every algorithm has a TypeScript metadata entry in `AlgorithmRegistry`
- **Benchmark runner architecture**: Groups of tasks run in parallel Worker threads, each with its own WASM instance
- **Worker dispatcher**: The `callAlgorithm` switch statement maps task names to WASM function calls
- **Browser benchmarks**: Separate test file using Vitest, with stricter memory and time constraints
- **Documentation workflow**: Update BENCHMARKS.md with actual measurements after each benchmark run
- **Sanity checks**: Monotonic scaling, median-p95 gap, category consistency

## Next steps

- **Understanding Benchmark Results** -- deep-dive into interpreting scaling and anomaly detection
- **BENCHMARK-TIERS-USAGE.md** -- run your algorithm against real BPI Challenge datasets
- **Testing harness** -- explore `@pictl/testing` for parity checks and determinism verification
