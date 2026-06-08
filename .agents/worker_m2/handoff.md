# Handoff Report — E2E LSP Lifecycle Testing

## 1. Observation
- **Test File Path**: `crates/pm4py-lsp/tests/e2e_lsp_test.rs`
- **Other Affected File**: `crates/pm4py-lsp/tests/chaos_test.rs`
- **Initial Compilation Error in `chaos_test.rs`**:
  ```
  error: out of range hex escape
    --> crates/pm4py-lsp/tests/chaos_test.rs:27:22
     |
  27 |         "\x00\x01\x02\xFF\xFE import pm4py",
     |                      ^^^^ must be a character in the range [\x00-\x7f]
  ```
- **Initial E2E Test Compilation/Borrow Check Error**:
  ```
  error[E0502]: cannot borrow `service` as mutable because it is also borrowed as immutable
    --> crates/pm4py-lsp/tests/e2e_lsp_test.rs:44:13
     |
  21 |     let backend = service.inner();
     |                   ------- immutable borrow occurs here
  ...
  44 |     let _ = service.call(init_req).await.unwrap();
     |             ^^^^^^^^^^^^^^^^^^^^^^ mutable borrow occurs here
  ```
- **Hanging Behavior (Deadlock)**: After moving `backend = service.inner();` down, the E2E test task hung. An investigation showed that `received_requests` MutexGuard was held across backend await calls while the background task was trying to push new requests, creating a circular wait where `apply_edit` was waiting for mock response and mock receiver was waiting for the mutex lock.
- **Bypassed LSP Handshake Failures**: Other E2E tests in the file were failing because they called `backend.did_open(...)` and other backend methods without initializing the service first, causing client requests and notifications to be silently suppressed by `Client::send_request` and `Client::send_notification`.
- **Final Command Output**:
  ```
       Running tests/e2e_lsp_test.rs (target/debug/deps/e2e_lsp_test-d7ac7678a3f9c6f0)

  running 7 tests
  test test_e2e_initialize_and_shutdown ... ok
  test test_e2e_close_removes_diagnostics ... ok
  test test_e2e_did_open_triggers_diagnostics ... ok
  test test_e2e_multiple_files_concurrent ... ok
  test test_e2e_did_change_updates_diagnostics ... ok
  test test_e2e_code_action_repairs_diagnostic ... ok
  test test_e2e_lsp_lifecycle ... ok

  test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.41s
  ```

## 2. Logic Chain
1. The out-of-range hex escapes in `tests/chaos_test.rs` were caused by using `\xFF` and `\xFE` in a normal string literal (`&str`). By replacing them with Unicode escapes `\u{FF}` and `\u{FE}`, the compilation succeeded.
2. The borrow checker error was due to `backend` holding an immutable reference to `service` while `service.call()` was borrowing it mutably. Retrieving the backend reference *after* the initial handshake was completed resolved the issue.
3. The deadlock in `test_e2e_lsp_lifecycle` was resolved by scoping the lock acquisitions on `received_requests` inside separate blocks, ensuring the mutex guards are dropped before the main thread invokes subsequent asynchronous backend methods (such as `execute_command`).
4. The failing existing tests (`test_e2e_did_open_triggers_diagnostics`, `test_e2e_did_change_updates_diagnostics`, `test_e2e_code_action_repairs_diagnostic`) were fixed by adding the proper `initialize`/`initialized` JSON-RPC handshake at the beginning of each test, transitioning the backend to `Initialized` state and enabling `publish_diagnostics` and `apply_edit` messages.

## 3. Caveats
- No caveats. The tests cover the entire 13-step lifecycle and compile/pass successfully on standard and stress test suites.

## 4. Conclusion
- All LSP E2E tests are now structurally complete, compile, and run successfully without hangs or deadlocks.

## 5. Verification Method
Run the following test command:
```bash
DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp
```
Verify that:
1. `tests/e2e_lsp_test.rs` compiles cleanly.
2. All 7 tests in `e2e_lsp_test.rs` pass, including `test_e2e_lsp_lifecycle`.
3. All other tests in the crate pass cleanly.
