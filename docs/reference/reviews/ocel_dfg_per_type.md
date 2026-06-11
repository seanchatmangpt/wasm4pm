# Algorithm Review: ocel_dfg_per_type

## Algorithm ID & Domain
- **Registry ID**: `ocel_dfg_per_type`
- **Domain**: Object-Centric Process Discovery

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `ocel_handle` pointing to an OCEL.
  - Returns a JSON string mapping each object type to its corresponding DFG.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::OCEL`.
  - Builds a sorted activity vocabulary (`activity_vocab`) and maps it to a bitmask if the vocabulary size is <= 64.
  - Correctly precomputes global activity frequencies once before the per-type loop: `let global_activity_counts: FxHashMap<String, usize> = ...`. This prevents redundant counting for each object type.
  - Correctly filters objects by type: `if &obj.object_type == obj_type`.
- **Edge Cases & Errors**:
  - If an object type has no associated objects, it creates an empty DFG for that type.
  - Returns an error if the handle is invalid or the object is not an OCEL.

## Improvement Areas
- **Performance Optimization**:
  - Inside the per-type loop, it builds `events_by_object` for all objects of that type, then iterates through ALL events in the OCEL: `for (idx, event) in ocel.events.iter().enumerate()`. For an OCEL with many object types, this means scanning all events repeatedly (once per object type). A single-pass partition of events by object type before the outer loop would reduce the complexity from O(T * E) to O(E + T) where T is the number of object types.
  - The bitmask (`trace_seen_bitmask`) is constructed for start activities but the variable is currently ignored (`let _ = (trace_seen_bitmask, bitmask_check);`). Cleaning up this dead code or completing the intended optimization would improve code maintainability.

## Code References
- **Rust Implementation**: `wasm4pm/src/discovery.rs` -> `discover_ocel_dfg_per_type`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/ocel-kernel-bridge.test.ts`
