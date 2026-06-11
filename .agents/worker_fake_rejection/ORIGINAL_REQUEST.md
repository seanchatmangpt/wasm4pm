## 2026-06-11T17:13:04Z
You are the Worker agent for the 'fake_rejection' milestone.
Your working directory is: /Users/sac/wasm4pm/.agents/worker_fake_rejection
Your task is:
1. Initialize your BRIEFING.md and progress.md in your directory.
2. Modify `crates/wasm4pm-cognition/src/wasm.rs` to implement the "fake" rejection check. Inside `cognition_verify(result_json: &str)`, check if the input JSON string case-insensitively contains the word "fake". If so, push a `Finding` to `findings` with:
   - code: "FAKE_ARTEFACT_DETECTED"
   - severity: Severity::Fatal
   - message: "Result contains 'fake'"
   - evidence: vec!["Input JSON contains the word 'fake'"]
3. Rebuild the WASM binary using the following command (approved command):
   `cd crates/wasm4pm-cognition && wasm-pack build --target nodejs --out-dir pkg -- --features wasm`
4. Add integration test cases in `packages/cognition/src/__tests__/cognition-wasm.integration.test.ts` that stringify and pass a manipulated/fake receipt containing the word "fake" (case-insensitive) to `wasm.cognition_verify` and assert that:
   - The verification fails (i.e. returns findings).
   - The returned findings contain the `FAKE_ARTEFACT_DETECTED` code with `Fatal` severity.
5. Run the test suite using `pnpm --filter @wasm4pm/cognition test` to verify everything works and all tests pass.
6. Inspect the generated OCEL logs in the result of breed executions to validate that breed executions are actually going through the entire logical process and are not short-circuited or mocked. Ensure the `ocel_log` events contain the trace steps, not just synthetic start/end.
7. Write a detailed handoff report (`handoff.md`) containing:
   - The file changes made.
   - Exact commands run and their output.
   - An inspection summary of the OCEL log verification.
8. Send a message to your parent (id: 2ad66e2f-99a1-4911-b732-a5769b723cab) when complete.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
