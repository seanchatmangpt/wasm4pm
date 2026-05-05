# pictl-types

Binary data structures for the pictl process mining platform.

This crate defines the canonical types used throughout the pictl ecosystem, including event logs, process models, and conformance results.

## Key Types

- **Event Logs**: `EventLog`, `Trace`, `Event`, and `OCEL` (Object-Centric Event Logs).
- **Process Models**: `DFG` (Directly-Follows Graph), `PetriNet`, and `DeclareModel`.
- **Conformance**: `ConformanceResult` and `TokenReplayResult`.
- **Utilities**: `Blake3Hash` for provenance and `Error`/`Result` types.

## Usage

```rust
use pictl_types::{EventLog, Trace, Event, Attributes};

// Create a simple event log
let mut log = EventLog {
    traces: vec![],
    attributes: Attributes::new(),
    format: "XES".to_string(),
};
```

## License

Licensed under either of

 * Apache License, Version 2.0 ([LICENSE-APACHE](https://github.com/seanchatmangpt/pictl/blob/main/LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
 * MIT license ([LICENSE-MIT](https://github.com/seanchatmangpt/pictl/blob/main/LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.
