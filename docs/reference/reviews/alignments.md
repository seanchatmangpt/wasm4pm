# Algorithm Review: alignments

## Algorithm ID & Domain
- **Algorithm ID**: `alignments`
- **Domain**: Process Mining / Conformance (A* Search Optimal Alignment Conformance Checking)

## Correctness Audit
- **Early Exit / Goal Detection**:
  - A* terminates when a popped state has consumed the entire trace (`state.trace_index == trace_len`) and the net marking matches a final marking: `petri_net.final_markings.is_empty() || petri_net.final_markings.iter().any(|fm| fm == &state.marking)` (lines 165-171).
  - An iteration limit `max_iterations = 100_000` is applied to prevent infinite loops in cyclic nets (lines 151-153).
- **Admissible Heuristic**:
  - The heuristic is hardcoded to return `0.0` (lines 116-118). This is equivalent to Dijkstra's algorithm. Because `0.0` never overestimates the remaining cost, the heuristic is mathematically **admissible**, which guarantees that the search will find the optimal alignment cost.
- **Division-by-Zero Protection**:
  - Average cost: `avg_cost = total_cost / finite_count as f64` is guarded by `if finite_count > 0` (lines 372-376).
  - Greedy alignments: `fitness = if total_moves == 0 { 1.0 } else { sync_count as f64 / total_moves as f64 }` (lines 473-477), preventing division by zero.
- **State Keys**:
  - Visited states are added to `closed_set`. The state key is generated deterministically by sorting marking entries:
    `marking_vec.sort_by_key(|(k, _)| k.as_str()); let state_key = (state.trace_index, format!("{:?}", marking_vec));` (lines 155-159). This prevents redundant search.

## Improvement Areas
- **Extremely High Memory and CPU Overhead in Search**:
  - **State Key Formatting**: Formatting the marking vector as a string (`format!("{:?}", marking_vec)`) on every single iteration is slow and causes excessive allocations. Instead, the key should be hashed or stored as a sorted `Vec<(String, usize)>` to avoid string allocations.
  - **State Vector Cloning**: The `AlignmentState` struct contains `path: Vec<String>` (line 23). During successor generation, this path is cloned: `let mut new_path = state.path.clone(); new_path.push(...)` (lines 189, 210, 236). Cloning path arrays on every node expansion consumes tons of heap memory and slows down the priority queue. A standard A* implementation should use parent state pointers or linked lists (`Rc<Node>`) to reconstruct paths at the end rather than storing them in every state.
  - **Linear Net Scans**: `can_fire` and `fire_transition` perform linear scans of `petri_net.arcs` (lines 67-78, 93-107) on every call. Building a preset/postset map beforehand would speed this up.

## Code References
- **Rust Implementation**: `wasm4pm/src/alignments.rs` (method: `compute_optimal_alignments` / `compute_trace_alignment`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `alignments`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
