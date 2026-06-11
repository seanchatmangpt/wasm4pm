# version_space — Candidate Elimination

## 1. Identity & Lineage
Version spaces / generalization as search (Mitchell, AIJ 1982). BreedId `version_space`, module `src/breeds/version_space.rs`.

## 2. Algorithm
Conjunctive hypotheses over nominal attributes ("?" any, "0" bottom). Positive: minimally generalize S, prune non-covering G. Negative: specialize covering G members with S's values, prune non-maximal / below-S; collapse → Err.

## 3. Input Contract
Facts `vs:attrs`="a1,a2,...", `vs:example:<i>`="v1,...,vn:+|-" (numeric order). ≤12 attrs, ≤64 examples, ≥1 positive.

## 4. Output Contract
Facts `vs:s`, `vs:g:<i>`, `vs:converged`; `selected` = S.

## 5. Trace & OCEL Lifecycle
`init-boundaries`(1,1) → {`process-positive`,`process-negative`,`generalize-s`,`specialize-g`,`prune`}(1,*) → {`converged`|`boundaries-final`}(1,1). Boundary sizes recorded per example. Report fitness 1.0.

## 6. Oracles
Refusal: no positives / arity mismatch. Hidden: novel texture/weight/hue domain — intermediate |G|=2 asserted from trace, then exact S==G convergence. Paper: EnjoySport S=⟨Sunny,Warm,?,Strong,?,?⟩, |G3|=3, G4 2 members.

## 7. Determinism & Bounds
Sorted/deduped G; numeric example ordering.

## 8. Provenance
Fixture `tests/fixtures/papers/version_space.json` (verbatim Mitchell EnjoySport sequence).
