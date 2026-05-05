# tps-metrics

Toyota Production System (TPS) metrics collection and analysis tool for software development.

This CLI tool analyzes git repositories to provide insights into development rhythm, lead times, and process unevenness, applying lean manufacturing principles to software engineering.

## Features

- **Takt Time**: Analysis of production rhythm and commit frequency.
- **Lead Time**: Time from first commit to merge/deployment.
- **Mura (Unevenness)**: Detection of bursts and gaps in development activity.
- **Value Stream Mapping**: Identification of value-added vs. non-value-added time.
- **Andon Dashboard**: Real-time status of the development process.

## Installation

```bash
cargo install tps-metrics
```

## Usage

```bash
# Run all analyses on the current repository
tps-metrics all

# Check lead time for the last 60 days
tps-metrics lead --days 60

# Get a real-time status dashboard
tps-metrics andon
```

## Commands

- `all`: Run all TPS analyses.
- `takt`: Takt time (production rhythm) analysis.
- `lead`: Lead time (commit to merge) analysis.
- `mura`: Mura (unevenness) detection.
- `value-stream`: Value stream mapping.
- `andon`: Real-time status dashboard.

## License

Licensed under either of

 * Apache License, Version 2.0 ([LICENSE-APACHE](https://github.com/seanchatmangpt/wasm4pm/blob/main/LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
 * MIT license ([LICENSE-MIT](https://github.com/seanchatmangpt/wasm4pm/blob/main/LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.
