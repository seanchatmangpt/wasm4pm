# Algorithm Evaluation: aco

## Metadata
- **Algorithm ID:** `aco`
- **Category:** `discovery`
- **Supported Profiles:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✓ Present
- **Dispatch:** ✓ Present
- **CLI:** ✓ Present
- **WASM:** ✓ Present

## Behavior Evidence
- **Positive Cases:** 1/1 Passed
- **Negative Cases:** 2/2 Failed Correctly
- **Invariant Cases:** 1/1 Passed

### Test Details
- **Positive:** `aco.valid_minimal_log` (Passed)
- **Negative:** `MALFORMED_EVENT_LOG`, `EMPTY_EVENT_LOG` (Failed Correctly)
- **Invariant:** `SeededRepeatabilityCase` (Passed)

## Evidence Hash
`25713174e4df1704b98660af8b1cd53552c59fb6a14985075933dfa431b0df57`

## Verification State
**Closed**

## Summary of Algorithmic Role
The `aco` (Ant Colony Optimization) algorithm is a metaheuristic used for discovering process models (often DFGs or Petri Nets) from event logs. It simulates the behavior of ants finding paths to food, applying pheromone updates to prioritize frequently observed activity transitions. This stochastic approach is particularly effective for complex logs where traditional deterministic miners might struggle with noise or incompleteness.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/genetic_discovery.rs`
- **Core Logic:** Implemented as `discover_aco_algorithm_from_log` and exposed via WASM as `discover_aco_algorithm`. It uses Ant Colony Optimization to discover process models by applying pheromone trails and frequency heuristics to construct DFG edge sets.
- **Data Structures:** Operates over a `ColumnarLog` optimization of the event log. Uses an MMAS-style (Max-Min Ant System) bounded pheromone approach to prevent NaN accumulation.
- **Constraints/Parameters:** Configurable via `ant_count` and `iterations`. Includes parameter validation (requires `ant_count >= 1` and `iterations >= 1`). Ensures deterministic execution.