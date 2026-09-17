<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/hill_climbing.md; source-sha256: 33c5172797075a44662244c911c5befcc8642b908649de5afcd5f2da41dd5414; reason: tooling or agent control surface -->

# Algorithm Evaluation: Hill Climbing

## Metadata
- **ID**: `hill_climbing`
- **Export Name**: `discover_hill_climbing`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/fast_discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/fast_discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/deployment-profiles.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/deployment-profiles.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: hill_climbing.DeterministicSameInputCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
