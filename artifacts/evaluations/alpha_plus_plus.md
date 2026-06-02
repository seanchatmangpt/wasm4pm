# Algorithm Evaluation: alpha_plus_plus

## Metadata
- **Algorithm ID:** `alpha_plus_plus`
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
- **Positive:** `alpha_plus_plus.valid_minimal_log` (Passed)
- **Negative:** `MALFORMED_EVENT_LOG`, `EMPTY_EVENT_LOG` (Failed Correctly)
- **Invariant:** `DeterministicSameInputCase` (Passed)

## Evidence Hash
`71997777fabf84132ed1307bd74189cae03a53abdbab77ed7698ec272da32c2e`

## Verification State
**Closed**

## Summary of Algorithmic Role
The `alpha_plus_plus` algorithm is an advanced process discovery technique that extends the classic Alpha miner. It is designed to discover Petri Net models from event logs while overcoming limitations of the original Alpha algorithm, such as the inability to detect short loops and complex non-local dependencies. It is frequently used for rapid, high-quality Petri Net synthesis.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/algorithms.rs`
- **Core Logic:** Implemented as `alpha_plus_plus_inner` and exposed to WASM via `discover_alpha_plus_plus`. Synthesizes a Petri Net from an event log using frequency heuristics and footprint matrix relations.
- **Data Structures:** Constructs and returns a structured `PetriNet` consisting of places, transitions, and arcs. It interacts with the log by extracting all activities and directly-follows relationships.
- **Constraints/Parameters:** Incorporates a `min_support` threshold to filter out low-frequency noise before footprint matrix generation.