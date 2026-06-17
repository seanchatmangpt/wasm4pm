# Algorithm Review: smart_engine

## Algorithm ID & Domain
- **Registry ID**: `smart_engine`
- **Domain**: Process Discovery (Caching / Fused execution)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `handle` (SmartEngine identifier), `algorithm` (e.g. `"dfg"`, `"optimized_dfg"`, `"process_skeleton"`, `"heuristic_miner"`), and `traces_json`.
  - Returns a serialized JSON string representing the output of the selected algorithm.
- **Boundary Checks**:
  - Thread safety: uses `WasmCell` (wrapping `RefCell`) for static storage. This is safe in single-threaded WASM and avoids Mutex deadlocks.
  - Safe serialization checks: handles trace JSON parsing errors gracefully using `.map_err()`.
- **Heuristic Miner Search Complexity Bug**:
  - In `run_with_dfg` under `heuristic_miner`, the code looks up the reverse edge for each edge in the DFG using a linear scan:
    ```rust
    let ba = dfg.edges.iter().find(|r| r.from == e.to && r.to == e.from)...
    ```
    Since this scan is run for every edge `e` in the DFG, the total complexity is `O(E^2)` where `E` is the number of edges. This is highly inefficient for dense process graphs.

## Improvement Areas
- **Performance Optimization**:
  - Replace the linear scan `.find()` in `heuristic_miner` with a pre-built `FxHashMap<(String, String), f64>` of edge frequencies. This converts the lookup to `O(1)`, resulting in an overall `O(E)` complexity.
  - The hash function `hash_traces` uses `rustc_hash::FxHasher`. While fast, it could be replaced with `blake3` or `sha2` hashes if cryptographic security or monorepo parity is required.

## Code References
- **Rust Implementation**: `wasm4pm/src/smart_engine.rs` -> `smart_engine_run`, `SmartEngine`, `FusedMultiPass`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `apps/wasm4pm/src/__tests__/algorithm-coverage-comprehensive.test.ts`
