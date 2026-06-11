# ebl — Explanation-Based Learning

## 1. Identity & Lineage
Explanation-Based Generalization (Mitchell, Keller & Kedar-Cabelli, Machine Learning 1(1), 1986). BreedId `ebl`, module `crates/wasm4pm-cognition/src/breeds/ebl.rs`.

## 2. Algorithm
Explain: SLD backward chaining (depth ≤32) proves the training goal from facts + domain theory, building a proof tree. Generalize: EGGS goal regression replaces constants with variables and replays substitutions. Operationalize: the generalized proof's leaves become the premise of a new operational rule.

## 3. Input Contract
Facts: ground atoms as keys (e.g. `weight(obj1,light)`). Rules: `?var` arguments. Goals: training example (e.g. `safe_to_stack(obj1,obj2)`).

## 4. Output Contract
Fact `ebl:rule` containing the new generalized rule (must contain ≥1 variable).

## 5. Trace & OCEL Lifecycle
`ebl-explain`(1,*) → `ebl-generalize`(1,*) → `ebl-operationalize`(1,1). Model: `ocel/models/l1/ebl.ocpn.json`; report: `ocel/reports/ebl.json` (fitness 1.0).

## 6. Oracles
Refusal: no goals, no domain theory, unprovable goal. Hidden: the learned rule is executed as a domain rule on fresh objects. Paper: Mitchell 1986 SafeToStack (learned rule fully variablized over training constants).

## 7. Determinism & Bounds
Depth-capped (32) SLD search; bit-exact double-run determinism.

## 8. Provenance
Fixture `tests/fixtures/papers/ebl.json` (Mitchell 1986 SafeToStack).
