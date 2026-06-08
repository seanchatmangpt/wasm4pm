## 2026-06-05T07:57:58Z
You are a teamwork_preview_worker. Your working directory is `/Users/sac/wasm4pm/.agents/worker_m2/`.
Your task is to implement the E2E LSP test file `crates/pm4py-lsp/tests/e2e_lsp_test.rs` which covers the 13-step E2E lifecycle:
1. Start pm4py-lsp through max service harness (LspService).
2. initialize.
3. didOpen Python file with PM4Py + unformatted read_csv.
4. Verify diagnostic appears.
5. Request codeAction.
6. Execute formatDataFrame command.
7. Verify WorkspaceEdit applied (e.g. by checking the mock client or simulating it).
8. Verify receipt returned and persisted.
9. didChange with repaired content.
10. Verify diagnostic clears through lifecycle.
11. Verify conformance vector is Admitted for formatting law.
12. didClose.
13. Verify document state clears/deactivates.

Ensure you use proper async test structure and the `tower_lsp_max` library correctly.
Run `DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp --test e2e_lsp_test` to ensure it passes. Document your changes in your handoff report.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/boundary implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
