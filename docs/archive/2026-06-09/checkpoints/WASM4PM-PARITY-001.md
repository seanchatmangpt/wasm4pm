# WASM4PM-PARITY-001: PM4Py Parity Contract

## Overview
This checkpoint establishes the parity contract between PM4Py execution and wasm4pm's reimplementations. It ensures that any process discovery or analysis performed by the LSP can be verified against a physical PM4Py execution.

## Components

### 1. Parity Fixture
Defined in `crates/pm4py-lsp/src/parity.rs`, the `ParityFixture` captures:
- `snapshot_id`: Deterministic hash of the source code state.
- `csv_path`: Path to the event log used.
- `parameters`: Execution parameters for the discovery algorithm.
- `expected_outcome`: The resulting model type or summary.

### 2. Parity Verdict
The `ParityVerdict` represents the result of a comparison:
- `equivalence`: (Exact, Semantic, Statistical, or None).
- `gap_analysis`: Detailed breakdown of differences if any.

### 3. Verification Workflow
1. LSP detects PM4Py usage.
2. User triggers `pm4py-lsp.createParityFixture`.
3. LSP persists fixture to `fixtures/pm4py-parity/<snapshot_id>.json`.
4. LSP persists receipt to `receipts/pm4py-lsp/<snapshot_id>/<receipt_id>.json`.

## Status
- [x] `ParityFixture` and `ParityVerdict` structs defined.
- [x] `classify_parity_gap` implemented.
- [x] Command persistence integrated into `Backend`.
- [x] Initial parity contract tests passing.

## Verification
Verification is performed via `tests/parity_contract_test.rs`.
