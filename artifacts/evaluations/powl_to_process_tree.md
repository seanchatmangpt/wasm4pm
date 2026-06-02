# Algorithm Evaluation: powl_to_process_tree

## Metadata
- **Algorithm ID:** `powl_to_process_tree`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Interface Status
- **Registry Entry:** ✅ Present
- **TypeScript Dispatch:** ✅ Present
- **CLI Surface:** ✅ Present
- **WASM Export:** ✅ Present

## Behavioral Evidence
- **Positive Cases:** 1/1 passed
- **Negative Cases:** 2/2 failed correctly
- **Invariant Cases:** 1/1 passed

## Verification
- **Evidence Hash:** `fae4ca808f8dbc41276a78d9df00ece1b6d3bbeea4f007df6b471d5f61909504`
- **State:** `Closed`

## Algorithmic Role
Converts Partially Ordered Workflow Language (POWL) models into hierarchical Process Trees. This conversion is vital for applying tree-based conformance checking and analysis techniques to POWL models, which are particularly well-suited for representing processes with complex nesting and choice structures.

## Implementation Validation & Details
Based on the source code in `wasm4pm/src/powl/conversion/from_process_tree.rs` and `wasm4pm/src/powl_api.rs`:
- The algorithm recursively converts POWL constructs into equivalent `PowlProcessTree` constructs.
- Basic operator nodes (e.g., XOR, Loop) and transition leaf nodes map directly.
- Complex `StrictPartialOrder` and `DecisionGraph` nodes undergo a structural decomposition:
  - It constructs a Directed Acyclic Graph (DAG) from the partial order.
  - A transitive reduction is applied to remove redundant alternative paths.
  - The reduced DAG is split into undirected connected components.
  - For each component, BFS is used to group nodes into topological levels. Nodes within the same level are mapped into Parallel branches, while the progression between levels constructs Sequential branches.