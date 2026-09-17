<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/CROWN-GAP-HARDENING.md; source-sha256: 2689b210d4571ded68920ec7fe3e8d243af0abbae2b0e0c4bc1e454409091b69; reason: tooling or agent control surface -->

# Crown Gap Hardening

wasm4pm owns computation over admitted evidence, not execution authority. This branch hardens that boundary by making operator applicability explicit and machine-readable and by requiring executable-surface acceptance to include benchmark targets when benchmark claims are made.

An operator is eligible only when its declared preconditions are satisfied by the admitted problem shape. LLM routing may rank eligible operators; it may not manufacture eligibility.
