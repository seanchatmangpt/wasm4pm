<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/inductive_miner.md; source-sha256: 1d3a038c9a4fa2e02d0cc1eb6a0c939cd1ea3708d411e6cb0a09154b185ea1cc; reason: canonical Diátaxis or ADR surface -->

# Algorithm Review: inductive_miner

## Algorithm ID & Domain
- **Registry ID**: `inductive_miner`
- **Domain**: Process Discovery (Process Tree mining)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns a JSON object with the recursive Process Tree structure and node counts.
- **Boundary Checks**:
  - **RECURSION LIMIT**: To prevent stack overflow on cyclic or highly complex event logs, the recursive method implements a depth limit check:
    ```rust
    if depth > 100 {
        return Ok(ProcessTreeNode::flower());
    }
    ```
    If the recursion depth exceeds 100, it safely falls back to a `flower` tree node.
  - Returns a `flower` tree node as a fallback when no cuts (XOR, Sequence, Parallel, Loop) are found, ensuring the algorithm always succeeds and guarantees a sound model (no deadlocks, always terminates).
  - Since `2c980c399` the flower fallback is surfaced, not silent: the discovery
    JSON reports `fallback: "flower"` (or `"none"`) and a warning is emitted.
    Variant dedup is a count-preserving `BTreeMap` pass (deterministic
    cut-detection order).
- **Memory Safety**:
  - In `build_df_subset`, the code maps activity strings to temporary indices `idx_map: FxHashMap<&str, usize>` and counts edges in an integer-indexed map `FxHashMap<(usize, usize), usize>`. This requires only ~12 bytes/entry compared to ~80 bytes/entry for string keys, avoiding excessive allocations during recursive subdivisions.

## Improvement Areas
- **Performance Optimization**:
  - The cut detection functions (`find_xor_cut`, `find_sequence_cut`, etc.) iterate through all split index positions `1..activities.len()`. For logs with hundreds of unique activities, this partition search can be optimized using Strongly Connected Components (Tarjan's algorithm) or graph modular decomposition to find cuts in linear time.
  - Sorting activities deterministically `sorted_acts.sort()` is performed before each search.

## Code References
- **Rust Implementation**: `wasm4pm/src/more_discovery.rs` -> `discover_inductive_miner`, `inductive_miner_recursive`, `build_df_subset`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
