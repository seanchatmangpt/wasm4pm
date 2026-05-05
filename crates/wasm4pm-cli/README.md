# wasm4pm

High-performance process mining CLI for the Vision 2030 architecture.

## Overview

`wpm` (wasm4pm) is the primary command-line interface for the `wpm` (wasm4pm) platform. It provides tools for system diagnostics, project initialization, real-time event routing (telco), and core process mining operations like discovery and conformance checking.

## Installation

```bash
cargo install --path crates/pictl
```

## Commands

### `doctor`
Check the health of your system and dependencies.

### `wizard`
Interactive setup for new process mining projects.

### `telco`
Nanosecond-latency event routing and architecture management.
- `status`: Show system operational state.
- `map`: Visualize event flow mapping.
- `dispatch`: Simulate high-performance event routing.

### `mining`
Core process mining operations.
- `discover`: Generate a process model from an event log.
- `conformance`: Check if a log aligns with a model.

### `config`
Manage CLI configuration settings.

### `man`
Generate full Markdown documentation for all commands.

## License

MIT OR Apache-2.0
