# Algorithm Evaluation: genetic_algorithm

## Meta
- **ID**: `genetic_algorithm`
- **Category**: `discovery`
- **Profiles**: `fast`, `balanced`, `quality`

## Status
- **Registry**: Present
- **Dispatch**: Present
- **CLI**: Present
- **WASM**: Present

## Behavior Evidence
- **Positive Case**: `passed`
- **Negative Cases**:
  - `MALFORMED_EVENT_LOG`: `failed_correctly`
  - `EMPTY_EVENT_LOG`: `failed_correctly`
- **Invariant Case**: `passed` (Stable: `true`)

## Evidence Hash
`1e4b21a72ae724279362a11cfe03af3c1cead5e013d6dee9dd2d61cb64c4e181`

## Verification State
**Closed**

## Algorithmic Role
Employs evolutionary computation techniques (selection, crossover, mutation) to discover complex process models (often Petri nets) that maximize fitness scores such as fitness, precision, and simplicity. It is particularly effective for large, complex logs where traditional heuristics may fail.

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/genetic_discovery.rs`
- **Algorithm Type**: Evolutionary computation-based process discovery.
- **Implementation Mechanism**: Initializes a random population of candidate edge sets representing prospective Directly Follows Graphs. The `ColumnarLog` optimization is used to accelerate the frequency extraction over the event log.
- **Evolutionary Process**: Evaluates candidates according to fitness functions (e.g. alignment fitness, precision) over a set number of generations. Employs a deterministic, fixed random seed (`StdRng::seed_from_u64(42)`) to ensure cross-run repeatability and stability of results.
- **Graph Transformation**: Outputs the ultimate evolutionary best fit as a `DirectlyFollowsGraph`.
