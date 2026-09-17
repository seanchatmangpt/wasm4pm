<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/automl_classify.md; source-sha256: 58c17b051c1fd442af7881e94b9fce38e477a7368ed0dd974af4507cc74e873e; reason: tooling or agent control surface -->

# Algorithm Evaluation: AutoML Classification

## Metadata
- **ID**: `automl_classify`
- **Export Name**: `discover_automl_classify`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/ml/automl.rs`
- **WASM Bindings Path**: `wasm4pm/src/ml/automl.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: automl_classify.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
