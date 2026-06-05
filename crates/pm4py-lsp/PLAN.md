# pm4py-lsp Implementation Plan

## Goal
Implement a Living LSP server for PM4Py workflows using `tower-lsp-max` as the substrate.
The server must detect PM4Py pipelines, raise diagnostics, offer repairs, and generate receipts/fixtures.

## Phase 1: Basic Server & Detection
- Implement `LanguageServer` trait for `Pm4pyBackend`.
- On `did_open` and `did_change`, scan Python files for `import pm4py`.
- Raise `pm4py.py.unformatted_dataframe` diagnostic if `pd.read_csv` is used but `pm4py.format_dataframe` is missing.

## Phase 2: custom max/ methods
- Implement `max/snapshot`.
- Implement `max/conformanceVector`.
- Implement `max/receipt`.

## Phase 3: Code Actions & Commands
- Implement `pm4py-lsp.formatDataFrame` command.
- Offer code action to insert `pm4py.format_dataframe`.

## Phase 4: Gall Parity Bridge
- Implement `pm4py-lsp.createParityFixture`.
- Produce a `.json` receipt/fixture that can be replayed in `wasm4pm`.

## AGENTS.md Compliance
- Every action must be receipted.
- Validation must include positive and negative cases.
