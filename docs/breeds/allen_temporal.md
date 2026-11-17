<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/allen_temporal.md; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, Surface-3: compose detail is "{k} via {i} -> {j}:
{mask}", output keys are `derived:{i}:{j}`, interval load steps carry
"interval {name} [{s},{e}]", mask-0/malformed relation facts are typed refusals.

# allen_temporal — Interval Algebra

## 1. Identity & Lineage
ALLEN_TEMPORAL (Allen 1983, "Maintaining Knowledge about Temporal Intervals", CACM 26(11)). Tradition: Qualitative temporal reasoning, constraint propagation. BreedId `allen_temporal`.

## 2. Algorithm
Constraint propagation of the 13 basic relations using a 169-entry composition
table. Symbolic `relation` facts and concrete `interval` endpoints seed an n×n
constraint matrix. Path consistency runs to fixpoint with a work queue. Empty
relation sets indicate inconsistency (both direct 2-node contradictions and
fixpoint-detected ones are typed refusals).

## 3. Input Contract
facts `relation` = `"A,B,r1|r2"` with symbols p pi m mi o oi d di s si f fi eq
(also accepts long names like `precedes`/`before`, normalized first).
state `interval` = `"name,start,end"` (start < end). ≤32 intervals total.

## 4. Output Contract
facts `derived:{i}:{j}` — post-fixpoint relation mask, symbols in index order,
one fact per ordered distinct pair. Candidate `temporal-consistent` scores 1.0.

## 5. Trace & OCEL Lifecycle
`allen-load`(1,*) → `allen-compose`(0,*) → `allen-verdict`(1,1). Report fitness 1.0.
- `allen-load` details: `"interval {name} [{s},{e}]"` for concrete intervals,
  `"rel {i},{j},{rels}"` for relation facts.
- `allen-compose` detail: `"{k} via {i} -> {j}: {mask}"` naming the narrowed
  mask (e.g. `rc via rb -> ra: pi`).

## 6. Oracles
Paper: Allen 1983 Table 1 entry m∘d = (o s d) asserted exactly.
Adversarial: Empty inputs; cyclic-before inconsistency; mask-0 relation fact
(`"ra,rb,rn"` — "has no valid relations"); malformed relation fact
(`"ra,rb"` — 2 fields); postconditions pin exactly one trailing `allen-verdict`
and at least one `derived:` fact.

## 7. Determinism & Bounds
O(n³) per queue pass; fixpoint bounded by total bit count (13n²). Guaranteed termination. Uses BTree structures.

## 8. Provenance
Fixture `tests/fixtures/papers/allen_temporal.json` (Allen 1983 Table 1).
