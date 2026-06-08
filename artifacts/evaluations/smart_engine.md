# Algorithm Evaluation: smart_engine

## Identification
- **ID**: `smart_engine`
- **Category**: `discovery`
- **Status**: `Closed`

## Algorithmic Role
The `smart_engine` is a high-performance discovery algorithm optimized for both speed and model quality. It sits in the "Streaming & Smart Engine" tier, providing a balance between the extreme speed of SIMD-accelerated streaming DFGs and the higher quality requirements of batch discovery. It is designed to scale linearly while maintaining robust handling of noise in the event stream.

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
- **Evidence Hash**: `fa4dfe1dee5bdef6234dd1f8f9dda94409e21f9cf8df4ab7441c2c8a9dc67061`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/smart_engine.rs`
- **Core Function**: `SmartEngine` boundary, integrating `LruCache`, `ConvergenceMonitor`, and `FusedMultiPass`.
- **Mechanism**: Provides a fused computation engine. Features cross-algorithm result caching to answer repeated queries instantly, a convergence monitor to allow early termination of iterative metaheuristics, and shared internal graph caching.
- **Optimization Strategy**: The `FusedMultiPass` system computes a Directly-Follows Graph (DFG) exactly once per trace hash and shares it across all DFG-based algorithms. `ConvergenceMonitor` tracks metric improvements across a sliding window, halting iterations if the relative change drops below a set threshold.
- **Safety Features**: Designed for single-threaded WASM safety using `RefCell` instead of `Mutex` to avoid deadlocks. Stores engine instances in a global static mapping handled via an opaque identifier.