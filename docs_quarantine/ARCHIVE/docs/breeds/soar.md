# SOAR

## Origin
- **Paper:** "SOAR: An Architecture for General Intelligence" (1987)
- **Authors:** John E. Laird, Allen Newell, Paul S. Rosenbloom
- **Tradition:** Unified cognitive architecture, preference-based decision cycle, impasse resolution

## Algorithm
SOAR applies a five-step preference resolution protocol to a candidate operator population. First, candidates tagged with `prohibit` are eliminated. Second, if any `require` preference exists, all non-required candidates are vetoed. Third, `better:A:B` dominance preferences are applied transitively until no more eliminations occur (cycle-bounded iteration). Fourth, among survivors, candidates tagged `best` are preferred over `worst`. Fifth, if exactly one candidate remains, it is selected decisively; otherwise an impasse is declared and resolved by highest score with lexicographic id tiebreak. All steps are recorded in the inference trace.

## Pseudocode
```
function run(input):
    prefs = parse_prefs(input.facts)
        // prefs.best, worst, require, prohibit: HashSets of candidate ids
        // prefs.better: Vec<(better_id, worse_id)>
    candidates = copy(input.candidates)

    // Step 1: prohibit
    for c where c.id in prefs.prohibit:
        c.eliminated = true; record TraceStep("prohibit", c.id)

    // Step 2: require
    if prefs.require not empty:
        for c (not eliminated) where c.id not in prefs.require:
            c.eliminated = true; record TraceStep("veto-non-required", c.id)

    // Step 3: better-than dominance (transitive, cycle-bounded)
    max_iters = len(prefs.better) * len(candidates) + 1
    repeat until no change or max_iters reached:
        for (better, worse) in prefs.better:
            if better is alive and worse is alive:
                worse.eliminated = true
                record TraceStep("dominate", better+" > "+worse)

    // Step 4: best/worst tags
    alive = candidates not eliminated
    if any alive in prefs.best:
        surviving = alive ∩ prefs.best
    else:
        surviving = alive - prefs.worst

    // Step 5: selection or impasse
    if |surviving| == 1: selected = surviving[0] (decisive)
    elif |surviving| == 0: selected = None (impasse, no survivors)
    else:
        record TraceStep("impasse", "tie among N candidates")
        selected = max_score(surviving) with id tiebreak

    explanation = "SOAR [decisive|impasse-resolved] selected <id> (best=N, worst=N, ...)"
    return BreedOutput(selected, candidates, explanation)
```

## Input contract
- `intent`: not used by this breed
- `facts`: preference declarations; each `Fact { key="pref", value="<kind>:<id>" }` defines one preference; supported kinds: `best`, `worst`, `require`, `prohibit`, `better` (format: `better:<a>:<b>` meaning a is strictly better than b)
- `rules`: not used by this breed
- `goals`: not used by this breed
- `cases`: not used by this breed
- `state`: not used by this breed
- `candidates`: required (precondition rejects if empty); each `Candidate { id, score, eliminated, elimination_reason }` is an operator candidate

## Output contract
- `selected`: id of the single decisive survivor, or the highest-score impasse-resolution winner; `None` when all candidates are eliminated
- `explanation`: `"SOAR [decisive|impasse-resolved] selected <id> (best=N, worst=N, require=N, prohibit=N, better-pairs=N)"`
- `inference_trace`: `"prohibit"`, `"veto-non-required"`, `"dominate"`, and `"impasse"` steps as applicable; postcondition requires at least one preference step when more than one candidate is present

## Complexity
- Time: O(P × K) where P = number of `better` pairs and K = number of candidates; the dominance loop runs at most `P × K + 1` iterations
- Space: O(K) for the candidate copy and preference sets
- Determinism: yes — all elimination steps and tiebreaks are deterministic; impasse resolution uses score then lexicographic id

## Generalization examples
- **Algorithm selection under conflicting preferences**: candidates are process mining algorithms; preferences encode domain constraints (`require:inductive_miner`, `prohibit:dfg`, `best:genetic_algorithm`); SOAR selects the uniquely required algorithm or resolves the impasse among remaining candidates
- **Resource assignment**: candidates are available agents; preferences encode capability requirements and historical performance; SOAR eliminates prohibited agents and selects the best-fit survivor, declaring an impasse when multiple candidates tie

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: central firehose — `central_bus=true` triggers `CENTRAL_EVENT_FIREHOSE_REINTRODUCED` regardless of the messaging system label; self-certify — signing skew under 5 seconds triggers `AGENT_SELF_CERTIFIES` even with distinct executor and verifier keys
- Property tests: the dominance loop is bounded by `P × K + 1` iterations to prevent infinite cycles; `postconditions` requires at least one trace step when multiple candidates are present, catching a breed that skipped all resolution steps

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/soar.rs` for source
