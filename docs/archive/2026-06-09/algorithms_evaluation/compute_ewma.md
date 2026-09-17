<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/compute_ewma.md; source-sha256: 6e425e941adc6902d621af5565d4070efc45544280b10af3ff05c3b6f2d0b40d; reason: tooling or agent control surface -->

# Algorithm Evaluation: EWMA Smoothing

## Metadata
- **ID**: `compute_ewma`
- **Export Name**: `compute_ewma`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `crates/miniml-core/src/optimization/drift.rs`
- **WASM Bindings Path**: `crates/miniml-core/src/optimization/drift.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: compute_ewma.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
