# CBR (Case-Based Reasoning)

## Origin
- **Paper:** "An Introduction to Case-Based Reasoning" (1992); foundational case-based reasoning theory
- **Authors:** Janet Kolodner (1992 survey); Roger Schank (1983 — cited in source as origin of case-indexing framework)
- **Tradition:** Case-based reasoning, analogical inference, knowledge reuse

## Algorithm
CBR retrieves the best-matching past case from a ledger by computing Jaccard similarity between the current problem's fact set and each case's fact set, then weights similarity by the case's recorded `outcome_score`. The highest weighted score wins with lexicographic tiebreaking on case id. The winning case's `architecture` field becomes the recommended selection. No adaptation phase is performed; retrieval is the authoritative decision.

## Pseudocode
```
function run(input):
    query = { "key=value" | fact in input.facts }   // string set
    for each case in input.cases:
        case_set = { "key=value" | fact in case.facts }
        sim = jaccard(query, case_set)
            // jaccard(a, b) = |a ∩ b| / |a ∪ b|;  0 if both empty
        score = sim * case.outcome_score
        record TraceStep("score-case", case.id + " sim="+sim+" score="+score)

    sort by score descending, then by case.id ascending (tiebreak)
    best = first entry with score > 0

    if best exists:
        selected = best_case.architecture
        explanation = "CBR best=<id> sim=<sim> weighted=<score>"
    else:
        selected = None
        explanation = "CBR found no cases"
    return BreedOutput(selected, explanation)
```

## Input contract
- `intent`: not used in scoring; available for upstream context
- `facts`: the query fact set; each `Fact { key, value }` becomes the string `"key=value"` in the Jaccard computation
- `rules`: not used by this breed
- `goals`: not used by this breed
- `cases`: required (precondition rejects if empty); each `Case { id, architecture, outcome_score, facts }` is one retrieval candidate
- `state`: not used by this breed
- `candidates`: passed through unchanged to the output

## Output contract
- `selected`: `architecture` field of the highest-scoring case when `score > 0`; `None` when all cases score zero (no fact overlap) or no cases exist
- `explanation`: `"CBR best=<id> sim=<sim> weighted=<score>"` for the top case, or `"CBR found no cases"` when the scored list is empty
- `inference_trace`: one `"score-case"` step per case evaluated; postcondition requires at least one step

## Complexity
- Time: O(N × |F|) where N = number of cases and |F| = average number of facts per case (set intersection via hash)
- Space: O(N × |F|) for case fact sets materialised as `HashSet<String>`
- Determinism: yes — sort is stable; lexicographic tiebreak on case id

## Generalization examples
- **Architecture selection**: cases capture past system designs (`architecture="event-driven-microservices"`); new requirements are expressed as facts; CBR recommends the historically most-successful design pattern
- **Clinical pathway recommendation**: cases represent past patient episodes with lab-result facts and treatment outcomes; a new patient's current observations are matched against the ledger to surface the most analogous prior case

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: stub gate — zero-digest evidence strings do not satisfy the `StubGateDetector`; self-certify — signing skew under 5 seconds triggers `AGENT_SELF_CERTIFIES` even with distinct keys
- Property tests: `jaccard` satisfies Rank-1 mathematical properties documented in source — symmetry, identity (`jaccard(a,a)==1` for non-empty sets), bounds `[0,1]`, and empty-set convention

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/cbr.rs` for source
