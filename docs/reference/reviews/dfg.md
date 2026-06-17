# Algorithm Review: dfg (Directly-Follows Graph)

## Algorithm ID & Domain
- **Registry ID**: `dfg`
- **Domain**: Process Discovery

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` (an opaque string handle pointing to a loaded log in state) and `activity_key` (the attribute to extract activity names).
  - Returns a JSON string containing `nodes`, `edges`, `start_activities`, and `end_activities`.
- **Boundary Checks**:
  - Employs `wasm4pm_compat::admission::Admission` to guarantee schema admissibility.
  - Safely accesses the event log structure using a read-only borrow from the global state `get_or_init_state().with_object(eventlog_handle, |obj| ...)`.
  - Uses `saturating_sub(1)` when iterating over trace offsets (`0..col.trace_offsets.len().saturating_sub(1)`) to prevent subtraction overflow on empty logs.
  - Pre-sizes the hash map for edge frequencies using `n.saturating_mul(n) / 4 + 1` to prevent multiplication overflow.
- **Edge Cases & Errors**:
  - If the log is empty, it returns a DFG with empty nodes, edges, start, and end activity maps without panicking.
  - Deterministic sort `sorted_edges.sort_unstable_by_key(|&((f, t), _)| (f, t))` ensures identical output order for identical input logs.

## Improvement Areas
- **Performance Optimization**:
  - `discover_dfg_from_log` calls `log.value.to_columnar_owned(activity_key)` which allocates a fresh columnar copy. We can cache or reuse columnar representations.
  - For very large vocabularies, pre-sizing to `n² / 4` can result in excessive heap allocations in WebAssembly linear memory (e.g. `n = 10,000` -> `25,000,000` map capacity). Clamping the initial map capacity to a sensible upper limit (e.g., `1,000,000`) is recommended to prevent OOM.
- **Logic Refinement**:
  - If `activity_key` is missing in events, it defaults to mapping them to empty string keys. A structured refusal or validation check prior to discovery would improve robustness.

## Code References
- **Rust Implementation**: `wasm4pm/src/discovery.rs` -> `discover_dfg`, `discover_dfg_from_log`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
