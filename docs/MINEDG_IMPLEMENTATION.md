# MineDG Choice Graph Discovery Implementation

## Overview

This document describes the implementation of the MineDG algorithm for choice graph discovery in wasm4pm. The MineDG algorithm discovers partial-order process models by partitioning activities based on cyclic dependencies in the directly-follows graph (DFG).

## Algorithm: MineDG (Mine Decision Graph)

### Purpose
MineDG discovers a choice graph structure when no other cut (XOR, Sequence, Concurrency, Loop) applies. A choice graph is appropriate when there are non-trivial cyclic dependencies among activities, suggesting flexible choice points rather than simple ordering.

### Steps

```
MineDG(L):
1. Initialize A = {{a} | a ∈ Σ_L}  // Each activity is its own partition
2. For each ordered pair (a1, a2) where a1 ↦⁺ a2 AND a2 ↦⁺ a1 (cycles):
     - Find the partitions containing a1 and a2
     - Merge them into a single partition
3. If |A| == 1: return None  // No valid choice graph cut
4. Build choice graph G = (N, E):
     - N = X ∪ {▷, □}  // X = partition nodes, ▷ = start, □ = end
     - For each (A_i, A_j) pair: edge exists iff A_i ↦ A_j AND A_i ≠ A_j
     - Add edge (▷, A_i) if A_i ∩ L▷ ≠ ∅
     - Add edge (A_i, □) if A_i ∩ L□ ≠ ∅
     - Add edge (▷, □) if ⟨⟩ ∈ L (empty trace exists)
5. Return (A, G)
```

### Core Functions

#### `is_reachable(dfg: &HashSet<(String, String)>, from: &str, to: &str) -> bool`
Checks if activity `from` can reach activity `to` in the DFG using breadth-first search.
- Returns true if there exists a path from `from` to `to`
- Handles the reflexive case: `is_reachable(a, a) = true`

#### `find_cycles(dfg: &HashSet<(String, String)>, activities: &HashSet<String>) -> Vec<(String, String)>`
Finds all ordered pairs (a1, a2) where a1 ↦⁺ a2 AND a2 ↦⁺ a1.
- Uses `is_reachable` to check bidirectional paths
- Returns list of cycle edges for union-find merging

#### `UnionFind` Data Structure
Implements the standard Union-Find (Disjoint Set Union) pattern with path compression.
- `new(activities)`: Initialize with each activity as its own set
- `find(x)`: Find the root of the set containing x
- `union(x, y)`: Merge the sets containing x and y
- `get_partitions()`: Extract final partitions as a vector of HashSets

#### `build_partition_edges(dfg: &HashSet<(String, String)>, partitions: &[HashSet<String>]) -> HashSet<(usize, usize)>`
Builds edges between partitions based on DFG reachability.
- For each partition pair (i, j):
  - Edge (i, j) exists iff some activity in partition i reaches some activity in partition j
  - Early exit optimization when edge is found

#### `discover_choice_graph(dfg, activities, start_activities, end_activities, has_empty_trace) -> Option<(Vec<HashSet<String>>, HashSet<(usize, usize)>)>`
Main entry point for MineDG algorithm.
- Returns `Some((partitions, edges))` if valid choice graph exists (|partitions| > 1)
- Returns `None` if only one partition (no choice graph cut possible)

## Integration into Fall-Through Strategy

### Architecture

The fall-through strategy now has three levels:

```
decision_graph_fall_through()
  ├── choice_graph_fall_through()  [Primary: MineDG]
  │   ├── discover_choice_graph()  [MineDG algorithm]
  │   └── build_choice_graph_model()  [Convert to POWL]
  ├── standard_decision_graph_fall_through()  [Fallback: Standard DG]
  └── flower_model_fall_through()  [Last resort: Flower]
```

### Choice Graph Fall-Through (`choice_graph_fall_through`)

1. Collect all unique activities from traces
2. Build DFG from consecutive activity pairs
3. Identify start/end activities (no incoming/outgoing edges)
4. Call `discover_choice_graph()`
5. If successful, build POWL model via `build_choice_graph_model()`
6. If unsuccessful (None returned), fall back to standard decision graph

### POWL Model Construction (`build_choice_graph_model`)

Converts discovered partitions into a POWL DecisionGraph node:

1. Create a transition node for each activity
2. Group activities by partition (if multiple per partition, create XOR)
3. Create partition-level order relation from partition edges
4. Identify start/end partitions based on membership of start/end activities
5. Create DecisionGraph with:
   - `children`: Partition nodes (XOR or single transition)
   - `order`: Partition-level adjacency matrix
   - `start_nodes`: Partition indices reachable from start activities
   - `end_nodes`: Partition indices reachable to end activities
   - `empty_path`: Whether empty trace exists

## Examples

### Example 1: Simple Cycle (A ↔ B)

```
Traces: [A, B], [B, A]
DFG: A→B, B→A

MineDG Steps:
1. Initial partitions: {A}, {B}
2. Cycles found: (A,B), (B,A)
3. Union A and B → single partition {A, B}
4. Result: |partitions| = 1 → return None

Outcome: Falls back to standard decision graph
```

### Example 2: Choice Structure (A → {B|C} → D)

```
Traces: 
  [A, B, D], [A, C, D], [A, B, C, D], [A, C, B, D]
DFG: A→B, A→C, B→D, C→D, B→C, C→B

MineDG Steps:
1. Initial partitions: {A}, {B}, {C}, {D}
2. Cycles found: (B,C), (C,B)
3. Union B and C → partitions: {A}, {B,C}, {D}
4. Build partition edges:
   - (0, 1): A reaches B or C ✓
   - (1, 2): B or C reaches D ✓
5. Return partitions and edges

Outcome: Valid 3-partition choice graph
  - Partition 0 {A}: start node
  - Partition 1 {B,C}: choice point (XOR)
  - Partition 2 {D}: end node
  - Edges: (0→1), (1→2)
```

### Example 3: Retail Order Process

```
Activities: Start, Receive, Create, Confirm, Process, Package, Ship, End
Cycles: (Receive ↔ Create), (Confirm ↔ Process), (Package ↔ Ship)

MineDG Steps:
1. Initial: 8 single-activity partitions
2. After cycle merging:
   - {Start}
   - {Receive, Create}
   - {Confirm, Process}
   - {Package, Ship}
   - {End}
3. Build partition edges from DFG reachability
4. Result: 5 partitions with appropriate edges

Outcome: Hierarchical choice graph representing choice points
```

## Implementation Details

### Data Structures

#### `DFG: HashSet<(String, String)>`
Directly-follows graph as edge set (directed graph).

#### `Partitions: Vec<HashSet<String>>`
List of activity sets, where each set represents a partition.

#### `Partition Edges: HashSet<(usize, usize)>`
Edges between partition indices (0-indexed into the partitions vector).

#### `BinaryRelation` (from `powl_arena`)
Sparse adjacency matrix for order relations, supporting:
- `add_edge(i, j)`: Add edge from i to j
- `is_edge(i, j)`: Check edge existence
- Used for partition-level ordering and final DecisionGraph order

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| `is_reachable(a, b)` | O(\|V\| + \|E\|) | BFS across all vertices/edges |
| `find_cycles()` | O(\|V\|² × (\|V\| + \|E\|)) | All pairs reachability check |
| `UnionFind operations` | O(α(n)) amortized | With path compression |
| `build_partition_edges()` | O(\|P\|² × (\|V\| + \|E\|)) | All partition pairs, check reachability |
| Overall `discover_choice_graph()` | O(\|V\|² × (\|V\| + \|E\|)) | Dominated by cycle detection |

Where \|V\| = activities, \|E\| = DFG edges, \|P\| = partitions

### Space Complexity

- DFG: O(\|E\|)
- UnionFind: O(\|V\|)
- Partitions: O(\|V\|)
- Total: O(\|V\| + \|E\|)

## Testing

### Unit Tests in `choice_graph.rs`

```rust
#[test] test_is_reachable_direct()
#[test] test_is_reachable_transitive()
#[test] test_find_cycles_simple()
#[test] test_union_find()
#[test] test_discover_choice_graph_with_cycles()
#[test] test_discover_choice_graph_no_cycles()
#[test] test_discover_choice_graph_single_activity()
```

### Integration Tests in `fall_through.rs`

```rust
#[test] test_choice_graph_minedg_with_simple_cycle()
#[test] test_choice_graph_minedg_with_complex_cycles()
#[test] test_choice_graph_minedg_no_cycles()
#[test] test_choice_graph_minedg_single_activity()
#[test] test_standard_decision_graph_fall_through()
#[test] test_build_choice_graph_model_two_partitions()
#[test] test_build_choice_graph_model_three_partitions()
```

### Integration Test Suite (`tests/minedg_choice_graph_test.rs`)

Comprehensive tests covering:
- Simple cycles, linear sequences, complex choice structures
- Reachability and cycle detection
- Partition edge building
- Real-world retail order example
- Edge cases (single activity, empty log)

## Verification

### Correctness Criteria

1. **Partition Validity**: Each activity appears in exactly one partition
2. **Cycle Closure**: If a ↔ b, then a and b are in same partition
3. **No Premature Merging**: Activities without cycles remain separate
4. **Edge Correctness**: Edge (i, j) exists iff partition i reaches partition j in DFG
5. **Cut Validity**: Result is None iff single partition (invalid as choice graph)

### Oracle Types (Chicago TDD)

- **Rank 1 (Mathematical)**: Reachability properties, Union-Find correctness
- **Rank 2 (Domain Contract)**: Cycle detection accuracy, partition merging rules
- **Rank 3 (Metamorphic)**: Adding edges to DFG → more or same partitions merged
- **Rank 4 (Statistical)**: Algorithm deterministic (same input → same output)

## Future Enhancements

1. **Incremental Cycle Detection**: Cache reachability to avoid recomputation
2. **Strongly Connected Components**: Use Tarjan's or Kosaraju's algorithm for cycles
3. **Weighted Edges**: Support frequency-based DFG for noise filtering
4. **Hybrid Strategies**: Combine MineDG with other cut detection strategies
5. **Performance Benchmarks**: Measure on large event logs (10K+ events)

## References

- Algorithm: van der Aalst et al., "Unlocking Non-Block-Structured Decisions: Inductive Mining with Choice Graphs" (arXiv:2505.07052)
- Process Mining: "Process Mining: Data Science in Action" (van der Aalst, 2016)
- POWL Models: Kourani, Park, van der Aalst on choice graphs and flexible workflows

## File Locations

```
wasm4pm/src/powl/discovery/choice_graph.rs     # MineDG algorithm implementation
wasm4pm/src/powl/discovery/fall_through.rs     # Fall-through integration
wasm4pm/tests/minedg_choice_graph_test.rs      # Integration tests
packages/*/src/__tests__/                      # TypeScript unit tests (when wrapped)
```

## Known Limitations

1. **O(V²) Cycle Detection**: For dense graphs with many activities, cycle finding is slow
2. **No Frequency Filtering**: All DFG edges treated equally (could filter low-frequency)
3. **Determinism**: Algorithm is deterministic but order of partition processing may vary with HashMap iteration
4. **Single Return Type**: Returns complete partitions (could support incremental discovery)

## Example Invocation

```rust
use std::collections::HashSet;
use wasm4pm::powl::discovery::choice_graph::discover_choice_graph;

let dfg: HashSet<(String, String)> = vec![
    ("A".to_string(), "B".to_string()),
    ("B".to_string(), "A".to_string()),
    ("B".to_string(), "C".to_string()),
    ("C".to_string(), "B".to_string()),
].into_iter().collect();

let activities: HashSet<String> = vec!["A", "B", "C"]
    .into_iter()
    .map(|s| s.to_string())
    .collect();

let start_activities = vec!["A".to_string()].into_iter().collect();
let end_activities = vec!["C".to_string()].into_iter().collect();

let result = discover_choice_graph(&dfg, &activities, &start_activities, &end_activities, false);

match result {
    Some((partitions, edges)) => {
        println!("Partitions: {:?}", partitions);
        println!("Edges: {:?}", edges);
    }
    None => {
        println!("No valid choice graph (single partition)");
    }
}
```
