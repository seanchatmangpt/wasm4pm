# Cognition Breeds — Reference Cards

Nine classical AI architectures, each implemented as a real `CognitionBreed` in `crates/wasm4pm-cognition/src/breeds/`. Every card is derived directly from the Rust source — no algorithm details are invented.

| # | Breed | Algorithm | Card |
|---|-------|-----------|------|
| 1 | ELIZA | Wildcard pattern matching with greedy slot binding (Weizenbaum 1966) | [eliza.md](eliza.md) |
| 2 | CBR | Jaccard similarity case retrieval weighted by outcome score (Schank 1983) | [cbr.md](cbr.md) |
| 3 | DENDRAL | Monotonic constraint enumeration over a scored candidate population (Feigenbaum 1971) | [dendral.md](dendral.md) |
| 4 | STRIPS | Iterative-deepening goal-regression search with forward replay verification (Fikes & Nilsson 1971) | [strips.md](strips.md) |
| 5 | GPS | Means-ends gap reduction with recursive precondition solving (Newell & Shaw 1963) | [gps.md](gps.md) |
| 6 | MYCIN | Forward-chaining production rules with Shortliffe-Buchanan certainty factors (Shortliffe 1976) | [mycin.md](mycin.md) |
| 7 | SOAR | Preference-based operator selection with impasse detection and resolution (Laird 1987) | [soar.md](soar.md) |
| 8 | Hearsay-II | Blackboard hypothesis propagation with noisy-OR consensus fusion (Erman & Lesser 1980) | [hearsay.md](hearsay.md) |
| 9 | Prolog | Byte-capped SLD resolution via the Prolog8 kernel (Robinson 1965 / Kowalski 1974) | [prolog.md](prolog.md) |

## Ordering rationale

Cards are ordered by algorithmic complexity from least (ELIZA — O(F × T) linear scan) to most (Prolog — bounded SLD resolution with ARD byte caps). STRIPS and GPS are adjacent because they share the same state/rule encoding but differ in search strategy. MYCIN and SOAR are adjacent because both operate on scored/weighted populations. Hearsay-II sits between SOAR and Prolog because it introduces multi-source fusion, a step toward the structured proof semantics of Prolog.

## Common data model

All breeds share a single `BreedInput` / `BreedOutput` envelope:

```
BreedInput {
    intent: String,
    candidates: Vec<Candidate>,
    facts: Vec<Fact { key, value }>,
    cases: Vec<Case { id, architecture, outcome_score, facts }>,
    rules: Vec<Rule { id, premise: Vec<String>, conclusion: String, certainty: f32 }>,
    goals: Vec<Goal { id, predicate, value }>,
    state: Vec<StateAtom { predicate, value }>,
}

BreedOutput {
    breed: BreedId,
    candidates: Vec<Candidate>,
    facts: Vec<Fact>,
    selected: Option<String>,
    explanation: String,
    inference_trace: Vec<TraceStep { step, kind, detail, depth }>,
}
```

An empty `inference_trace` is a fraud signal — every breed that performs real work must append at least one step.

## Regeneration

To regenerate all cards from source:

```bash
bash scripts/generate-breed-docs.sh
```

The script extracts doc comments and algorithm steps from `crates/wasm4pm-cognition/src/breeds/*.rs` and writes updated cards. It is idempotent.

## See also

- `docs/cognition-overview.md` — high-level cognition layer architecture
- `docs/cognition-doctrine.md` — 40 design diagrams and anti-fraud doctrine
- `docs/cognition-error-catalog.md` — failure modes and error codes per breed
- `crates/wasm4pm-cognition/tests/adversarial_bypass.rs` — 8 adversarial bypass tests
