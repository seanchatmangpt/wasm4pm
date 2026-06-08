# LSP Lifecycle Investigation Report

**Role**: LSP Lifecycle Agent (`lsp-lifecycle`)  
**Milestone**: Milestone 7 Verification and Checkpoint Promotion  
**Project**: `pm4py-lsp` Lifecycle Handlers & Document Typestates

## 1. LSP Capability Initialization
The language server backend registers standard capacities with the LSP client during the `initialize` handshake:
- **Text Document Synchronization**: Configured for `TextDocumentSyncKind::FULL` sync mode to always receive complete document updates.
- **Code Action Provider**: Enabled simple provider for code quickfixes.
- **Execute Command Provider**: Declares support for actuation commands:
  - `pm4py-lsp.formatDataFrame`
  - `pm4py-lsp.createParityFixture`

Upon completion of initialization, the server invokes the `initialized` callback and publishes a confirmation log `pm4py-lsp initialized!` to the client.

## 2. Document Synchronization & State Management
The backend maintains an internal memory map of active documents (`Arc<Mutex<HashMap<Url, String>>>`):
- **did_open**: Invokes the document insertion logic and executes `scan_and_diagnose` to compile diagnostics.
- **did_change**: Updates the text in the hashmap and triggers a fresh diagnostics pass, verifying that changes immediately reflect in refreshed warnings.
- **did_close**: Safely removes the document from the server's internal memory state to prevent resource leaks.

## 3. Test Verification
The lifecycle protocol is verified in:
- `tests/lsp_lifecycle_test.rs`: Includes tests `test_lsp_initialize` and `test_lsp_did_open_and_change` checking capabilities registration and document sync sequence.
All lifecycle tests pass successfully.
