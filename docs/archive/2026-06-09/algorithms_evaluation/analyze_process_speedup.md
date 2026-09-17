<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/analyze_process_speedup.md; source-sha256: 28b9d7ec27d9fe80fd5f5d88d84e5a11fbb0de2d069e228584806dd06cf1c99a; reason: tooling or agent control surface -->

# Algorithm Evaluation: Process Speedup Analysis

## Metadata
- **ID**: `analyze_process_speedup`
- **Export Name**: `analyze_process_speedup`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/final_analytics.rs`
- **WASM Bindings Path**: `wasm4pm/src/final_analytics.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/pm4wasm-backend.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: analyze_process_speedup.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
