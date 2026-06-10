# Episodic Memory

## Origin
- **Paper:** *Elements of Episodic Memory* (1983); "Extending cognitive architecture with episodic memory" (2007, AAAI)
- **Authors:** Endel Tulving; Andrew M. Nuxoll & John E. Laird
- **Tradition:** Episodic vs semantic memory; episodic memory in Soar

## Algorithm
Episodes are stored cases (facts = encoded snapshot, outcome_score = salience) each carrying an encoding time (`episode:<id>:t`). A retrieval cue (the remaining facts plus `cue:t`) scores every episode with `Jaccard(cue, snapshot) + 1/(1 + |Δt|)`. The additive temporal-proximity kernel is the episodic signature (Tulving's temporal organisation): it can flip the winner against pure content similarity, which is exactly what the hidden oracle proves.

## Pseudocode
```
function run(input):
    episodes = cases sorted by id          # trace encode-episode
    cue = non-episode, non-cue:t facts as key=value atoms; t_cue = cue:t
    trace present-cue
    for e in episodes:
        score = |cue∩e| / |cue∪e| + 1/(1+|t_cue - t_e|)   # trace score-episode
    winner = max score (lex id tie-break)  # trace recall
    trace decision
```

## Input contract
- `cases`: episodes (1–128, refused outside); every episode requires an `episode:<id>:t` integer time fact
- `facts`: cue atoms + mandatory `cue:t` (integer)

## Output contract
- `facts`: `score:<id>` (4 dp) per episode; `recalled:<id>` for the winner
- `selected`: winning episode id
- `inference_trace`: `encode-episode`+ → `present-cue` → `score-episode`+ → `recall` → `decision`

## Complexity
O(episodes × cue atoms) BTreeSet intersections; fully deterministic.

## Generalization examples
"What happened last time this alert fired?" — recency-aware incident recall; session-context retrieval where when matters as much as what.

## Adversarial coverage
- Refusal: episode without time fact; missing `cue:t`; >128 episodes
- Hidden oracle: ep-rich (Jaccard 1.0, old) loses to ep-near (Jaccard 1/3, Δt = 0) — the temporal kernel flips the pure-Jaccard winner, proving this is not CBR rebadged
- Paper fixture: equal-content kitchen episodes disambiguated by recency (Tulving temporal organisation)

## See also
- `crates/wasm4pm-cognition/src/breeds/episodic_memory.rs`
- OCPN: `ocel/models/l1/episodic_memory.ocpn.json`; report: `ocel/reports/episodic_memory.json`
