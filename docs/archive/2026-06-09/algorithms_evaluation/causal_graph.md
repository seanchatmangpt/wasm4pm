<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/causal_graph.md; source-sha256: 22ce4bca8240437dc9fe865240d21bfdc8c97fd83faf067e59f5011de348c2f5; reason: tooling or agent control surface -->

# Algorithm Evaluation: Causal Graph Discovery

## Metadata
- **ID**: `causal_graph`
- **Export Name**: `discover_causal_alpha`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/causal_graph.rs`
- **WASM Bindings Path**: `wasm4pm/src/causal_graph.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/registry.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/registry.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: causal_graph.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
