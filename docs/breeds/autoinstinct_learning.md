<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/breeds/autoinstinct_learning.md; source-sha256: 17e7b12bbf3acf05ad1fd2fdb67a5f791763df52e5ab804e9007d5ec5eae7828; reason: path-local documentation retained pending domain-specific supersession -->

# autoinstinct_learning — HACKER/STRIPS Means-Ends Planner

## 1. Identity & Lineage
Sussman 1973 (HACKER, MIT AI TR-297) / Winston 1975 skill acquisition with
Fikes & Nilsson 1971 STRIPS operator semantics. BreedId
`autoinstinct_learning`, module `src/breeds/autoinstinct_learning.rs`; planner
core in `src/autoinstinct/learning.rs`.

## 2. Algorithm
Two lawful paths, chosen by input shape:

- **Operator STRIPS** (`input.rules` non-empty): each rule is a STRIPS
  operator — `premise` = preconditions, `conclusion` = semicolon-separated
  effects where a `!` prefix deletes and a bare token adds. Rules without
  `!` tokens are add-only (the grammar has no negated-conclusion form; this
  is documented honestly). Search is backward-chaining means-ends IDDFS:
  subgoal on the first unsatisfied goal atom, select an operator whose ADD
  list covers it, check preconditions against the current state, apply
  delete-then-add, recurse, depth-capped at 16. The plan is replay-verified;
  facts (`key=value`) and `input.state` atoms (`predicate=value`) form the
  initial state.
- **HACKER curriculum** (`input.rules` empty): each unmastered goal atom is
  its own unit skill-acquisition step (Sussman TR-297 curriculum encoding).
  Goals match facts by identity (`predicate=value` string equality), never
  by position. Bitmask-capped at 32 goals.

## 3. Input Contract
`input.goals` (>= 1 required): goal atoms `predicate=value`.
`input.rules`: STRIPS operators as above. `input.facts`: initial state
atoms `key=value`. Optional `input.state`: additional `predicate=value`
atoms (operator path only).

## 4. Output Contract
`selected` = `"N steps to goal"` (N = plan states). `candidates` = one per
plan step, score = fraction of goals satisfied. Operator path refuses
unreachable goals with `no plan exists` (typed `BreedError`); curriculum
path refuses >32 goals naming the cap.

## 5. Trace & OCEL Lifecycle
Curriculum path: `plan-step` per state (`state=0b.. distance=N`).
Operator path: `plan-step` per state, `select-operator` per operator,
`apply-operator` per application (state after delete+add), `goal-achieved`
on success.

## 6. Oracles
Universal anti-cheat (U1–U5) via `oracle_impls::dialogue::BreedOracle for
AutoinstinctLearning`: value checks pin the curriculum descent
(distance 2→1→0 for the 2-goal novel input). Paper fixture
`tests/fixtures/papers/autoinstinct_learning.json` pins the 4-state HACKER
curriculum plan for 5 goals with 2 identity-matched facts.

## 7. Determinism & Bounds
`BTreeSet` state atoms; rule input order preserved for operator selection;
lowest-missing-bit curriculum order. Depth cap 16 (operator path); 32-goal
cap (curriculum path).

## 8. Provenance
Fixture `tests/fixtures/papers/autoinstinct_learning.json`
(Sussman 1973 HACKER MIT AI TR-297, curriculum extraction).
