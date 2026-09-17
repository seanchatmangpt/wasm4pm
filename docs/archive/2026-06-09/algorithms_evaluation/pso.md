<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-06-09/algorithms_evaluation/pso.md; source-sha256: e5cdbd10872fccb5bad19137396c0c765270edf40b851ccea7e9473df2bcc294; reason: tooling or agent control surface -->

# Algorithm Evaluation: Particle Swarm Optimization (PSO)

## Metadata
- **ID**: `pso`
- **Export Name**: `discover_pso_algorithm`
- **Reachability**: `Reachable`

## Implementation Status
- **Source Code Path**: `wasm4pm/src/genetic_discovery.rs`
- **WASM Bindings Path**: `wasm4pm/src/genetic_discovery.rs`

## Testing Status
- **Test Location**: `packages/kernel/__tests__/deployment-profiles.test.ts`
- **Command to Run**: `npx vitest run packages/kernel/__tests__/deployment-profiles.test.ts`
- **Result**: `Pass`

## Behavior Details
- **Correct Refusals Verified**: MALFORMED_EVENT_LOG, EMPTY_EVENT_LOG
- **Invariants Checked**: pso.SeededRepeatabilityCase
- **Identified Gaps**: None identified. The algorithm meets all conformance and reachability requirements.
