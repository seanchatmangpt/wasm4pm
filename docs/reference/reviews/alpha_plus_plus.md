# Algorithm Review: alpha_plus_plus

## Algorithm ID & Domain
- **Registry ID**: `alpha_plus_plus`
- **Domain**: Process Discovery (Petri Net mining)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, and `min_support` (f64 in `[0.0, 1.0]`).
  - Returns a Petri net handle and stats.
- **Boundary Checks**:
  - `threshold = (log.value.traces.len() as f64 * min_support).max(1.0) as usize;` ensures that the minimum support threshold evaluates to at least 1, avoiding edge cases where the threshold is 0.
  - Implements specific handling for length-1 (L1L) and length-2 (L2L) loops, adding loop places and corresponding back-arcs to the Petri Net.
- **Edge Cases & Potential Errors**:
  - **Complexity Explosion**: Merging candidate places uses nested loops and checks `Vec::contains`:
    ```rust
    let mut merged = true;
    while merged {
        merged = false;
        ...
        if !candidates.contains(&candidate) && !to_add.contains(&candidate) {
            to_add.push(candidate);
            merged = true;
        }
    }
    ```
    For dense footprint matrices with many activities, candidate place generation can become exponential (`O(2^V)`), resulting in CPU hanging or OOM inside the single-threaded WASM runtime.

## Improvement Areas
- **Performance Optimization**:
  - Transition candidate sets from `Vec<String>` to bitsets (`u128` or a dynamic bitset crate) to make similarity, causal precede, and containment checks extremely fast.
  - Set a hard limit on the number of activities (e.g., `< 100`) before running Alpha++ to avoid crashing the WASM runtime on large, highly parallel models.
- **Feature Gating**:
  - Gated behind the `discovery_basic` feature flag.

## Code References
- **Rust Implementation**: `wasm4pm/src/algorithms.rs` -> `discover_alpha_plus_plus`, `alpha_plus_plus_inner`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/run-contracts.test.ts`
