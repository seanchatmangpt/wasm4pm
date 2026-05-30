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
