# Algorithm Review: powl_to_process_tree

## Algorithm ID & Domain
- **Algorithm ID**: `powl_to_process_tree`
- **Domain**: Process Mining / Conversion (POWL to Process Tree Conversion)

## Correctness Audit
- **Early Exit / Node Bounds**:
  - `apply_recursive` handles `None` nodes by returning a leaf transition `None` (line 124).
  - Out of bounds protection in the WASM wrapper: `if arena.is_empty() || root >= arena.len() as u32` is checked inside `powl_to_process_tree` (lines 252-254 of `powl_api.rs`), returning an error on invalid roots.
- **Strict Partial Order and Decision Graph Leveling**:
  - For `StrictPartialOrder` and `DecisionGraph` nodes, the algorithm performs transitive reduction on the order relation (lines 156, 237).
  - It finds undirected components (lines 157, 238).
  - It assigns levels inside each component using `assign_levels` (lines 182, 263), which represents topological sequencing.
  - If a group has a single node, it recursively translates it. If a level group has multiple nodes, they are wrapped in a Parallel process tree (lines 202, 283).
  - Multiple levels are chained into a Sequence process tree (lines 208, 289).
- **Critical Correctness Bug (Silent Drop of Cyclic Nodes)**:
  - In `Dag::assign_levels` (lines 33-53), it assigns levels using BFS. The initial queue is populated with nodes of in-degree 0.
  - If a `DecisionGraph` contains a cycle (which is permitted in Decision Graphs), the nodes in the cycle will never have their in-degrees reduced to 0. Consequently, their levels in `levels` will remain `usize::MAX`.
  - When grouping nodes by level:
    ```rust
    for (li, &lv) in levels_map.iter().enumerate() {
        if lv != usize::MAX {
            level_groups[lv].push(li);
        }
    }
    ```
    Any node with level `usize::MAX` is silently ignored. This means cyclic components in a `DecisionGraph` are completely deleted from the generated `ProcessTree`, and no error is thrown! This is a major correctness flaw when converting cyclic models.

## Improvement Areas
- **Handle Cycles / Throw Error**:
  - Since process trees are strictly acyclic, they cannot represent arbitrary cycles (except via structured `Loop` operators). If a `DecisionGraph` has cycles that cannot be structured into loops, the converter should either throw an error or handle the cyclic components explicitly rather than silently dropping the cyclic nodes.
- **ChoiceGraph Approximation**:
  - Choice Graphs are approximated by collecting all `SubModel` nodes and wrapping them in an XOR operator (lines 300-318). While lossy, this is a reasonable fallback for visualization.

## Code References
- **Rust Implementation**: `wasm4pm/src/powl/conversion/to_process_tree.rs` (method: `apply` / `apply_recursive`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `powl_to_process_tree`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
