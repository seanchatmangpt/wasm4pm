# soar — Cognitive Architecture (SOAR Simplified)

## 1. Identity & Lineage
SOAR (Laird, Newell & Rosenbloom 1987, CMU). Unified cognitive architecture: problem spaces, operators, preference learning, chunking. BreedId `soar`, module `src/breeds/soar.rs`.

## 2. Algorithm
Simplified SOAR decision cycle: (1) elaborate working memory via rules, (2) propose operators via `propose:` facts, (3) select best-preference operator (lex tiebreak), (4) apply operator effects, (5) chunk learned rule if goal reached. Cycles limited to 32 to prevent infinite loops.

## 3. Input Contract
`input.facts`: working memory atoms. `input.rules`: operators with `premise` (conditions), `conclusion` (effects, `propose:` prefix = proposal), `certainty` (preference weight). `input.goals`: goal conditions.

## 4. Output Contract
`selected` = final selected operator name. `confidence` = goal-achievement ratio (achieved goals / total goals). Facts `soar:wm:<key>` for working memory state; `soar:chunk:<id>` for learned chunks.

## 5. Trace & OCEL Lifecycle
`elaborate`(1,1) → `propose`(1,1) → `decide`(1,1) → `apply`(1,1) per cycle; `chunk`(0,1). Report fitness 1.0.

## 6. Oracles
Paper: Laird et al. (1987) Eight-puzzle: operator sequence leads to goal; trace asserts correct operator selection at each impasse. Structural: no applicable operators → impasse error.

## 7. Determinism & Bounds
BTreeMap working memory; max 32 decision cycles; lex tiebreak on operator names.

## 8. Provenance
Fixture `tests/fixtures/papers/soar.json` (Laird et al. 1987 eight-puzzle, Figure 3 decision cycle).
