# qualitative_reason — Confluence Envisionment

## 1. Identity & Lineage
Qualitative physics based on confluences (de Kleer & Brown, AIJ 1984). BreedId `qualitative_reason`, module `src/breeds/qualitative_reason.rs`.

## 2. Algorithm
Sign algebra {+,0,−} with ambiguous + ⊕ −; propagate determined confluences to fixpoint (single-unknown inference); envision by branching on unknown variables (lex order, {+,0,−}), keep globally consistent states (≤32); limit analysis marks moving variables; all-zero state = equilibrium.

## 3. Input Contract
Facts `qr:confluence:<id>`="+x,-y,-z" (signed terms summing to 0), `qr:sign:<v>`="+|0|-". ≤12 variables.

## 4. Output Contract
Facts `qr:state:<i>`="x:+,y:-,...", `qr:state_count`, `qr:equilibrium`="S<i>"|"none".

## 5. Trace & OCEL Lifecycle
`load-model`(1,1) → {`propagate-confluence`,`branch-ambiguity`}(1,*) → {`limit-analysis`,`envision-state`}(1,*) → `equilibrium`(0,1). Report fitness 1.0.

## 6. Oracles
Refusal: no confluences / sign for unconstrained variable / over-constrained (run error). Hidden: bathtub variant — ambiguous confluence yields ALL THREE dvol branches (state-count 3 asserted), dvol=0 branch present. Paper: pressure-regulator valve dQ ambiguity → exactly 3 states.

## 7. Determinism & Bounds
Sorted vars/confluences, sorted states; bounded envisionment.

## 8. Provenance
Fixture `tests/fixtures/papers/qualitative_reason.json` (verbatim dKB84 valve confluence).
