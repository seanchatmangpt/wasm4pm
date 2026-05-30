# Algorithm Evaluation: playout

## Metadata
- **Algorithm ID:** `playout`
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
- **Evidence Hash:** `9fc8accc75427b47cdade487168c7e44f5edab65a96a5a07c49fcf3cea7503b5`
- **State:** `Closed`

## Algorithmic Role
Performs model playout to generate simulated event traces from process models such as Petri nets or BPMN diagrams. This algorithm is essential for creating synthetic data for testing, benchmarking conformance checking engines, and conducting "what-if" analyses to predict the impact of process changes.

## Implementation Validation & Details
Based on the source code in `wasm4pm/src/playout.rs`:
- Operates in two primary modes: Process Tree playout and Directly-Follows Graph (DFG) playout.
- **Process Tree Playout:** Executes a recursive evaluation. Sequence nodes chain children, XOR nodes select one random child, Parallel nodes enable all children, and Loop nodes execute a do-branch with an optional redo branch (30% probability).
- **DFG Playout:** Simulates a random walk over the graph starting from valid initial activities. It traverses outgoing edges uniformly at random and stops when it hits a terminal activity (with a 30% early-stop probability) or limits bounds (`min_trace_length` and `max_trace_length`).
- Both methods rely on the `fastrand` library for probabilistic traversal and determinism-safe simulation when seeded.