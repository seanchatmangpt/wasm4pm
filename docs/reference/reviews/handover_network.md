# Algorithm Review: handover_network

## Algorithm ID & Domain
- **Registry ID**: `handover_network`
- **Domain**: Social Network / Organizational Mining

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `log_handle` (the identifier of a loaded event log in the global state) and `resource_key` (the event attribute mapping to originators, typically `"org:resource"`).
  - Returns a JSON string representing a social network with `nodes` (containing `id`, `label`, and `workload`) and `edges` (containing `from`, `to`, and `handovers`).
- **Boundary Checks**:
  - Retrieves the log from state using `get_or_init_state().with_object(log_handle, |obj| ...)` and validates that the object is of type `StoredObject::EventLog`, returning appropriate `JsValue` errors if not found or if the handle points to a different type.
  - Uses `saturating_sub(1)` when iterating over event pairs to prevent subtraction overflow when the resource list for a trace contains 0 or 1 elements: `for i in 0..resources.len().saturating_sub(1)`.
- **Edge Cases & Errors**:
  - Safely extracts resource attributes using `attributes.get(resource_key).and_then(|v| v.as_string())`, which prevents crashes if the attribute is missing or of an unexpected type.
  - Skips self-handovers where the source and target resource are the same (`if r1 != r2`), ensuring only actual inter-agent handovers are recorded.
  - Returns empty nodes and edges lists if the event log contains no traces or no events with the specified resource attribute.

## Improvement Areas
- **Performance Optimization**:
  - The algorithm collects resource strings into a temporary vector of `Option<String>` for each trace, then loops over them twice: once to count workloads and once to compute transitions. This incurs multiple allocations per trace. Converting these resource names to integer IDs or using referenced slices (`&str`) during processing would drastically reduce WASM linear memory allocations and garbage collection overhead.
  - Cloning string values during hash map inserts (`r.clone()` and `r1.clone()`, `r2.clone()`) creates significant memory pressure. A string pool/interner would alleviate this.
- **Logic Refinement**:
  - The workload count accumulates every appearance of a resource in any trace, while the handovers map tracks transitions. If a resource appears multiple times in a trace, its workload is incremented accordingly. However, if the resource performs consecutive activities, the handover check skips them. This is correct by definition but could be documented clearly.

## Code References
- **Rust Implementation**: `wasm4pm/src/social_network.rs` -> `discover_handover_network`, `discover_handover_network_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
