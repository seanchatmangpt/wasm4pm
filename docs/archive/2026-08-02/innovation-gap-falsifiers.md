<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-08-02/innovation-gap-falsifiers.md; source-sha256: d815b205376585dd017866d7c4ddce45ce687e82aa7432bc07ca595d1a8f8c1d; reason: tooling or agent control surface -->

# Proof-carrying pipeline falsifiers

The innovation closure is not `ALIVE` if any of the following is observed against the exact branch head:

- equal semantic plans produce different `planHash` values;
- plan or step tampering passes bundle verification;
- a dispatcher runs when the pending receipt cannot be written;
- a successful step is reported when its outcome receipt cannot be written;
- resume reruns an already successful prefix;
- resume accepts a checkpoint for another plan hash;
- a nested `@{step.path}` reference remains unresolved;
- a duplicate, cyclic, self-referential, or dangling DAG is admitted;
- terminal `ALIVE` is reported before all planned steps complete;
- TypeScript, package tests, documentation checks, or exact-head CI fail.
