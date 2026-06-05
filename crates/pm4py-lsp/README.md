# pm4py-lsp

The `pm4py-lsp` crate provides a Language Server Protocol (LSP) implementation specifically designed to bridge Python's [PM4Py](https://pm4py.fit.fraunhofer.de/) library with the `wasm4pm` ecosystem. It operates as a "Living LSP Gall checkpoint", leveraging `tower-lsp-max` as the protocol substrate while keeping PM4Py semantics strictly isolated.

## Status

`pm4py-lsp` is verified against the `PM4PY-LSP-003_ALIVE` validation gate, proving capability across unit, integration, e2e, chaos, stress, and benchmark tests.

## Core Capabilities

- **Pipeline Detection & Diagnostics:** Statically analyzes Python scripts for `pm4py` and `pandas` imports. It raises actionable diagnostics for standard process mining workflows that attempt to execute discovery on raw, unformatted pandas DataFrames.
- **Code Actions & Quickfixes:** Recommends automatic insertions of formatting methods (e.g., `pm4py.format_dataframe`) when missing event log mappings are detected.
- **Actuation Commands:** Implements LSP commands (`pm4py-lsp.formatDataFrame`, `pm4py-lsp.createParityFixture`) that mutate documents and extract deterministic receipts.
- **Optional Runtime Bridge:** Incorporates PyO3 for safe, runtime GIL execution of PM4Py pipelines, falling back to a static analysis mode if the environment lacks Python dependencies.
- **Comprehensive PM4Py Surface:** Covers process mining capabilities spanning Discovery (DFG, Alpha, Inductive, etc.), Conformance Checking (Token-based replay, Alignments), and Exports (XES, BPMN, Petri net).

## Best Practices & Proof Discipline

The implementation of `pm4py-lsp` strictly adheres to the `wasm4pm` monorepo conventions:

1. **Workspace Inheritance:** Package metadata (version, edition, authors) and common dependencies (like `serde`, `wasm4pm-types`, `blake3`, `uuid`) are inherited directly from the root workspace `Cargo.toml`.
2. **Strict Linting:** The crate enforces high-quality Rust code via top-level directives: `#![forbid(unsafe_code)]` and `#![warn(clippy::all)]`.
3. **Deterministic Hashing:** Document states are hashed using the BLAKE3 algorithm to generate a deterministic `SnapshotId`, ensuring consistent state tracking without relying on random UUIDs.
4. **Receipt & Fixture Persistence (The One-Line Law):** In compliance with the repository's `AGENTS.md` mandate (*"No receipt, no claim"*), all tests and commands that generate parity fixtures or receipts write them directly to physical disk paths (`fixtures/pm4py-parity/` and `receipts/pm4py-lsp/`). Test harnesses are explicitly forbidden from cleaning up these directories to ensure that physical artifacts remain verifiable by the global release pipeline.
5. **Real Boundaries:** The crate implements real LSP API boundaries rather than mocks, accurately executing code actions, triggering diagnostics on `didChange`, and routing custom commands through JSON-RPC.

## Key LSP Commands

- `pm4py-lsp.formatDataFrame`: Formats a target DataFrame by injecting required mapping logic (`case_id`, `activity_key`, `timestamp_key`).
- `pm4py-lsp.createParityFixture`: Extracts the current PM4Py state into a `wasm4pm` compatible parity fixture JSON artifact.
- `pm4py-lsp.generateReceipt`: Hashes the current semantic state and generates a BLAKE3 receipt proving the analysis.

## Build and Test

This crate builds with the rest of the Cargo workspace:

```bash
# From workspace root
cargo build -p pm4py-lsp

# Run the test suite (requires valid python dynamic library via DYLD_FALLBACK_FRAMEWORK_PATH on macOS)
cargo test -p pm4py-lsp
```
