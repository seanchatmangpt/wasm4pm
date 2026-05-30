# Algorithm Evaluation: optimized_dfg

## Metadata
- **Algorithm ID:** `optimized_dfg`
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
- **Evidence Hash:** `3477fd9a3e42e1a54e66c4e36e9cc35cab8e4672d4609bbca3d283c8f0e25e86`
- **State:** `Closed`

## Algorithmic Role
Provides a highly optimized implementation for discovering Directly-Follows Graphs (DFG) from event logs. It prioritizes performance and scalability, making it suitable for processing massive event logs while maintaining the structural accuracy required for process discovery and bottleneck identification.

## Implementation Validation & Details
Based on the source code in `wasm4pm/src/ilp_discovery.rs`:
- The implementation counts node occurrences and edge frequencies (directly-follows relations) across all traces.
- Edge frequencies are normalized against the maximum observed frequency to scale them between 0 and 1.
- An optimization score is applied to each edge using configurable `fitness_weight` and `simplicity_weight` parameters: `(fitness_weight * normalized_freq) - (simplicity_weight * 0.1)`.
- Edges are retained in the resulting DFG only if their computed score is strictly greater than `0.1`, effectively acting as a parameterized noise filter to balance detail and readability.