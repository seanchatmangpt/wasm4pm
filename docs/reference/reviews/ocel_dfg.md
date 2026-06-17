# Algorithm Review: ocel_dfg

## Algorithm ID & Domain
- **Registry ID**: `ocel_dfg`
- **Domain**: Object-Centric Process Discovery

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `ocel_handle` (an opaque handle pointing to an Object-Centric Event Log).
  - Returns a JSON string of a Directly-Follows Graph containing `nodes`, `edges`, `start_activities`, and `end_activities`.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::OCEL`.
  - Groups event indices by object ID: `for obj_id in event.all_object_ids()`.
  - Sorts events for each object by timestamp using `sort_unstable_by` and lexicographical string comparison. This avoids parsing ISO-8601 timestamps into datetime structures, which is correct and fast because ISO-8601 strings sort lexicographically.
  - Employs safe methods `.first()` and `.last()` when extracting start and end activities to prevent out-of-bounds index errors on empty event lists.
- **Edge Cases & Errors**:
  - If the OCEL contains no events or no event types, it returns a DFG structure with empty lists and maps without panicking.
  - Sorts edges stably by key `(from, to)` to guarantee deterministic results across runs.

## Improvement Areas
- **Performance Optimization**:
  - The edge map uses borrowed keys from OCEL (`&str` from event types), which is highly optimized. However, the `start_activities` and `end_activities` maps still use `to_string()` for every object. Since multiple objects might share the same start/end activity, interning or using a reference-counted structure would save allocations.
  - Sorting is performed per-object. If an object is associated with thousands of events, `sort_unstable_by` is run on a large slice. Pre-sorting all events in the OCEL once could make this O(E log E) overall instead of O(O * E_o log E_o) where E_o can overlap.

## Code References
- **Rust Implementation**: `wasm4pm/src/discovery.rs` -> `discover_ocel_dfg`, `discover_ocel_dfg_pure`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
