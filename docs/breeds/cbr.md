# cbr — Case-Based Reasoning

## 1. Identity & Lineage
CBR via Jaccard similarity with Discrimination Net indexing (Schank 1983; Kolodner 1993). BreedId `cbr`, module `src/breeds/cbr.rs`.

## 2. Algorithm
Build discrimination-net index: map `key=value` feature strings to case indices (O(log N) lookup). For each candidate case, compute `sim = |intersection(query_facts, case_facts)| / |union|`. Score = `sim × outcome_score`. Select maximum-score case (lex tiebreak on case id). Recommend `selected = best_case.architecture`.

## 3. Input Contract
`input.facts`: query features as `key=value` strings. `input.cases`: each with `id`, `facts: [Fact]`, `outcome_score: f32`.

## 4. Output Contract
`selected` = best case id. `confidence` = best score. Facts `cbr:sim:<id>` for each candidate's similarity.

## 5. Trace & OCEL Lifecycle
`build-index`(1,1) → `retrieve-candidates`(1,1) → `score-case`(1,*) → `select-best`(1,1). Report fitness 1.0.

## 6. Oracles
Structural: Jaccard symmetry (a,b) == (b,a); identity (a,a) == 1; empty-set == 0. Hidden: partial match (1/3) beats zero match; exact case id asserted.

## 7. Determinism & Bounds
BTreeMap discrimination net; HashSet for Jaccard (order-independent); lex tiebreak.

## 8. Provenance
Fixture `tests/fixtures/papers/cbr.json` (Kolodner 1993 CHEF cooking failure-and-repair case).
