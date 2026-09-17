<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/reference/reviews/ocel_petri_net.md; source-sha256: 4d497749c6d8d477119745b39b2019aeffce93523011df68dae7c11c63c9d509; reason: tooling or agent control surface -->

# Algorithm Review: ocel_petri_net

## Algorithm ID & Domain
- **Registry ID**: `ocel_petri_net`
- **Domain**: Object-Centric Process Discovery

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `ocel_handle` and `algorithm`.
  - Returns a JSON object containing the discovered Object-Centric Petri Nets (OCPN) where places are annotated with their object types.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::OCEL`.
  - Correctly flattens the OCEL for each object type to a single-type EventLog via `flatten_ocel_to_eventlog_for_type`.
  - Annotates places in the discovered Petri net with the `object_type` attribute.
  - Guards algorithm parameter: checks if it is `"alpha++"`, `"alpha-plus-plus"`, or `"heuristic"` (falls back to alpha++ with warning), and returns an error for unknown algorithms.
- **Edge Cases & Errors**:
  - `flatten_ocel_to_eventlog_for_type` returns an error if no objects are found for the target type.
  - Safe error propagation: propagates errors from the alpha++ Petri Net discovery and the state storage module.

## Improvement Areas
- **Performance Optimization**:
  - Double serialization/deserialization: `discover_alpha_plus_plus` takes a stored log handle, discovers a Petri Net, converts it to `JsValue`, then `discover_oc_petri_net` parses this back into `serde_json::Value` to annotate places, and finally serializes it back to JS. This round-trip between JS/Rust value types within the WASM runtime adds significant serialization overhead. A pure Rust discovery pipeline without intermediate JS values would be much faster.
  - `flatten_ocel_to_eventlog_for_type` performs a linear scan over all events in the OCEL for each object of the target type: `for obj in target_objects { ocel.events.iter().filter(...) }`. If there are O objects and E events, this takes O(O * E). A single index mapping object IDs to their referencing event indices would optimize this to O(O + E).

## Code References
- **Rust Implementation**: `wasm4pm/src/oc_petri_net.rs` -> `discover_oc_petri_net`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/ocel-kernel-bridge.test.ts`
