# Algorithm Review: etconformance_precision

## Algorithm ID & Domain
- **Algorithm ID**: `etconformance_precision`
- **Domain**: Process Mining / Evaluation (ETConformance Escaping-Edges Precision Metric)

## Correctness Audit
- **Early Exit Guards**:
  - `compute_precision` checks if `total_consumed == 0 && total_escaping == 0` (lines 276-277) and returns a precision score of `1.0` (avoiding division-by-zero).
- **Division-by-Zero Protection**:
  - The precision formula is `1.0 - e / (e + c)` (line 281). Since `total_consumed == 0 && total_escaping == 0` is handled, and both variables are non-negative, the sum `e + c` is guaranteed to be positive, preventing division-by-zero.
  - The result is clamped to `[0.0, 1.0]` (line 281).
- **Silent Transition Loop Guard**:
  - In `fire_silent_enabled`, silent transitions are fired in a loop. To prevent infinite loops in cyclic nets with silent transitions, a budget cap is applied: `let budget = net.transitions.len() * 4 + 16;` (line 121). If this budget is exhausted, the loop breaks (line 124).
- **Force-enable Token Injection**:
  - If no candidate transition is enabled, the code injects tokens into the preset of the first candidate: `*marking.entry(p.clone()).or_insert(0) += 1;` (lines 208-216), allowing token replay to proceed. This is standard behavior.

## Improvement Areas
- **Extremely Poor Algorithmic Complexity (Lack of Indexes)**:
  - This implementation does **not** build any lookup indexes. For every trace event, and for every transition firing, it performs multiple linear scans:
    - `is_invisible`, `transition_has_label`, `is_place` iterate over `net.transitions` or `net.places` (lines 54-79).
    - `preset` and `postset` iterate over `net.arcs` and filter nodes (lines 82-99), which in turn executes `is_place` on every matching arc.
    - Inside `precision_for_trace`, escaping edges are counted by checking `preset` and `is_enabled` for **every single transition in the net** at every step (lines 230-238).
    - In `fire_silent_enabled`, it performs a nested loop over all transitions, calling `is_invisible`, `preset`, and `postset` repeatedly (lines 128-140).
  - For a net with $P$ places, $T$ transitions, and $A$ arcs, and a log with $L$ total events, this leads to $O(L \times T \times (A + P))$ operations. This is extremely slow for moderate or large Petri nets.
  - **Optimization**: Building a pre-computed index before replaying the log (e.g., mapping transition IDs to their preset place IDs and postset place IDs, and caching silent transition IDs) would reduce the complexity to $O(L \times T)$, yielding speedups of several orders of magnitude.

## Code References
- **Rust Implementation**: `wasm4pm/src/etconformance_precision.rs` (method: `wasm_compute_precision` / `compute_precision`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `etconformance_precision` / `precision`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
