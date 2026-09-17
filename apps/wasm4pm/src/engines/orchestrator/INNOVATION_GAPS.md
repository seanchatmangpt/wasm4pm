<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/apps/wasm4pm/src/engines/orchestrator/INNOVATION_GAPS.md; source-sha256: ac4717dc2cc8976e56cd3c99d82ca9e36aa7d68f41fa015e41621418990abb1d; reason: tooling or agent control surface -->

# Closed innovation gaps

| Gap | Before | After |
|---|---|---|
| Plan identity | Random UUID and wall-clock identity | Canonical `planHash` and deterministic `planId` |
| Receipt admission | Receipt written after execution on a best-effort path | Pending receipt required before dispatch |
| Receipt binding | Previous hash plus serialized output | Plan, step, arguments, previous edge, and outcome hashes |
| Checkpoint | No persisted executable state | Atomic self-verifying bundle after every transition |
| Resume | Displayed the latest receipt only | Verifies checkpoint and retries only the failed/missing suffix |
| References | Top-level strings only | Recursive object and array substitution |
| Tamper detection | No pipeline-level verifier | Plan, result, chain, standing, and evidence recomputation |

The detailed 80/20 ranking is maintained in
[`docs/explanation/innovation-80-20-proof-pipeline.md`](../../../../../docs/explanation/innovation-80-20-proof-pipeline.md).
