# Checkpoint: PM4PY-LSP-001_ALIVE

## Status: PARTIAL_ALIVE

## Evidence:
- **Detection**: `import pm4py` is detected in Python files.
- **Diagnostics**: `pm4py.py.unformatted_dataframe` is raised when `pd.read_csv` is used without formatting.
- **Repairs**: "Insert pm4py.format_dataframe" code action is offered and applies a `WorkspaceEdit`.
- **Receipts**: Every command execution emits a BLAKE3-receipted record.
- **Parity**: `pm4py-lsp.createParityFixture` extracts metadata for `wasm4pm` replay.
- **Conformance**: `max/conformanceVector` reflects the `Admitted` state only after repairs are applied.
- **Deadlock Detected**: A critical deadlock occurs during the execution of the `pm4py-lsp.createParityFixture` command. In `crates/pm4py-lsp/src/lib.rs`, `Backend::execute_command` acquires an async lock on `self.documents`. While holding this lock, it awaits `self.max_snapshot()`, which internally attempts to acquire the lock on `self.documents` again. Because `tokio::sync::Mutex` is non-reentrant, this creates an immediate deadlock, causing the thread to hang indefinitely.
- **Test Impact**: Due to this deadlock, the `test_physical_persistence` capability test hangs. Consequently, only 5 of the 6 capability tests pass successfully during automated test suite execution (`cargo test -p pm4py-lsp`), and the overall test command hangs until manually terminated.

## Validation Block
State: PrePublishOnly
Commit: (Pending manual commit)
Package: pm4py-lsp@0.1.0
Commands Run:
- cargo check -p pm4py-lsp: Pass
- cargo test -p pm4py-lsp: Fail (Hangs on test_physical_persistence; 5/6 tests pass before hang)
Artifacts:
- crates/pm4py-lsp/src/lib.rs: Implemented (Contains Deadlock)
- crates/pm4py-lsp/tests/capability_test.rs: Verified (5/6 pass)
Receipts:
- receipt-fd-*: Emitted on formatDataFrame
- receipt-fixture-*: Blocked due to deadlock in createParityFixture

## Next Steps:
- Resolve the Mutex double-locking deadlock in `execute_command` by releasing/dropping the lock on `self.documents` before invoking `max_snapshot()`.
- Implement `wasm4pm` replay logic to consume the parity fixtures.
- Extend diagnostics to cover `missing_activity_mapping` and `missing_timestamp_mapping`.

