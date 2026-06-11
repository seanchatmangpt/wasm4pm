# autoinstinct_semantics — Autoinstinct Semantic Grounding

## 1. Identity & Lineage
Semantic-grounding autoinstinct: maps surface symbol strings to grounded concept representations via similarity-weighted lookup. BreedId `autoinstinct_semantics`, module `src/breeds/autoinstinct_semantics.rs`.

## 2. Algorithm
1. Parse concept entries from `input.facts[key="concept:<id>:embedding"]` as comma-separated f32 vectors.
2. For each query in `input.goals[predicate="ground"]`, compute cosine similarity against all concept embeddings.
3. Return best-matching concept id as `selected`; confidence = cosine similarity score.

## 3. Input Contract
`input.facts[key="concept:<id>:embedding"]`: comma-separated f32 vector strings. `input.goals[predicate="ground", value=<query_id>]`: concept ids to ground.

## 4. Output Contract
`selected` = best-matching concept id. `confidence` = cosine similarity (0–1). Facts `semantics:ground:<query_id>` = matched concept id.

## 5. Trace & OCEL Lifecycle
`load-concepts`(1,1) → `compute-similarity`(1,*) → `ground`(1,1) per query. Report fitness 1.0.

## 6. Oracles
Cosine identity: `sim(v, v) = 1.0`. Orthogonal vectors: `sim = 0.0`. Nearest-neighbor assertion on a 3-concept fixture.

## 7. Determinism & Bounds
BTreeMap concept store; f32 formatted at fixed precision for determinism.

## 8. Provenance
Fixture `tests/fixtures/papers/autoinstinct_semantics.json` (synthetic 3-vector grounding test).
