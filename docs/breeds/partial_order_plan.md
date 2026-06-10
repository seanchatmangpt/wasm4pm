# partial_order_plan — SNLP Partial-Order Planning

## 1. Identity & Lineage
Systematic nonlinear planning (McAllester & Rosenblitt, AAAI-91). BreedId `partial_order_plan`, module `src/breeds/partial_order_plan.rs`.

## 2. Algorithm
Causal-link planning: lex-least open condition; producer choice (existing steps by id, then new operators by name) with chronological backtracking; threat detection (step deleting a linked atom orderable inside the link interval); resolution by promotion first, then demotion; cycle-checked orderings; Kahn linearization.

## 3. Input Contract
Operators as facts `pop:op:<name>:pre/add/del` = comma lists; initial state = `input.state` predicates; goals = `input.goals` predicates. ≤16 operators, depth ≤64, expansions ≤512.

## 4. Output Contract
Facts `pop:plan` = "op1;op2;...", `pop:step_count`; `selected` = the plan string.

## 5. Trace & OCEL Lifecycle
`init-plan`(1,1) → {`open-condition`,`add-link`,`add-step`,`detect-threat`,`promote`,`demote`,`backtrack`}(1,*) → `plan-complete`(1,1). Report fitness 1.0.

## 6. Oracles
Refusal: no operators / no goals. Hidden: demotion would order a clobberer before Start → promotion forced; exact plan + `promote` + `detect-threat` steps asserted. Paper: Sussman anomaly → put_c_from_a_on_table;put_b_on_c;put_a_on_b.

## 7. Determinism & Bounds
BTreeSet orderings/agenda, deterministic choice order; bounded search.

## 8. Provenance
Fixture `tests/fixtures/papers/partial_order_plan.json` (propositionalized Sussman anomaly).
