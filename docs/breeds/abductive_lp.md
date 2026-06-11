# abductive_lp — Abductive Logic Programming

## 1. Identity & Lineage
KKT abductive framework ⟨P, A, IC⟩ (Kakas, Kowalski & Toni, JLC 1992). BreedId `abductive_lp`, module `src/breeds/abductive_lp.rs`.

## 2. Algorithm
Enumerate Δ ⊆ abducibles by size then lex (≤12); forward-close P ∪ Δ (`support::closure`); accept iff observation derived and every IC (denial) satisfied; subset-minimality prunes supersets of accepted Δ.

## 3. Input Contract
Facts `alp:abducible:<a>`="true", `alp:ic:<id>`="a,b" (atoms that must not all hold); `rules` = definite Horn program; goal `{predicate:"alp:observe", value:<atom>}`.

## 4. Output Contract
Facts `alp:explanation:<i>` = "{a,b}", `alp:explanation_count`; `selected` = first minimal explanation.

## 5. Trace & OCEL Lifecycle
`load-abducibles`(1,1) → {`candidate-delta`,`derive`,`ic-check`,`explain-accept`,`explain-reject`}(1,*) → `minimal-set`(1,1). Report fitness 1.0.

## 6. Oracles
Refusal: no abducibles / no observation goal. Hidden: {a} accepted and {a,b} excluded by minimality; IC rejects smallest Δ → answer {b}. Paper: grass-wet → {rained}, {sprinkler_on}.

## 7. Determinism & Bounds
Size-then-lex subset order; ≤2^12 candidates; BTreeSet closure.

## 8. Provenance
Fixture `tests/fixtures/papers/abductive_lp.json` (verbatim KKT92 Section 1.1 example).
