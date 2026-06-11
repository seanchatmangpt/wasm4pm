# description_logic — EL Completion Classification

## 1. Identity & Lineage
EL++ completion-rule subsumption (Baader, Brandt & Lutz, IJCAI 2005). BreedId `description_logic`, module `src/breeds/description_logic.rs`.

## 2. Algorithm
Completion rules CR1 (atomic GCI), CR2 (conjunction), CR3 (existential right), CR4 (existential left) iterated to fixpoint over subsumer sets S(C) and role edges R(r). Role-inclusion-free fragment.

## 3. Input Contract
Facts: `dl:subclass:<A>`=B, `dl:conj:<A1>+<A2>`=B, `dl:exists_rhs:<A>`=r.B, `dl:exists_lhs:<r>.<A>`=B. Queries: goals `{predicate:"dl:subsumes", value:"A:B"}`. ≤32 concepts.

## 4. Output Contract
Facts `dl:verdict:<A>:<B>` = "true"/"false" per query; `selected` = first verdict summary.

## 5. Trace & OCEL Lifecycle
`normalize`(1,1) → {`apply-cr1..4`,`fixpoint`}(1,*) → `classify-verdict`(1,*). Model `ocel/models/l1/description_logic.ocpn.json`; report fitness 1.0.

## 6. Oracles
Refusal: no TBox axioms / no query. Hidden: role-chain-only subsumption (CR3+CR4) with reverse direction NOT derived (precision). Paper: Pericarditis ⊑ HeartDisease (BBL05 medical example).

## 7. Determinism & Bounds
BTreeMap/BTreeSet saturation; polynomial fixpoint. Bit-exact double run.

## 8. Provenance
Fixture `tests/fixtures/papers/description_logic.json` (adapted: role chain pre-composed; deviation documented in fixture notes).
