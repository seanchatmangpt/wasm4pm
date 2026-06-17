# script_sam — SAM Script Application

## 1. Identity & Lineage
Script Applier Mechanism (Schank & Abelson, Scripts Plans Goals and Understanding, 1977). BreedId `script_sam`, module `src/breeds/script_sam.rs`.

## 2. Algorithm
Built-in script inventory (restaurant, airport) with ordered scenes + roles; selection by max scene-vocabulary overlap (lex tiebreak); monotone alignment of ordered story events; role binding from scene roles; gap inference of unobserved scenes strictly between first and last matched scene (bounded — nothing past the last observation).

## 3. Input Contract
Facts `sam:event:<i>`="scene" or "scene:actor" (numeric order). ≤64 events; ≥1 event in a known script vocabulary.

## 4. Output Contract
Facts `sam:script`, `sam:inferred:<scene>`=filler, `sam:role:<role>`=actor, `sam:inferred_count`; `selected` = script name.

## 5. Trace & OCEL Lifecycle
`select-script`(1,1) → {`align-event`,`bind-role`}(1,*) → `infer-gap`(0,*) → `summary`(1,1). Report fitness 1.0.

## 6. Oracles
Refusal: no events / unknown vocabulary. Hidden: airport observing checkin+fly → inferred exactly {security, board} with bound filler, NOT land. Paper: restaurant story infers the eating scene for John.

## 7. Determinism & Bounds
Static script inventory; numeric event ordering; BTreeMap bindings.

## 8. Provenance
Fixture `tests/fixtures/papers/script_sam.json` (verbatim S&A77 Chapter 3 story, normalized scene tokens).
