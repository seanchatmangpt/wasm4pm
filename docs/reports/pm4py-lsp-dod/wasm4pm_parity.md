# WASM4PM Parity Investigation Report

**Role**: WASM4Py Parity Agent (`parity`)  
**Milestone**: Milestone 7 Verification and Checkpoint Promotion  
**Project**: `pm4py-lsp` Parity Fixture Contract

## 1. Parity Fixture Contract Structure
The parity fixture contract provides a serialized interface (`crates/pm4py-lsp/src/parity.rs`) allowing `wasm4pm` to replay process mining workflows and verify their outputs against local Python executions.
- `ParityFixture`: Holds:
  - `snapshot_id`: Hash of the document state.
  - `csv_path`: File path of the event log.
  - `parameters`: Map of read/parse parameters (e.g. delimiters).
  - `expected_outcome`: Expected result string.

## 2. Equivalence Classification & Verdicts
Rather than assuming simplistic string equality, the contract defines structural equivalence types (`EquivalenceKind`):
- `Exact`: Exact binary/text match of the discovered process model.
- `Semantic`: Semantic equivalence (e.g., structural isomorphism of Petri Nets).
- `Statistical`: Statistical equivalence (e.g. matching conformance fitness or precision).
- `None`: Complete mismatch.

The `ParityVerdict` binds:
- `fixture_id`: Identifier of the replayed fixture.
- `equivalence`: The evaluated `EquivalenceKind`.
- `gap_analysis`: Detailed diagnostics detailing discrepancies between expected and actual results.

## 3. Gap Classification
The helper `classify_parity_gap` performs basic evaluation:
- Returns `"No gap detected."` if expected and actual values align.
- Explains the exact discrepancy otherwise: `"Gap detected: expected '{expected}', got '{actual}'"`.

## 4. Test Verification
- `tests/parity_contract_test.rs`: Includes tests `test_classify_parity_gap` and `test_parity_fixture_and_verdict_instantiation` validating correct serialization, deserialization, and classification logic.
All parity contract tests pass.
