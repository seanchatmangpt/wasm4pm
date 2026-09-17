<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/ilp.md; source-sha256: 55b50088a42d779d34c496716d3e2526e85c3cc4643ddf17c098484a059491b3; reason: tooling or agent control surface -->

# Algorithm Evaluation: Integer Linear Programming (ILP)

## Metadata
- **ID**: `ilp`
- **Export Name**: `discover_ilp_petri_net`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/ilp_discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/ilp_discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/algorithms-error-handling.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: ilp.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
