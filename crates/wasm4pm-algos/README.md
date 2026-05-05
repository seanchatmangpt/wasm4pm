# wasm4pm-algos

High-performance, branchless algorithm implementations for the wasm4pm process mining platform.

This crate provides the core algorithms for process discovery and conformance checking, optimized for speed and predictable latency.

## Features

- **Process Discovery**: Alpha Miner, Heuristic Miner, and Directly-Follows Graph (DFG) discovery.
- **Conformance Checking**: Token-based replay and other alignment algorithms.
- **Streaming**: Algorithms designed for incremental event ingestion.
- **Performance**: Optimized for minimal branch misses and cache-friendly execution.

## Usage

```rust
use wasm4pm_algos::dfg;
use wasm4pm_types::EventLog;

// Discover a DFG from an event log
// let log = ...;
// let dfg = dfg::discover_dfg(&log, "concept:name").unwrap();
```

## License

Licensed under either of

 * Apache License, Version 2.0 ([LICENSE-APACHE](https://github.com/seanchatmangpt/wasm4pm/blob/main/LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
 * MIT license ([LICENSE-MIT](https://github.com/seanchatmangpt/wasm4pm/blob/main/LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.
