# Hearsay-II

## Origin
- **Paper:** "The Hearsay-II Speech-Understanding System: Integrating Knowledge to Resolve Uncertainty" (1980)
- **Authors:** Lee D. Erman, Frederick Hayes-Roth, Victor R. Lesser, D. Raj Reddy
- **Tradition:** Blackboard architecture, multi-source hypothesis fusion, cooperative problem solving

## Algorithm
Hearsay-II maintains a shared blackboard mapping hypothesis content strings to confidence values. Initial hypotheses are seeded from `input.facts` at confidence 1.0. Knowledge sources (rules) scan the blackboard for their trigger hypothesis; when found, they post a new hypothesis at confidence `trigger_cf × ks.certainty`, fused with any existing confidence for that content via noisy-OR: `1 - (1-a)(1-b)`. The agenda iterates until no blackboard entry changes by more than `1e-6`, or after `4 × rules.len() + 4` iterations as a safety bound. The selected output is the derived hypothesis (not at the seed level) with the highest confidence.

## Pseudocode
```
function run(input):
    blackboard = {}  // content → confidence

    // Seed phase
    for each fact:
        content = "key:value"
        blackboard[content] = 1.0
        record TraceStep("seed", content)

    // Iterative agenda
    max_iters = 4 * len(input.rules) + 4
    seed_level = input.facts[0].key  // level prefix to exclude from selection
    for _ in 0..max_iters:
        changed = false
        for each ks in input.rules:
            trigger = ks.premise[0]
            if trigger not in blackboard: continue
            trigger_cf = blackboard[trigger]
            posted_cf = trigger_cf * clamp(ks.certainty, 0.0, 1.0)
            prev = blackboard.get(ks.conclusion, 0.0)
            fused = noisy_or(prev, posted_cf)
            if |fused - prev| > 1e-6:
                blackboard[ks.conclusion] = fused
                record TraceStep("post-hypothesis", ks.id+" => "+conclusion+" (cf=fused)")
                changed = true
        if not changed: break

    // Select: highest-confidence derived hypothesis (not at seed level)
    derived = { (content, cf) | content not at seed_level }
    selected = max_confidence(derived) with content tiebreak

    explanation = "Hearsay posted N hypotheses; selected <selected>"
    return BreedOutput(selected, new_facts_from_blackboard, explanation)

function noisy_or(a, b):
    return 1 - (1 - clamp(a)) * (1 - clamp(b))
```

## Input contract
- `intent`: not used by this breed
- `facts`: seeds the blackboard; each `Fact { key, value }` posts `"key:value"` with confidence 1.0; the `key` of the first fact establishes the "seed level" prefix that is excluded from the selected output
- `rules`: required (precondition rejects if empty); each `Rule { id, premise: Vec<String>, conclusion: String, certainty: f32 }` is a knowledge source; `premise[0]` is the trigger content string; `conclusion` is the hypothesis content to post; `certainty` is clamped to `[0, 1]`
- `goals`: not used by this breed
- `cases`: not used by this breed
- `state`: not used by this breed
- `candidates`: passed through unchanged to the output

## Output contract
- `selected`: content string of the highest-confidence derived hypothesis whose level prefix differs from the seed level; `None` when no derived hypotheses exist
- `explanation`: `"Hearsay posted N hypotheses; selected <selected>"` where N = total blackboard entries including seeds
- `inference_trace`: one `"seed"` step per initial fact, then `"post-hypothesis"` steps whenever a knowledge source updates the blackboard; postcondition requires at least one blackboard event

## Complexity
- Time: O(I × KS) where I = maximum iterations (`4 × KS + 4`) and KS = number of knowledge sources; overall O(KS²)
- Space: O(F + H) where F = seed hypotheses from facts and H = derived hypotheses posted by knowledge sources
- Determinism: yes — knowledge sources are iterated in `input.rules` order; noisy-OR fusion is commutative and deterministic; the convergence threshold `1e-6` is fixed

## Generalization examples
- **Speech understanding**: seed level is `phone` (phoneme hypotheses from signal processing); knowledge sources propagate through `word`, `phrase`, and `sentence` levels; selected output is the highest-confidence sentence hypothesis
- **Multi-sensor event fusion**: seed level is `sensor` (raw readings); knowledge sources encode correlation rules between sensor patterns and activity hypotheses; the blackboard accumulates fused activity confidences across independent knowledge sources

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: missing evidence — empty artifact list despite `gate.passed=true` triggers `MISSING_RUNTIME_EVIDENCE`; repair weakens — threshold history with a non-monotone maximum triggers `REPAIR_WEAKENS_GATE`; self-certify — sub-5-second signing skew triggers `AGENT_SELF_CERTIFIES`
- Property tests: `noisy_or` satisfies Rank-1 mathematical properties documented in source — commutativity, identity (`noisy_or(x, 0) == x`), bounds `[0, 1]`, and monotonicity (`noisy_or(a,b) >= max(a,b)` for inputs in `[0,1]`)

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/hearsay.rs` for source
