# eliza — Pattern-Matching Dialogue Engine

## 1. Identity & Lineage
ELIZA (Weizenbaum 1966, MIT). Simulated psychotherapy via keyword detection and reassembly rules. BreedId `eliza`, module `src/breeds/frame.rs` (`pub struct Eliza`).

## 2. Algorithm
Rules sorted by `certainty` priority (descending). For each `utterance` fact: scan rules in priority order, find first keyword match (case-insensitive substring), apply `$1` reassembly template. Fallback: `"Tell me more about that."` if no rule fires.

## 3. Input Contract
`input.facts` with `key=="utterance"`. `input.rules`: `premise: ["pattern:<keyword>"]`, `conclusion: <template>`, `certainty: f32` (priority). Multiple utterances produce one response each.

## 4. Output Contract
`selected` = last response. `confidence` = fraction of utterances matched (0–1). Facts `eliza:response:<i>` per utterance.

## 5. Trace & OCEL Lifecycle
`parse-utterance`(1,1) → `match-keyword`(1,*) → `reassemble`(1,1) per utterance cycle. Report fitness 1.0.

## 6. Oracles
Paper: Weizenbaum (1966) "ELIZA—A Computer Program" CACM 9(1): "I am worried about my mother" → mother keyword fires → family response. Three-turn exchange fixture asserts all three responses.

## 7. Determinism & Bounds
Priority tie-break is lexicographic by rule id; responses emitted in utterance order.

## 8. Provenance
Fixture `tests/fixtures/papers/eliza.json` (Weizenbaum 1966 CACM transcript, p.36–45).
