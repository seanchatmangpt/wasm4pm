<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/qualitative_reason.md; source-sha256: 0b531a31f944fcf905ff0de12442b47048f50dc2fd6314219fba2b8359ab0d68; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, branch-ambiguity steps attribute the ambiguous
confluence id; empty envisionment (over-constrained) is a typed refusal;
output facts renamed `state_count`/`state_<i>`/`equilibrium_reachable`.

# qualitative_reason — Confluence Envisionment

## 1. Identity & Lineage
Qualitative physics based on confluences (de Kleer & Brown, AIJ 1984).
BreedId `qualitative_reason`, module `src/breeds/qualitative_reason.rs`.

## 2. Algorithm
Sign algebra {+,0,−} with ambiguous + ⊕ − = {+,0,−}. Enumerative
envisionment: all 3^n sign states (n ≤ 12) are generated, filtered by the
initial signs and by every confluence summing to its target (0, or the
right-hand variable's sign). A confluence is ambiguous iff one of its
variables takes more than one sign across the valid states — that confluence
id is attributed in a `branch-ambiguity` step. All-zero state = equilibrium.

## 3. Input Contract
Facts `qr:confluence:<id>`="+x,-y,-z" (signed terms, comma-separated;
bare term defaults positive), `qr:sign:<v>`="+|0|-"; plain `var`=`sign`
facts and rules (premise terms, conclusion as right side) also accepted.
Exact envisionment refuses >12 variables.

## 4. Output Contract
Facts `state_count`, `state_<i>`="x:+,y:-,...", `equilibrium_reachable`=
"true"/"false". `selected` = None.

## 5. Trace & OCEL Lifecycle
`load-model`(1,1) → `limit-analysis`(1,1) → `branch-ambiguity`(0..2: one
per ambiguous confluence with the id in `objects`, or a single
no-ambiguity step) → `envision-state`(0,*) — one per valid state.
Postcondition: non-empty trace. Report fitness 1.0.

## 6. Oracles
Refusal: no rules and no facts; >12 variables; no consistent qualitative
state (over-constrained — typed error). Hidden: bathtub variant — ambiguous
confluence yields ALL THREE dvol branches, dvol=0 branch present. Paper:
pressure-regulator valve dQ ambiguity → exactly 3 states.

## 7. Determinism & Bounds
Sorted variables/confluences/states (BTreeMap/BTreeSet); bounded
envisionment 3^n ≤ 3^12 states.

## 8. Provenance
Fixture `tests/fixtures/papers/qualitative_reason.json` (verbatim dKB84
valve confluence).
