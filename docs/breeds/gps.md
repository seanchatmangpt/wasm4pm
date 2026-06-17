# gps — General Problem Solver

## 1. Identity & Lineage
GPS (Newell & Simon 1963, CMU). Means-ends analysis: goal-directed difference reduction via operator chaining. BreedId `gps`, module `src/breeds/gps.rs`.

## 2. Algorithm
Means-ends analysis: (1) compute difference between current state and goal, (2) find operator that reduces the primary difference, (3) apply operator (resolving sub-goals recursively if preconditions not met), (4) repeat until goal satisfied or depth exhausted (max 16). Difference = first unsatisfied goal predicate.

## 3. Input Contract
`input.state`: current `StateAtom` list. `input.goals`: `Goal` list. `input.rules`: operators with `premise` (requires), `conclusion` (achieves), and `certainty` (difference-reduction score, higher = preferred).

## 4. Output Contract
`selected` = operator sequence (semicolon-joined). `confidence` = 1.0 if all goals reached. Trace: each difference evaluation and operator application.

## 5. Trace & OCEL Lifecycle
`identify-difference`(1,1) → `select-operator`(1,1) → `apply-operator`(1,1) per cycle; `goal-achieved`(1,1) terminal. Report fitness 1.0.

## 6. Oracles
Paper: Newell & Simon (1963) tower-of-Hanoi: 3-disk move sequence, exact operator names asserted in fixture. Structural: goal already satisfied → empty plan; no operator reduces difference → error.

## 7. Determinism & Bounds
BTreeMap state; max recursion depth 16; operator selection lex-sorted on name for tie-break.

## 8. Provenance
Fixture `tests/fixtures/papers/gps.json` (Newell & Simon 1963 three-disk tower of Hanoi, pp. 389–394).
