# Algorithm Evaluation: transition_system

## Identification
- **ID**: `transition_system`
- **Category**: `discovery`
- **Status**: `Closed`

## Algorithmic Role
The `transition_system` algorithm discovers a state-based reachability model from an event log. It maps sequences of activities to states and transitions, providing a formal substrate for prefix-completability and reachability analysis. It is highly deterministic and serves as a foundational model for more advanced conformance checking and prediction tasks.

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
- **Invariant Case (Deterministic Same Input)**: `Passed`

## Evidence Binding
- **Evidence Hash**: `90a789b69660e201abeb459f19a424b0d2e96e40713a4fc0eb2d84036ba59cec`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/transition_system.rs`
- **Core Function**: `discover_transition_system`
- **Mechanism**: Ports typical transition system discovery mechanisms (e.g. `pm4py`). Creates a fully realized state machine where each state represents a contextual view (a defined lookback window of contiguous activity sequences). Transitions describe execution paths moving between these deterministic states.
- **Optimization Strategy**: Aggregates identical activity sequences into a shared integer ID using `FxHashMap` for O(1) state resolution. Tracks transition counts natively. Highly configurable via the `window` (size of the activity history sequence) and `direction` (forward/backward construction) arguments.
- **Determinism**: Maps deterministic finite paths entirely without heuristic aggregation. Edge pairing logic relies strictly on sequential adjacency parsing for high fidelity predictability.