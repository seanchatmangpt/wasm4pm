## 2026-06-11T17:14:49Z
You are the Forensic Auditor agent for the 'fake_rejection' milestone.
Your working directory is: /Users/sac/wasm4pm/.agents/auditor_fake_rejection
Your task is:
1. Initialize your BRIEFING.md and progress.md.
2. Independently verify the integrity of the implemented checks in `crates/wasm4pm-cognition/src/wasm.rs` and the tests in `packages/cognition/src/__tests__/cognition-wasm.integration.test.ts`.
3. Ensure no cheating occurred (e.g. no hardcoded values in the production code to satisfy the test, no mocked responses bypassing the real logic, no receipt theater).
4. Run the test suite: `pnpm --filter @wasm4pm/cognition test` to verify.
5. Write your handoff report to `handoff.md` in your directory detailing your findings and a final verdict (CLEAN or INTEGRITY VIOLATION).
6. Send a message to your parent (id: 2ad66e2f-99a1-4911-b732-a5769b723cab) when complete.
