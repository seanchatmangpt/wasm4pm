# Plan: Implement and Verify 'fake' Check in Rust Verifier

## Context and Requirements
1. **R1. Rust Verifier Check**: Modify `cognition_verify` in `crates/wasm4pm-cognition/src/wasm.rs` (or related autosystem files) to check for the word "fake" (case-insensitive) in the input JSON string. If found, return a `Fatal` finding with code `FAKE_ARTEFACT_DETECTED`.
2. **R2. Integration Tests**: Add integration tests in `packages/cognition/src/__tests__/cognition-wasm.integration.test.ts` passing a manipulated/fake receipt containing the word "fake" to the WASM verifier. Assert that verification fails with code `FAKE_ARTEFACT_DETECTED` and severity `Fatal`.
3. **R3. OCEL Log Inspection**: Run cognition breeds, inspect the generated OCEL 2.0 logs (`ocel_log` field in the result) to validate that breed executions are actually going through the entire logical process (no short-circuiting or mock).

## Execution Strategy
- **Phase 1: Exploration**: Discover existing test command formats and build requirements. Run current tests to ensure clean slate.
- **Phase 2: Implementation (Worker)**:
  - Modify `crates/wasm4pm-cognition/src/wasm.rs` to implement R1.
  - Rebuild the WASM binary.
  - Modify `packages/cognition/src/__tests__/cognition-wasm.integration.test.ts` to implement R2.
- **Phase 3: Validation & Inspection (Reviewer/Challenger)**:
  - Run the test suite (`pnpm test` or specific commands) to verify.
  - Verify OCEL log structure for active breeds to validate the full execution process (R3).
- **Phase 4: Synthesis & Reporting**: Synthesize results, check for any integrity/formatting issues, and report back to the parent.
