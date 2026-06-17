# Algorithm Review: genetic_algorithm

## Algorithm ID & Domain
- **Registry ID**: `genetic_algorithm`
- **Domain**: Process Discovery (Metaheuristic DFG optimization)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, `population_size` (usize), and `generations` (usize).
  - Returns the best-performing DFG model and its final fitness.
- **Boundary Checks**:
  - Validates parameters:
    ```rust
    if population_size < 2 {
        return None;
    }
    if generations == 0 {
        return None;
    }
    ```
    This prevents division/indexing errors during selection and loops.
  - Returns `None` (triggers a JS error `"no_edges"`) if the log contains no directly-follows edges (e.g. all traces contain only a single event).
- **Determinism**:
  - Strict determinism is enforced by seeding the random number generator: `StdRng::seed_from_u64(42)`. This ensures that given the same log and parameters, the algorithm produces bit-exact identical outputs.

## Improvement Areas
- **Performance Optimization**:
  - Crossover and mutation operations allocate new `EdgeSet` (HashSets) inside the hot loop. Pre-allocating population collections and reusing vectors/sets across generations would drastically reduce allocations and GC overhead in the WASM memory space.
  - The elitism ratio is hardcoded to `(population_size / 4).max(1)`. Exposing this as an optional parameter (e.g., `elite_ratio`) would provide more flexibility.
- **Observability**:
  - Emits telemetry spans for major iterations.

## Code References
- **Rust Implementation**: `wasm4pm/src/genetic_discovery.rs` -> `discover_genetic_algorithm`, `discover_genetic_algorithm_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-oracles.test.ts`
