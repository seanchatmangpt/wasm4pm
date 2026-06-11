## 2026-06-11T17:11:59Z
You are the Explorer agent for the 'fake_rejection' milestone.
Your working directory is: /Users/sac/wasm4pm/.agents/explorer_fake_rejection
Your task is:
1. Initialize your BRIEFING.md and progress.md in your directory.
2. Read crates/wasm4pm-cognition/src/wasm.rs and locate the `cognition_verify` function. Propose the exact change to check for the word "fake" (case-insensitive) in the input JSON string, and how to push a Fatal severity Finding with code "FAKE_ARTEFACT_DETECTED".
3. Read packages/cognition/src/__tests__/cognition-wasm.integration.test.ts and propose how to add integration test cases that call `wasm.cognition_verify` with a payload containing the word "fake" (case-insensitive) and assert the returned finding.
4. Locate the build/compilation commands for building the Rust/WASM cognition package, and the test commands for running integration tests in packages/cognition.
5. Identify how OCEL logs are generated and how we can inspect the `ocel_log` field in the result of breed executions to verify no short-circuiting.
6. Write a detailed handoff report to `handoff.md` in your directory summarizing your findings.
7. Send a message to your parent (id: 2ad66e2f-99a1-4911-b732-a5769b723cab) when complete.
