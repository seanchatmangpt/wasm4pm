# abductive_ibe — Inference to the Best Explanation

## 1. Identity & Lineage
IBE (Harman, Phil. Review 1965) with Thagard's theory-choice criteria (J. Phil. 1978). BreedId `abductive_ibe`, module `src/breeds/abductive_ibe.rs`.

## 2. Algorithm
Closed-form score(H) = |observations covered| − 0.1·Σcost(h) over hypothesis sets of size 1 and 2 (≤10 hypotheses); deterministic lex tie-break on the joined set name.

## 3. Input Contract
Facts `ibe:obs:<o>`="true", `ibe:hyp:<h>:covers`="o1,o2", `ibe:hyp:<h>:cost`=f32 ≥ 0.

## 4. Output Contract
Facts `ibe:best`, `ibe:score` ("%.4f"); `selected` = winning set name ("h1+h2" for pairs).

## 5. Trace & OCEL Lifecycle
`collect-observations`(1,1) → {`score-hypothesis`,`compare`}(1,*) → `best-explanation`(1,1). Exact scores in `score-hypothesis` details. Report fitness 1.0.

## 6. Oracles
Refusal: no observations / no hypotheses / >10 hyps / negative cost. Hidden: cheaper partial hypothesis (2−0.2=1.8) beats costly full coverage (3−2.5=0.5), exact scores asserted in trace. Paper: evolution (3.9) > creation (0.7), Thagard's Darwin case.

## 7. Determinism & Bounds
BTreeMap hypotheses, fixed-precision score formatting; ≤55 candidate sets.

## 8. Provenance
Fixture `tests/fixtures/papers/abductive_ibe.json` (operationalized Thagard 1978 consilience/simplicity).
