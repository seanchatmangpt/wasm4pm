# DENDRAL

## Origin
- **Paper:** "Heuristic DENDRAL: A Program for Generating Explanatory Hypotheses in Organic Chemistry" (1969; Feigenbaum cited as 1971 in source)
- **Authors:** Edward Feigenbaum, Bruce Buchanan, Joshua Lederberg
- **Tradition:** Constraint-based enumeration, knowledge-based systems, expert systems

## Algorithm
DENDRAL applies a set of monotonic constraints to a candidate population, eliminating any candidate that violates at least one constraint. Elimination is permanent — no candidate is restored once removed. The surviving candidate with the highest score (lexicographic id tiebreak) is selected. Four predicate shapes are supported: `forbid:<id>` eliminates by exact id match; `require:<token>` eliminates candidates whose id does not contain the required token; `max-score:<n>` eliminates candidates scoring above the threshold; `min-score:<n>` eliminates candidates scoring below the threshold.

## Pseudocode
```
function run(input):
    candidates = copy(input.candidates)
    constraints = [ f.value | f in input.facts where f.key == "constraint" ]

    for each candidate c (not already eliminated):
        for each constraint in constraints:
            reason = violates(c, constraint)
            if reason is not None:
                c.eliminated = true
                c.elimination_reason = reason
                record TraceStep("eliminate", c.id + " by " + constraint)
                break   // first-match eliminates; monotonic
        if not eliminated:
            record TraceStep("survive", c.id)

    selected = max_score(c | c not eliminated) with id tiebreak
    explanation = "DENDRAL applied N constraints; K/M candidates survived"
    return BreedOutput(selected, candidates, explanation)
```

## Input contract
- `intent`: not used by this breed
- `facts`: constraint definitions; each `Fact { key="constraint", value="<predicate>:<arg>" }` specifies one constraint applied to every candidate; supported predicates: `forbid`, `require`, `max-score`, `min-score`
- `rules`: not used by this breed
- `goals`: not used by this breed
- `cases`: not used by this breed
- `state`: not used by this breed
- `candidates`: required (precondition rejects if empty); each `Candidate { id, score, eliminated, elimination_reason }` is subject to all constraints

## Output contract
- `selected`: id of the highest-scoring surviving candidate; `None` when all candidates are eliminated
- `explanation`: `"DENDRAL applied N constraints; K/M candidates survived"` where N = number of constraint facts, K = survivors, M = total
- `inference_trace`: one `"eliminate"` or `"survive"` step per candidate; postcondition requires at least one step

## Complexity
- Time: O(C × K) where C = number of constraints and K = number of candidates; elimination breaks on first constraint violation
- Space: O(K) for the candidate copy; constraints are held as borrowed string slices
- Determinism: yes — constraint iteration order is deterministic (derived from `input.facts` order); max-score selection has stable lexicographic tiebreak

## Generalization examples
- **Deployment target filtering**: candidates are deployment profiles (`mobile`, `edge`, `fog`, `browser`); constraints encode requirements such as `require:browser` or `max-score:0.8`; DENDRAL eliminates incompatible targets and returns the best-fit survivor
- **Drug candidate screening**: candidates are molecular structures; constraints encode forbidden substructures and required functional groups; surviving structures are ranked by a predicted binding affinity score

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: missing evidence — gate.passed=true with no runtime proof artifacts triggers `MISSING_RUNTIME_EVIDENCE`; repair weakens — a threshold history that rises then falls triggers `REPAIR_WEAKENS_GATE` even when the last value exceeds the first
- Property tests: elimination is monotonic (a candidate marked `eliminated=true` is never restored within a single `run()` call); `postconditions` rejects an empty trace

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/dendral.rs` for source
