<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/breeds/prolog.md; source-sha256: 91bf35618be85c3a7b4f49390b9a656618e8c354e1ef495be425b5c5c5b0ddc9; reason: tooling or agent control surface -->

# prolog — SLD Resolution Inference

## 1. Identity & Lineage
Prolog-style SLD resolution (Kowalski 1974; Colmerauer 1972). Backward-chaining over Horn clauses with unification. BreedId `prolog`, module `src/breeds/prolog.rs`.

## 2. Algorithm
Horn clauses from `input.rules`: `premise = [conditions]`, `conclusion = head`. Facts from `input.facts[key="fact"]`. SLD tree: for each goal, try all matching clause heads (unification), substitute bindings, recurse on body. Depth-limited at 64; first solution returned. Unification is syntactic equality (no occurs check, wasm32-safe).

## 3. Input Contract
`input.goals`: `Goal { predicate, value }` to prove. `input.facts[key="fact"]`: ground atoms. `input.rules`: clauses with `premise` (body conditions), `conclusion` (head), `certainty` (unused, 1.0).

## 4. Output Contract
`selected` = first provable goal as `predicate=value`. `confidence` = fraction of goals proved. Facts `prolog:proved:<predicate>` = value for each proven goal.

## 5. Trace & OCEL Lifecycle
`unify-goal`(1,*) → `resolve-clause`(1,*) → `succeed`(1,1) per goal. Report fitness 1.0.

## 6. Oracles
Paper: Kowalski (1974) `parent(tom,bob)` → `ancestor(tom,bob)` via transitivity. Two-hop ancestry chain asserted. Structural: unprovable goal → error; ground fact directly proves atom.

## 7. Determinism & Bounds
Clause-order determinism (first match wins); max depth 64; `support::closure::HornRule` for forward-close precomputation.

## 8. Provenance
Fixture `tests/fixtures/papers/prolog.json` (Kowalski 1974 ancestor example, §4).
