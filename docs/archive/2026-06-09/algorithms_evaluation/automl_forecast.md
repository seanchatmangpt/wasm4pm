<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/automl_forecast.md; source-sha256: 19897d7b2df7716e29fe5c03f5b8b4a7623cfede6c5a5ec9a5b82ea95e9c71b0; reason: tooling or agent control surface -->

# Algorithm Evaluation: AutoML Throughput Forecast

## Metadata
- **ID**: `automl_forecast`
- **Export Name**: `discover_automl_forecast`
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
- **Invariants Checked**: automl_forecast.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
