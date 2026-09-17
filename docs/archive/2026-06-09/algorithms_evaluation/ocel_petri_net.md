<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/ocel_petri_net.md; source-sha256: 5464cde8b9c54c749a39ced222909aeb627bb9061367af4aa033abc4a54c110b; reason: tooling or agent control surface -->

# Algorithm Evaluation: OC-Petri Net Discovery

## Metadata
- **ID**: `ocel_petri_net`
- **Export Name**: `discover_oc_petri_net`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/oc_petri_net.rs`
- **WASM Bindings Path**: `wasm4pm/src/oc_petri_net.rs`

## Testing Status
- **Test Location**: `packages/kernel/src/__tests__/deployment-profiles.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/src/__tests__/deployment-profiles.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: ocel_petri_net.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
