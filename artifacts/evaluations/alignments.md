# Algorithm Evaluation: alignments

## Metadata
- **Algorithm ID:** `alignments`
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
- **Positive:** `alignments.valid_minimal_log` (Passed)
- **Negative:** `MALFORMED_EVENT_LOG`, `EMPTY_EVENT_LOG` (Failed Correctly)
- **Invariant:** `DeterministicSameInputCase` (Passed)

## Evidence Hash
`891067bbcbdda06771bc603f6a2f2dd1905170d66c5fc10b9294332876808ec9`

## Verification State
**Closed**

## Summary of Algorithmic Role
The `alignments` algorithm is a foundational conformance checking technique. It maps traces from an event log to the closest possible paths in a process model, identifying "skips" (missing expected activities) and "insertions" (unplanned activities). This provides a precise, trace-level quantification of how well a real-world process adheres to its intended design.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/alignments.rs`
- **Core Logic:** Implemented as `compute_optimal_alignments`. It computes optimal trace alignments against a Petri Net using an A* search strategy.
- **Data Structures:** Retrieves the target `PetriNet` handle from the state store and computes the paths comparing model transitions (sync/model moves) against log traces (log moves).
- **Constraints/Parameters:** Accepts a JSON-based `cost_config` specifying `sync_cost`, `log_move_cost`, and `model_move_cost` allowing customized alignment penalty models (defaulting to 0.0, 1.0, 1.0 respectively).