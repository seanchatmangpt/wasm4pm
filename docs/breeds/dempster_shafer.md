# dempster_shafer — Dempster–Shafer Theory of Evidence

## 1. Identity & Lineage
Dempster–Shafer theory of evidence — Shafer 1976. BreedId `dempster_shafer`, module `src/breeds/dempster_shafer.rs`.

## 2. Algorithm
Frame of discernment ≤8 hypotheses encoded as u8 bitmasks. Sources are folded pairwise with Dempster's rule of combination with K-normalization. The goal's query subset gets Bel (sum of masses contained) and Pl (sum of masses intersecting).

## 3. Input Contract
Query subset in goals (predicate `query`). Basic probability assignments (BPA) in rules. `rule.id` groups rules into sources. `rule.certainty` is mass [0,1]. Unassigned mass per source goes to ignorance (full frame).

## 4. Output Contract
Facts `belief:<query>` and `plausibility:<query>` formatted to 9 decimal places. `selected` = "Bel=..., Pl=...".

## 5. Trace & OCEL Lifecycle
`ds-load-bpa`(1,1) → `ds-combine`(0,*) → `ds-belief`(1,1). Report fitness 1.0.

## 6. Oracles
Refusal: frame > 8 hypotheses / K=1 total conflict / missing query / mass > 1. Hidden: combination correctly normalizes conflict. Paper: Two independent witnesses at 0.9 reliability yield Bel(life) = 0.99.

## 7. Determinism & Bounds
BTreeMap/BTreeSet working sets only. BTreeMap for subset grouping. f64 for mass. Frame size bounded to 8 hypotheses (256 subsets).

## 8. Provenance
Fixture `tests/fixtures/papers/dempster_shafer.json` (Shafer 1976, two-witness combination).
