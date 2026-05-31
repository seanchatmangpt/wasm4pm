# Algorithm Evaluation: dfg

## Meta
- **ID**: `dfg`
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
  - `EMPTY_EVENT_LOG`: `failed_correctly`
  - `MALFORMED_EVENT_LOG`: `failed_correctly`
- **Invariant Case**: `passed` (Stable: `true`)

## Evidence Hash
`36897bb008d29cb83744142c3abaa8b5dfc74cee4666cff299bb8b0f7f13f62f`

## Verification State
**Closed**

## Algorithmic Role
The Directly-Follows Graph (DFG) is a fundamental process discovery algorithm that maps activities to their immediate successors based on event logs. It serves as the baseline for many other discovery techniques and is essential for rapid process visualization and streaming analysis.

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/smart_engine.rs`, `wasm4pm/src/advanced/ocdfg.rs`, `wasm4pm/src/streaming/streaming_dfg.rs`
- **Algorithm Type**: Graph Construction / Directed Follows Graph (DFG).
- **Implementation Mechanism**: Extracts the frequency of activities (nodes) and immediate transitions (edges: `A -> B`) sequentially across event traces.
- **Optimization Strategy**: The core DFG builder implements a `FusedMultiPass` architecture with an caching layer. It hashes incoming traces to reuse a previously constructed DFG, which significantly speeds up dependent algorithms (like heuristic miner and process skeleton) that build upon the DFG.
- **Streaming & Hardware Acceleration**: Specialized variants are available, including streaming processing over continuous logs and SIMD-accelerated graph constructions (`wasm4pm/src/simd_streaming_dfg.rs`).
