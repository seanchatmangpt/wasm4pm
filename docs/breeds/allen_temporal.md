# allen_temporal — Interval Algebra

## 1. Identity & Lineage
ALLEN_TEMPORAL (Allen 1983, "Maintaining Knowledge about Temporal Intervals", CACM 26(11)). Tradition: Qualitative temporal reasoning, constraint propagation. BreedId `allen_temporal`.

## 2. Algorithm
Constraint propagation of the 13 basic relations using a 169-entry composition table. Symbolic `relation` facts and concrete `interval` endpoints seed an n×n constraint matrix. Path consistency runs to fixpoint with a work queue. Empty relation sets indicate inconsistency.

## 3. Input Contract
facts `relation` = `"A,B,r1|r2"` with symbols p pi m mi o oi d di s si f fi eq.
state `interval` = `"name,start,end"` (start < end). ≤32 intervals total.

## 4. Output Contract
facts `derived:A,B` — post-fixpoint relation mask, symbols in index order.

## 5. Trace & OCEL Lifecycle
`allen-load`(1,*) → `allen-compose`(0,*) → `allen-verdict`(1,1). Report fitness 1.0.

## 6. Oracles
Paper: Allen 1983 Table 1 entry m∘d = (o s d) asserted exactly.
Adversarial: Empty inputs, cyclic-before inconsistency.

## 7. Determinism & Bounds
O(n³) per queue pass; fixpoint bounded by total bit count (13n²). Guaranteed termination. Uses BTree structures.

## 8. Provenance
Fixture `tests/fixtures/papers/allen_temporal.json` (Allen 1983 Table 1).
