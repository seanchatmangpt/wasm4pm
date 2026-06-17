# Plan - Tier P2 Breeds Resume and Verification

## Objective
Resume the work of the Tier P2 Orchestrator, verify the completed breeds (Batch 1, 2, and 3), fix the TypeScript integration test failures, and ensure full integration and clean test execution.

## Verification Steps
1. **Explore & Analyze**: Read the explorer verification report `/Users/sac/wasm4pm/.agents/teamwork_preview_explorer_verification/handoff.md` and check the TS test failures.
2. **Determine Needed Fixes**: Identify which TS files need updates (`breed-inputs.ts` and `cognition-breeds.integration.test.ts`) to align with Rust preconditions and expected outputs.
3. **Dispatch Worker**: Spawn a worker to edit the TS test files, rebuild the WASM module/TypeScript packages, and run vitest tests.
4. **Final Verification**: Check that:
   - `cargo test -p wasm4pm-cognition` passes
   - Vitest tests pass (`npx vitest run --dir packages/cognition`)
   - Release behavior and certificate verification tools run successfully.
5. **Report & Close**: Update progress.md and handoff.md, and notify the parent.

## Decomposition / Milestones
- Milestone 1: Fix `breed-inputs.ts` and `cognition-breeds.integration.test.ts` for all 26 failing Vitest tests.
- Milestone 2: Build WASM and run TS test suite to confirm 100% success.
- Milestone 3: Run full release verification.
