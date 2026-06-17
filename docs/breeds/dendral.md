# dendral — Constraint-Based Candidate Enumeration

## 1. Identity & Lineage
DENDRAL (Feigenbaum & Buchanan 1971, Stanford). Hypothesis generation via constraint satisfaction for molecular structure inference. BreedId `dendral`, module `src/breeds/dendral.rs`.

## 2. Algorithm
1. Parse constraints from `input.facts[key="constraint"]`: `forbid:<id>`, `require:<token>`, `max-score:<f>`, `min-score:<f>`.
2. Validate each constraint (unknown prefixes → BreedError Andon).
3. Eliminate candidates that violate any constraint (monotonic).
4. Score surviving candidates unchanged; select highest-score survivor (lex tiebreak on id).

## 3. Input Contract
`input.candidates`: `Candidate { id: String, score: f32 }`. `input.facts[key="constraint"]`: constraint predicates.

## 4. Output Contract
`selected` = winning candidate id. `confidence` = winning score. Facts `dendral:eliminated:<id>` per eliminated candidate with reason.

## 5. Trace & OCEL Lifecycle
`validate-constraints`(1,1) → `eliminate`(1,*) → `select`(1,1). Report fitness 1.0.

## 6. Oracles
Structural: `forbid:X` eliminates exactly X; `require:online` eliminates all candidates not containing "online". Malformed constraint → error (Andon-loud). Paper: Feigenbaum 1971 mass-spectrometry fragmentation: two constraints eliminate 3 of 5 candidates; winner asserted.

## 7. Determinism & Bounds
Constraint validation first (fail-fast); lex tiebreak on candidate id.

## 8. Provenance
Fixture `tests/fixtures/papers/dendral.json` (Feigenbaum 1971 pentan-1-ol mass spectrometry, Table II).
