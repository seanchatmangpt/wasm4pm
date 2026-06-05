# Worker Task: Milestones 2-6 Implementation

Perform the following implementation tasks inside `crates/pm4py-lsp/`:

## 1. Static Analysis (analysis.rs)
- Refactor `src/analysis.rs` to support:
  - Indented imports (`  import pm4py`, `  from pm4py import ...`).
  - Pandas aliases (`import pandas as pd`, `import pandas`, `pd.read_csv`, `pandas.read_csv`).
  - format_dataframe calls with aliases.
  - PM4Py discovery calls (inductive, dfg, heuristic, etc.).
  - DataFrame variables loaded from CSV.
  - Position/Keyword mappings in format_dataframe.
  - Return `PipelineFacts` containing all extracted facts.

## 2. Python Bridge (pm4py_bridge.rs)
- Create `src/pm4py_bridge.rs`.
- Implement PyO3 wrapper for executing PM4Py code (e.g. discovery, conformance).
- Support capability-gated mode (static mode by default, runtime mode explicit).
- Catch PyO3/import errors safely without panicking, returning `Unknown`/`Refused` or an error enum `BridgeError`.

## 3. Diagnostics (diagnostics.rs)
- Complete/extend `src/diagnostics.rs` to generate diagnostics for:
  - `pm4py.py.unformatted_dataframe`
  - `pm4py.py.missing_case_id_mapping`
  - `pm4py.py.missing_activity_mapping`
  - `pm4py.py.missing_timestamp_mapping`
  - `pm4py.py.discovery_before_formatting`
  - `pm4py.py.parity_fixture_missing`
  - `pm4py.py.unreceipted_output`

## 4. Server Core & Deadlock Resolution (server.rs, lib.rs)
- Refactor the LanguageServer `Backend` into `src/server.rs`.
- Resolve the tokio mutex deadlock in the command executions (scoping/dropping `self.documents` lock before awaiting `max_snapshot()`).
- Implement `didOpen`, `didChange`, `didClose`.
- Re-export modules in `src/lib.rs`.

## 5. Actions and Commands (actions.rs, commands.rs)
- Extract codeAction logic to `src/actions.rs`.
- Extract executeCommand logic to `src/commands.rs` supporting:
  - `pm4py-lsp.formatDataFrame`
  - `pm4py-lsp.createParityFixture`
  - `pm4py-lsp.generateReceipt`
  - `pm4py-lsp.explainPipelineState`

## 6. Receipts, Fixtures, and Parity Contract (receipts.rs, fixtures.rs, parity.rs)
- Verify `src/receipts.rs` snapshot generation (`pm4py-snap-<blake3>`) and reload verification.
- Verify `src/fixtures.rs` to persist parity fixtures under `fixtures/pm4py-parity/`.
- Create `src/parity.rs` defining equivalenceKinds (`exact_json`, `dfg_equivalence`) and parityVerdict.

## 7. Test Integration & Layout Parity
- Implement/update all tests in `tests/`:
  - `static_analysis_test.rs`
  - `diagnostics_test.rs`
  - `lsp_lifecycle_test.rs`
  - `actions_commands_test.rs`
  - `receipts_fixtures_test.rs`
  - `parity_contract_test.rs`
  - `pm4py_bridge_test.rs`

Verify that `cargo check -p pm4py-lsp` and `cargo test -p pm4py-lsp` pass cleanly.
