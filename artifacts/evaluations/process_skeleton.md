# Algorithm Evaluation: process_skeleton

## Metadata
- **Algorithm ID:** `process_skeleton`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** `true`
- **Dispatch:** `true`
- **CLI:** `true`
- **WASM:** `true`

## Behavioral Evidence
- **Positive Cases:** 1 passed
- **Negative Cases:** 2 failed correctly (`MALFORMED_EVENT_LOG`, `EMPTY_EVENT_LOG`)
- **Invariant Cases:** 1 passed (Deterministic)

## Evidence Hash
`1518130c1414a1a3b4dbbf15d6167a61b3c801ddd4749a24d75471215c27bd7e`

## Verification State
**Closed**

## Summary
`process_skeleton` (Process Skeleton) is a high-speed discovery algorithm (O(n)) designed to extract the most fundamental structure of a process. It identifies start activities, end activities, and the core transitions that connect them. It is particularly useful for rapid initial assessment of large event logs where a full DFG or Petri net discovery might be computationally expensive.

## Implementation Validation & Details
- **Source Code Path:** `wasm4pm/src/more_discovery.rs`.
- **Core Logic:** The implementation extracts a minimal Directly-Follows Graph (DFG) structure. It computes the absolute frequencies of nodes and directly-follows relations (edges) from the event log and aggressively filters them against a `min_frequency` threshold.
- **Dispatch Mechanism:** Exposed via the `extract_process_skeleton` WASM function, which directly returns the simplified process tree/graph structure for fast visualization and assessment.
