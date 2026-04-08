# Profile a Slow Algorithm

**Problem:** An algorithm is taking longer than expected. You need to find the bottleneck -- whether it is in the Rust implementation, the WASM/JS boundary, or the Node.js wrapper layer.

## Approach 1: Built-in Timing from `pictl run`

The simplest starting point. `pictl run` reports wall-clock time automatically:

```bash
pictl run log.xes --algorithm hill-climbing --format json
```

The JSON output includes `elapsedMs`:

```json
{
  "status": "success",
  "algorithm": "hill-climbing",
  "elapsedMs": 135.2,
  "model": { ... }
}
```

For a quick comparison across algorithms, `pictl compare` shows timing in its side-by-side table:

```bash
pictl compare dfg hill-climbing -i log.xes
```

This gives you the total execution time but does not break it down into phases (parse, discover, serialize).

### Breaking down phases manually

If you need to separate parsing from discovery, use the WASM kernel directly in a Node.js script:

```javascript
const pm = require('@pictl/wasm4pm');

// Phase 1: Parse XES
const t0 = performance.now();
const xes = require('fs').readFileSync('log.xes', 'utf-8');
const handle = pm.load_eventlog_from_xes(xes);
const parseMs = performance.now() - t0;

// Phase 2: Discovery
const t1 = performance.now();
const result = pm.discover_hill_climbing(handle, 'concept:name');
const discoverMs = performance.now() - t1;

// Phase 3: Cleanup
const t2 = performance.now();
pm.delete_object(handle);
const cleanupMs = performance.now() - t2;

console.log(
  `Parse: ${parseMs.toFixed(1)}ms | Discover: ${discoverMs.toFixed(1)}ms | Cleanup: ${cleanupMs.toFixed(1)}ms`
);
```

Typical breakdown on 10K cases:

| Phase    | DFG    | Hill Climbing | A\* Search |
| -------- | ------ | ------------- | ---------- |
| Parse    | ~1.2ms | ~1.2ms        | ~1.2ms     |
| Discover | ~1.8ms | ~133ms        | ~75ms      |
| Cleanup  | <0.1ms | <0.1ms        | <0.1ms     |

If parse time dominates, the bottleneck is XES parsing, not the algorithm.

## Approach 2: Rust Profiling with `cargo`

For deep profiling of the Rust implementation, compile a native binary with debug info and run it under `cargo` or system profilers.

### Step 1: Build a profiling binary

```bash
cd wasm4pm
cargo build --release --target x86_64-apple-darwin
```

### Step 2: Run with `time` for a quick measurement

```bash
time cargo run --release --example bench_hill_climbing -- 10000
```

### Step 3: Use Instruments (macOS)

On Apple Silicon, Xcode Instruments provides the best profiling:

```bash
xcrun xctrace record --template 'Time Profiler' --output trace.trace \
  -- cargo run --release --example bench_hill_climbing -- 10000
```

Then open `trace.trace` in Instruments to see:

- Function-level hot spots
- Call tree with self time vs total time
- Assembly view for the hottest functions

### Step 4: Use `cargo-flamegraph` for a quick flame graph

```bash
cargo install flamegraph
cargo flamegraph --bench discovery -- 10000
# Opens flamegraph.svg in your browser
```

## Approach 3: Node.js Profiling with `--prof`

If the bottleneck appears to be at the WASM/JS boundary (serializing large results, frequent small calls), profile the Node.js side.

### Step 1: Generate a V8 profile

```bash
node --prof $(which pictl) run log.xes --algorithm hill-climbing
```

This creates `isolate-*.log` in the working directory.

### Step 2: Process the profile

```bash
node --prof-process isolate-*.log > profile.txt
```

### Step 3: Read the summary

Look at the `[Bottom up (heavy) summary]` section:

```
 [Bottom up (heavy) summary]
   ticks  total  nonlib   name
    245   3.2%   3.2%  wasm::discovery::hill_climbing::prune_edges
    198   2.6%   2.6%  wasm::parse::xes::parse_log
    142   1.9%   1.9%  JSON.stringify
    ...
```

If `JSON.stringify` appears high, the bottleneck is serializing the Rust result to JavaScript. If a Rust function name appears, the bottleneck is inside the algorithm.

## Real Example: Hill Climbing O(n^2) Fix

During development, `hill_climbing` took approximately 500ms on 10K cases. Profiling with Instruments revealed that the edge-pruning loop had an O(n^2) hash lookup pattern:

**Before (slow):**

```rust
// Each iteration scanned all edges to find removable ones
for edge in &self.edges {
    if self.edges.iter().any(|e| e.depends_on(edge)) {
        continue;
    }
    self.edges.retain(|e| e.id != edge.id);
}
```

**After (fast):**

```rust
// Pre-build adjacency set, then prune in linear scan
let removable: HashSet<EdgeId> = self.edges.iter()
    .filter(|e| !adjacency.has_dependents(e))
    .map(|e| e.id)
    .collect();
self.edges.retain(|e| !removable.contains(&e.id));
```

The fix reduced execution from ~500ms to ~135ms on 10K cases (3.7x speedup).

## Common Bottlenecks

| Bottleneck                | Symptom                             | Fix                                       |
| ------------------------- | ----------------------------------- | ----------------------------------------- |
| XES parsing               | Parse time > 20% of total           | Use binary log format (not yet available) |
| Hash map thrashing        | High self-time in `HashMap::get`    | Use `FxHashMap` or pre-hash keys          |
| Unnecessary copies        | High memory allocation count        | Borrow instead of clone; use `Cow`        |
| O(n^2) loops              | Time grows quadratically with size  | Pre-index data structures                 |
| WASM serialization        | `JSON.stringify` high in V8 profile | Reduce result size; use typed arrays      |
| Frequent small WASM calls | Many tiny calls across JS boundary  | Batch work into fewer WASM calls          |
| String interning misses   | Duplicate string allocations        | Use the built-in string interner cache    |

## Quick Checklist

1. **Run `pictl run --format json`** to get total time.
2. **Break into phases** (parse vs discover) to narrow the scope.
3. **If parse is slow**, the log format or size is the issue.
4. **If discover is slow**, profile with Instruments or flamegraph.
5. **If serialization is slow**, reduce the result object or use typed arrays.
6. **Compare against published baselines** in `docs/BENCHMARKS.md` -- if you are within 10%, the algorithm is performing as expected.

## See Also

- [Compare Two Algorithms](./compare-algorithms.md) -- side-by-side timing
- [Reproduce Published Benchmark Results](./reproduce-paper-benchmarks.md) -- baseline validation
- [docs/BENCHMARKS.md](../../BENCHMARKS.md) -- published performance numbers
