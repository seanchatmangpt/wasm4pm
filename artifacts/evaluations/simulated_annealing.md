# Algorithm Evaluation: simulated_annealing

## Identification
- **ID**: `simulated_annealing`
- **Category**: `discovery`
- **Status**: `Closed`

## Algorithmic Role
`simulated_annealing` is a process discovery algorithm that employs the simulated annealing metaheuristic to explore the search space of process models (typically DFGs or Petri nets). By allowing probabilistic acceptance of inferior solutions, it effectively escapes local optima, making it particularly suitable for discovering models from complex event logs where traditional greedy approaches might fail. It prioritizes high fitness and generalization.

## Support Profiles
- `fast`
- `balanced`
- `quality`

## Reachability Status
- **Registry**: `Present`
- **Dispatch**: `Present`
- **CLI**: `Present`
- **WASM**: `Present`

## Behavior Results
- **Positive Case**: `Passed`
- **Negative Case (Malformed Log)**: `Failed Correctly (MALFORMED_EVENT_LOG)`
- **Negative Case (Empty Log)**: `Failed Correctly (EMPTY_EVENT_LOG)`
- **Invariant Case (Seeded Repeatability)**: `Passed`

## Evidence Binding
- **Evidence Hash**: `cc2eb65f520092f617d4ef84bed96047c739e532c0f3a763773364c0f6453021`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/more_discovery.rs`
- **Core Function**: `discover_simulated_annealing_from_log`
- **Mechanism**: Explores the Directly Follows Graph (DFG) search space by adding or removing individual edges from a predefined vocabulary (`edge_vocab`) of observed behaviors.
- **Optimization Strategy**: Standard Simulated Annealing approach using `temperature` and `cooling_rate`. Evaluates DFG fitness (`evaluate_edges_fitness`). Accepts worse states stochastically to escape local optima (`P = exp(delta / temp)`).
- **Determinism**: Seeded repeatability is explicitly guaranteed using `StdRng::seed_from_u64(42)` and deterministic edge selection methods.
- **Safety Features**: Includes bounds-checking and NaN safety guards (PR #54) to clamp invalid temperature (clamped between 0.02 and 1e6) and cooling_rate inputs, preventing infinite loops or divergent state spaces.
