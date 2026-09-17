<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/ocel_dfg.md; source-sha256: 1045ffa045b5a50687fcaaf8eaea9e8c8b2aedcb98686fda6f5bbdc3db725cb3; reason: tooling or agent control surface -->

# Algorithm Evaluation: OC-DFG (Aggregate)

## Metadata
- **ID**: `ocel_dfg`
- **Export Name**: `discover_ocel_dfg`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/gap-fixes.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/gap-fixes.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: EMPTY_EVENT_LOG, MALFORMED_EVENT_LOG
- **Invariants Checked**: ocel_dfg.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
