# Algorithm Review: ocel_oc_declare

## Algorithm ID & Domain
- **Registry ID**: `ocel_oc_declare`
- **Domain**: Object-Centric Process Discovery

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `ocel_handle` and `noise_threshold` (f64).
  - Returns a list of discovered `OCDeclareRule` objects representing declarative rules.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::OCEL`.
  - Sorts object trace indices by event timestamp: `indices.sort_by_key(|&idx| &ocel.events[idx].timestamp)`.
  - Compares computed confidence with `1.0 - options.noise_threshold` to filter out rules below threshold.
- **Edge Cases & Errors**:
  - Binary templates check `b_count > 0` and `a_count > 0` before division to prevent division-by-zero errors.
  - Precedence and Response calculations use `position()` and `rposition()` to find occurrences and verify order, which are safe since existence check `has_a` / `has_b` guarantees the item is present.

## Improvement Areas
- **Performance Optimization**:
  - The binary templates loop is O(T * A^2 * N) where T is object types, A is unique activities, and N is traces of that type. If A is large, this is extremely slow. We can optimize this by pre-computing a trace-profile bitmask or occurrence index map for each activity within the trace.
  - Uses `unwrap()` when finding positions: `trace.iter().position(|r| r == act_b).unwrap()`. While this is safe because the outer loop checks `has_b` (which is `trace.contains(act_b)`), it's a code smell that could panic if the trace changed concurrently or if floating logic was modified. Replacing this with safe matching (e.g., `if let Some(pos) = ...`) is recommended.

## Code References
- **Rust Implementation**: `wasm4pm/src/advanced/oc_declare.rs` -> `discover_oc_declare`, `wasm4pm/src/advanced/mod.rs` -> `discover_oc_declare_wasm`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
