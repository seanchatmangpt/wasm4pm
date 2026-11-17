<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/script_sam.md; source-sha256: fd11c1dd332e5c1777fb4b3e4ea1ec512ad32f4442ab460b94f8f17362ec7a7f; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, airport script added to the builtin inventory;
role bindings surface as `sam:role:<role>` facts + bind-role steps;
could-not-align is a typed refusal; summary is always the last step.

# script_sam — SAM Script Application

## 1. Identity & Lineage
Script Applier Mechanism (Schank & Abelson, Scripts Plans Goals and
Understanding, 1977). BreedId `script_sam`, module
`src/breeds/script_sam.rs`.

## 2. Algorithm
Script inventory = `input.rules` when supplied, else the builtin inventory
(airport, restaurant — deterministic order). Selection evaluates every
candidate script and keeps those where ALL observations align in order
(forward gaps allowed); best = max matched count. Monotone alignment of
ordered story events; role binding of `$role` variables from the scene
arguments; bounded gap inference of scenes strictly between the first and
last matched scene index (A8 counter — nothing at or past the last
observation).

## 3. Input Contract
Facts `sam:event:<i>`="scene:filler" or bare "scene" (numeric order), or
historical `observation`="scene(filler)". Preconditions refuse empty
observations. Builtin scripts: restaurant = enter/order/eat/pay/leave with
`$customer`; airport = checkin/security/board/fly with `$passenger`.

## 4. Output Contract
Facts `sam:inferred:<scene>`=filler, `sam:role:<role>`=filler (one per
bound `$role`); `selected` = script name.

## 5. Trace & OCEL Lifecycle
`select-script`(1 per candidate) → `align-event`(1,*) → `bind-role`(0,*) →
`infer-gap`(0,*) → `summary`(1,1, always last). Postconditions require
`select-script` and `summary` kinds. Report fitness 1.0.

## 6. Oracles
Refusal: no observations (precondition and run-time); could not align the
observations to any known script (typed error, tried-count reported).
Hidden: airport observing checkin+fly → inferred exactly {security, board}
with the bound passenger filler, NOT land. Paper: restaurant story infers
the eating scene for John.

## 7. Determinism & Bounds
Static script inventory; numeric event ordering; BTreeMap bindings and
sorted role emission.

## 8. Provenance
Fixture `tests/fixtures/papers/script_sam.json` (verbatim S&A77 Chapter 3
story, normalized scene tokens).
