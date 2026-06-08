# Coordinator Agent Investigation Report

**Role**: Coordinator Agent (`coordinator`)  
**Milestone**: Milestone 1  
**Project**: `pm4py-lsp` Integration with `tower-lsp-max`

## 1. Overview and Scope
The coordinator agent is responsible for auditing the current codebase status, identifying architectural integration blockers, and mapping the checkpoint plan. The main goal is to ensure `pm4py-lsp` correctly layers on top of `tower-lsp-max` to provide process mining diagnostics and receipted parity fixtures while preserving the purity of the vendor crate.

## 2. Key Findings & Codebase Gaps

### A. The createParityFixture Deadlock
During execution of the capability test suite, we identified that running `cargo test -p pm4py-lsp` hangs indefinitely. The hang occurs in `test_physical_persistence` during the handling of the `pm4py-lsp.createParityFixture` command:
- Inside `Backend::execute_command` (in `crates/pm4py-lsp/src/lib.rs`), the server acquires a lock on `self.documents`:
  ```rust
  let docs = self.documents.lock().await;
  let text = docs.get(&uri)...
  ```
- Before releasing this lock, the handler invokes:
  ```rust
  let snapshot_id = self.max_snapshot().await?.0;
  ```
- Inside `max_snapshot()`, the server attempts to acquire the lock on `self.documents` again:
  ```rust
  let docs = self.documents.lock().await;
  ```
- Since `tokio::sync::Mutex` is not re-entrant, this creates a classic deadlock. The task hangs waiting for itself to release the lock.

### B. Checkpoint PM4PY-LSP-001.md Overclaims
The checkpoint `docs/checkpoints/PM4PY-LSP-001.md` asserts a status of `Admitted` and states that capability tests pass. This is incorrect on two counts:
1. It claims `Pass (4/4 capability tests pass)`. In reality, `tests/capability_test.rs` has 6 capability tests.
2. The overall suite hangs at the 6th test due to the deadlock, meaning the tests cannot run to completion in any automated gate.
We have corrected the checkpoint status to `PARTIAL_ALIVE` to accurately reflect these defects.

### C. Diagnostics Wiring Gap
The codebase has a comprehensive diagnostics module (`crates/pm4py-lsp/src/diagnostics.rs`) that defines rules for missing columns (`case_id`, `activity`, `timestamp`) and discovery-before-formatting order check. However, the LSP server did change/did open hook loop in `lib.rs`:
```rust
async fn scan_and_diagnose(&self, uri: Url, text: String) {
    let diagnostics = diagnose_text(&text);
    self.client.publish_diagnostics(uri, diagnostics, None).await;
}
```
only calls `diagnose_text`, which has a hardcoded regex that *only* looks for unformatted dataframes. The advanced diagnostic checks under `diagnostics.rs` are completely unused and bypassed at runtime.

## 3. Milestone 1 Checkpoint Plan
To bring the project to a fully verifiable `Closed` state for Milestone 1, the following execution plan must be carried out by the agent team:

1. **Phase 1: Resolve Deadlock (Command Boundary)**
   - Modify `Backend::execute_command` to drop the `docs` MutexGuard before calling `max_snapshot()`. This can be achieved by copying/cloning the document content within a scoped block.
   - Run `cargo test -p pm4py-lsp` to verify all 6 capability tests run and complete successfully.

2. **Phase 2: Wire Static Analysis & Diagnostics**
   - Refactor `Backend::scan_and_diagnose` to extract document facts using `PipelineFacts::extract(&text)` and run them through `check_diagnostics(...)`.
   - Update `diagnose_text` or the server loops to return complete diagnostics (including missing mappings).
   - Write integration tests in `tests/capability_test.rs` and `tests/diagnostics_test.rs` ensuring each diagnostic code is emitted on appropriate triggers.

3. **Phase 3: Implement Custom Max RPCs**
   - Expand `max_admission` and `max_refusal` to dynamically check the `LawAxis` state rather than returning hardcoded stubs.
   - Ensure the score and vectors dynamically shift from refused to admitted when fixes are applied.

4. **Phase 4: Physical Persistence and Verification**
   - Confirm BLAKE3 hashes are calculated and written to `receipts/pm4py-lsp/` and that parity JSON files are generated in `fixtures/pm4py-parity/`.
   - Implement an authenticity verifier that tests corruption rejection (Auditor check).
