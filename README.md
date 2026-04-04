<div align="center">
<h1><strong>Rust4PM</strong>: Rust for Process Mining</h1>
  <p><strong><code>process_mining</code> Rust Crate</strong></p>
  <p>
    <a href="https://crates.io/crates/process_mining">
        <img src="https://img.shields.io/crates/v/process_mining.svg" alt="Crates.io"/></a>
    <a href="https://crates.io/crates/process_mining">
        <img src="https://img.shields.io/crates/d/process_mining" alt="Downloads"/></a>
	<a href="https://docs.rs/process_mining">
        <img src="https://img.shields.io/badge/docs.rs-process_mining-blue" alt="Documentation"/></a>
  </p>
<img src="logo.png" width="300" alt="Rust4PM Logo: A crab with a miner hat hitting a bunch of stone cubes with a pickaxe."/>
</div>


## `process_mining`

This crate contains basic data structures, functions and utilities for Process Mining.

Full documentation of the modules, structs and functions of this crate is available at **[docs.rs/process_mining/](https://docs.rs/process_mining/)**.

_As this crate is still in very active development, expect larger API changes also in minor (or even patch) version updates._


### Contributing

#### Test Data

The data (OCEL2, XES, etc. files) used for the tests of this crate are available for download at <https://rwth-aachen.sciebo.de/s/4cvtTU3lLOgtxt1>.
Simply download this zip and extract it into the `test_data` folder.

#### Linting and Formatting

We use automatic CI pipelines for checking lint and formatting rules of the `process_mining` crate.
See the corresponding .yml file for the exact checks.
You can and should test your changes also locally, e.g., using `cargo clippy --all-targets --all-features -- -D warnings`, `cargo fmt --all --check`
and `cargo test --verbose --all-features` inside the `process_mining` folder.
To test integrity of the documentation, use `RUSTDOCFLAGS="-D warnings" cargo doc --all-features --no-deps` (on Windows `PowerShell` you might need to set the `RUSTDOCFLAGS` env variable differently).

To apply compatible lint and formatting rules automatically, run `cargo clippy --all-targets --all-features --fix --allow-staged` and `cargo fmt --all` in the `process_mining` folder.

#### Releasing New Versions
Whenever a new version of the Rust4PM project is released, the following steps have to be completed:
1. Increase the version number
2. Also increase the version numbers of the r4pm CLI bindings, the macro crate, and the Python bindings.
3. Run all tests, check formatting and clippy lints. Also build the documentation.
  - `cargo clippy --all-targets --all-features --fix --allow-staged`
  - `cargo clippy --all-targets --all-features -- -D warnings`
  - `cargo test --verbose --all-features`
  - `cargo fmt --all --check`
  - `RUSTDOCFLAGS="-D warnings" cargo doc --all-features --no-deps`
  - All checks at once: `export RUSTDOCFLAGS="-D warnings" && cargo clippy --all-targets --all-features -- -D warnings && cargo test --verbose --all-features && cargo fmt --all --check && cargo doc --all-features --no-deps`
4. Publish the new macro crate version (first) and then the new `process_mining` version (second) to crates.io
5. Build the Python bindings and publish the updated version to PyPi
6. Export a updated bindings json file (`cargo test export_bindings --features bindings,dataframes,ocel-sqlite`) and add the new version to the docs ([rust4pm.aarkue.eu](https://rust4pm.aarkue.eu/))

## `r4pm`
CLI automatically generated from functions exposed in the `process_mining` crate.

## `process_mining_wasm`
WebAssembly and JavaScript bindings for the `process_mining` crate, enabling process mining in the browser and Node.js.

### Quick Start

```bash
npm install process_mining_wasm
```

```javascript
const pm = require('process_mining_wasm');

pm.init();

// Load an event log
const logHandle = pm.load_eventlog_from_xes(xesContent);

// Analyze it
const stats = pm.analyze_event_statistics(logHandle);
console.log(JSON.parse(pm.object_to_json(stats)));

// Discover process models
const dfg = pm.discover_dfg(logHandle);
```

### Documentation

- [Getting Started Guide](./process_mining_wasm/GETTING_STARTED.md) - Quick start and common workflows
- [API Reference](./process_mining_wasm/API.md) - Complete function documentation
- [Architecture Guide](./process_mining_wasm/ARCHITECTURE.md) - Design and implementation details

### Building from Source

```bash
cd process_mining_wasm
npm install
npm run build:all
npm test
```

### Available Build Targets

- **Bundler** (recommended): For use with webpack, vite, etc.
- **Node.js**: For server-side processing
- **Web**: For direct browser use via script tags

### CI/CD Pipeline

Automated builds and tests via GitHub Actions:
- Builds WASM for all targets (Linux, macOS, Windows)
- Runs unit and integration tests
- Tests with Node.js 18.x and 20.x
- Generates API documentation
- Publishes to npm on release

See [.github/workflows/wasm-build.yml](./.github/workflows/wasm-build.yml) for configuration.

## LICENSE
This project is licensed under either Apache License Version 2.0 or MIT License at your option.
