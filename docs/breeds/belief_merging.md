# belief_merging — Σ / GMax IC Merging

## 1. Identity & Lineage
Distance-based IC merging (Konieczny & Pino Pérez, JLC 2002). BreedId `belief_merging`, module `src/breeds/belief_merging.rs`.

## 2. Algorithm
Enumerate ≤2^12 worlds; filter by IC; Dalal distance to each literal-conjunction base (violated-literal count = min Hamming distance); aggregate by Σ (sum) or GMax (leximax on descending-sorted vector); select minimal worlds.

## 3. Input Contract
Facts `bm:atoms`="p,q", `bm:base:<i>`="p,-q", `bm:ic`="p,-q"|"true", `bm:operator`="sum"|"gmax". ≥2 bases, ≤12 atoms.

## 4. Output Contract
Facts `bm:model:<i>` (full literal rendering), `bm:model_count`; `selected` = first model.

## 5. Trace & OCEL Lifecycle
`enumerate-worlds`(1,1) → `filter-ic`(1,1) → {`distance`,`aggregate`}(1,*) → `select-min`(1,1) → `merged-belief`(1,1). Distance vectors in details. Report fitness 1.0.

## 6. Oracles
Refusal: <2 bases / unknown operator / unsatisfiable IC (run error). Hidden: IC excludes majority → minimal-distance IC-world (-u,v) with d=(1,1,1) in trace. Paper: Σ picks (p,q) (majoritarian), GMax picks {(p,¬q),(¬p,q)} (egalitarian) — operators disagree.

## 7. Determinism & Bounds
Bitmask world order; sorted bases; exact integer distances.

## 8. Provenance
Fixture `tests/fixtures/papers/belief_merging.json` (KP2002 discriminating profile; both operator runs).
