## 2026-06-05T08:03:31Z

You are a teamwork_preview_worker. Your working directory is `/Users/sac/wasm4pm/.agents/worker_m3/`.
Your task is to implement the Stress tests file `crates/pm4py-lsp/tests/stress_test.rs` covering the Stress Gates S1-S8:
S1. 1,000 PM4Py-like files analyzed without panic.
S2. 10,000 read_csv lines analyzed within bounded time.
S3. 1,000 receipts generated and verified.
S4. 1,000 fixtures generated and reloaded.
S5. 100 concurrent didChange events stabilize.
S6. repeated conformance queries are stable.
S7. memory/leakage control: verify document map size returns to 0 after didClose.
S8. deadlock check: parallel codeAction + executeCommand.

You must mark the heavy stress tests as `#[ignore = "stress gate"]` so they don't slow down the main test suite, but can be run with `-- --ignored`.
Ensure the code compiles and passes successfully. Run the test with:
`DYLD_FRAMEWORK_PATH=/Applications/Xcode.app/Contents/Developer/Library/Frameworks cargo test -p pm4py-lsp --test stress_test -- --ignored`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/boundary implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
