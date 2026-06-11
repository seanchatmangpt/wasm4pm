# htn_planning — SHOP2-style Total-Order Decomposition

## 1. Identity & Lineage
HTN planning — SHOP2-style total-order decomposition (Nau et al. 2003). BreedId `htn_planning`, module `src/breeds/htn_planning.rs`.

## 2. Algorithm
Chronological backtracking over method choice (declaration order), depth cap 64, expansion cap 512. After planning, the plan is REPLAYED against the initial state (self-audit): a plan that does not replay is refused.

## 3. Input Contract
Goals define initial tasks (compound or `op:<name>`). Rules use `method:<task>:<variant>` or `op:<name>`. `method` premise = preconditions over `pred=val` state atoms, conclusion = `;`-separated subtasks. `op` conclusion = `;`-separated effects (`atom`, `!atom`). State array represents initial state.

## 4. Output Contract
Fact `htn:plan` with comma-separated operator plan. `selected` = plan string.

## 5. Trace & OCEL Lifecycle
`{htn-decompose,htn-apply,htn-backtrack}`(1,*) → `htn-plan`(1,1). Exact operators and methods recorded in detail. Report fitness 1.0.

## 6. Oracles
Refusal: no tasks / no rules / plan self-audit failure / exceed depth or expansion limits. Hidden: correctly decomposes and returns sequence of operators. Paper: Logistics/transport domain, deliver decomposes into load;drive;unload.

## 7. Determinism & Bounds
BTreeSet for state atoms. Depth cap 64, expansion cap 512. Fixed declaration order for method/operator selection. Plan self-audit ensures strict linear state application.

## 8. Provenance
Fixture `tests/fixtures/papers/htn_planning.json` (Nau et al. 2003 total-order decomposition logistics domain).
