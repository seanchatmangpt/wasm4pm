# Algorithm Review: process_skeleton

## Algorithm ID & Domain
- **Registry ID**: `process_skeleton`
- **Domain**: Process Discovery

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle`, `activity_key`, and `min_frequency` (usize).
  - Returns a JSON string summarizing the stored DFG and its handle.
- **Boundary Checks & Bugs**:
  - **CRITICAL CORRECTNESS BUG**: When initializing `dfg.nodes`, the frequency is hardcoded to `0`:
    ```rust
    dfg.nodes.push(DFGNode {
        id: activity.clone(),
        label: activity.clone(),
        frequency: 0,
    });
    ```
    This frequency is never updated during skeleton extraction. Consequently, all node frequencies in the output model are returned as `0`.
  - **MISSING START/END ENTRIES**: The method does not populate `start_activities` or `end_activities` in the `DFG` structure. The returned skeleton is thus incomplete compared to a standard DFG.
- **Edge Cases**:
  - Handles non-existent log handles gracefully by returning a JS error.

## Improvement Areas
- **Performance Optimization**:
  - The filtering logic compiles a set of nodes having active edges:
    ```rust
    let nodes_with_edges: HashSet<String> = dfg
        .edges
        .iter()
        .flat_map(|e| vec![e.from.clone(), e.to.clone()])
        .collect();
    ```
    This `flat_map` allocates a temporary `Vec` and performs two string clones per edge. This can be optimized by using references `HashSet<&str>` or folding in-place to avoid allocations.
- **Logic Refinement**:
  - Re-compute node frequencies from the columnar log or populate them directly from the raw event counts.
  - Correctly extract start and end activities.

## Code References
- **Rust Implementation**: `wasm4pm/src/more_discovery.rs` -> `extract_process_skeleton`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/discovery-otel-spans.test.ts`
