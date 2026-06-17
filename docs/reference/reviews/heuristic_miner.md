# Algorithm Review: heuristic_miner

## Algorithm ID & Domain
- **Registry ID**: `heuristic_miner`
- **Domain**: Process Discovery

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, and `dependency_threshold` (f64).
  - Returns a DFG JSON model containing filtered edges.
- **Boundary Checks**:
  - The dependency calculation follows the Weijters formula:
    ```rust
    let reverse_count = follows.get(&(b, a)).copied().unwrap_or(0);
    let ab = f64::from(count as u32);
    let ba = f64::from(reverse_count as u32);
    if (ab - ba) / (ab + ba + 1.0) >= dependency_threshold {
    ```
    The `+ 1.0` term in the denominator naturally avoids division by zero, even if both `ab` and `ba` are zero (which is impossible since we iterate over active entries in the `follows` map, but good for mathematical safety).
- **Edge Cases**:
  - If `dependency_threshold` is set high (e.g., `0.8` or higher) on small logs, the algorithm yields an empty edge list. It handles this safely without panicking.

## Improvement Areas
- **Performance Optimization**:
  - `discover_heuristic_miner_from_log` calls `log.to_columnar_owned(activity_key)` which copies the columnar structure. Caching the columnar log or utilizing a read-only borrow would be more optimal.
  - The initial capacity of the `follows` map is pre-sized to `n.saturating_mul(n) / 4 + 1`. While this prevents rehashes, for huge vocabularies it might allocate too much memory. Consider capping the initial allocation.
- **Logic Refinement**:
  - The current implementation is a basic Heuristic Miner that only filters the DFG. A full Heuristic Miner should also detect split/join semantics (AND/XOR connectors) and build a Heuristic Net (or Petri Net).

## Code References
- **Rust Implementation**: `wasm4pm/src/advanced_algorithms.rs` -> `discover_heuristic_miner`, `discover_heuristic_miner_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-oracles.test.ts`
