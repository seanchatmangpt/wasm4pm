# strips — Classical Forward-Chaining Planner

## 1. Identity & Lineage
STRIPS (Fikes & Nilsson 1971, SRI). Precondition-add-delete planning with iterative deepening goal regression. BreedId `strips`, module `src/breeds/strips.rs`.

## 2. Algorithm
State = HashSet of `predicate=value` atoms. Actions = rules with `premise` (preconditions), `conclusion` (add/delete list, `!` prefix = delete). Iterative-deepening depth-first search (max depth 16). Frame axioms in `facts[key="frame"]` preserve atoms across specified actions. Goal = all `goal` predicate=value atoms satisfied.

## 3. Input Contract
`input.state`: initial `StateAtom { predicate, value }` list. `input.rules`: actions. `input.goals`: `Goal { predicate, value }` list. `input.facts[key="frame"]`: `"atom,action1,action2"` strings.

## 4. Output Contract
`selected` = plan as semicolon-separated action names. `confidence` = 1.0 if goal reached, 0.0 otherwise. Trace: one step per action applied.

## 5. Trace & OCEL Lifecycle
`load-initial-state`(1,1) → `apply-action`(1,*) → `check-goal`(1,*) → `plan-found`(1,1). Report fitness 1.0.

## 6. Oracles
Paper: Fikes & Nilsson (1971) Sussman anomaly: 3-block stack; plan "unstack-C;stack-A-B;stack-C-A" or equivalent. Structural: goals already satisfied → empty plan; unreachable goals → error.

## 7. Determinism & Bounds
BTreeSet-sorted action application; max depth 16 prevents infinite loop.

## 8. Provenance
Fixture `tests/fixtures/papers/strips.json` (Fikes & Nilsson 1971 Appendix A block-world problem).
