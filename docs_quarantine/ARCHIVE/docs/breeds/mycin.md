# MYCIN

## Origin
- **Paper:** "Computer-Based Medical Consultations: MYCIN" (1976)
- **Authors:** Edward Shortliffe; certainty factor algebra co-developed with Bruce Buchanan
- **Tradition:** Knowledge-based systems, expert systems, production rule systems

## Algorithm
MYCIN maintains a working memory mapping `"key=value"` strings to certainty factors (CF). It seeds working memory from `input.facts` with CF 1.0. At each iteration, it selects the highest-absolute-certainty applicable rule that has not yet fired (lexicographic tiebreak on rule id), computes the premise CF as the minimum CF of all premise atoms, then combines the inferred CF (`rule.certainty × premise_cf`) with any existing CF for the conclusion using the Shortliffe-Buchanan formula. The loop terminates when no applicable rule remains or after `2 × rules.len()` iterations as a cycle defence.

## Pseudocode
```
function run(input):
    wm = {}  // working memory: key → CF
    for each fact: wm["key=value"] = 1.0; wm["value"] = 1.0
    fired = {}
    max_iters = 2 * len(input.rules)

    for _ in 0..max_iters:
        applicable = []
        for each rule (not in fired):
            min_cf = 1.0
            all_sat = true
            for each premise p:
                if wm[p] exists and wm[p] > 0.2:
                    min_cf = min(min_cf, wm[p])
                else:
                    all_sat = false; break
            if all_sat: applicable.push((rule, min_cf))
        if applicable is empty: break

        sort applicable by |rule.certainty| descending, then rule.id ascending
        (best_rule, premise_cf) = applicable[0]
        fired.add(best_rule.id)
        inferred_cf = best_rule.certainty * premise_cf
        prev_cf = wm.get(best_rule.conclusion, 0.0)
        wm[best_rule.conclusion] = combine_cf(prev_cf, inferred_cf)
        record TraceStep("fire-rule", rule.id + " => " + conclusion + " (cf=...)")

    selected = key=value pair in wm with highest CF > 0 (not an original fact)
    explanation = "MYCIN fired N rules; final selection <selected>"

function combine_cf(a, b):
    if a >= 0 and b >= 0: return a + b - a*b
    if a < 0  and b < 0:  return a + b + a*b
    else: return (a + b) / (1 - min(|a|, |b|))
    clamped to [-1.0, 1.0]
```

## Input contract
- `intent`: not used by this breed
- `facts`: seeds working memory; each `Fact { key, value }` inserts both `"key=value"` → 1.0 and `"value"` → 1.0 into working memory
- `rules`: required (precondition rejects if empty); each `Rule { id, premise: Vec<String>, conclusion: String, certainty: f32 }` is one production rule; `premise` entries are matched against working memory keys; `certainty` is in `[-1.0, 1.0]`; a threshold of `0.2` is the minimum CF for a premise to count as satisfied
- `goals`: not used by this breed
- `cases`: not used by this breed
- `state`: not used by this breed
- `candidates`: passed through unchanged to the output

## Output contract
- `selected`: the `"key=value"` working-memory entry with the highest positive CF that was not present in the original facts; `None` if no such entry exists
- `explanation`: `"MYCIN fired N rules; final selection <selected>"`
- `inference_trace`: one `"fire-rule"` step per rule fired; `postconditions` raises an error if facts were produced without any trace steps (a breed that added conclusions without recording work is a fraud signal)

## Complexity
- Time: O(I × R × P) where I = max iterations (`2 × R`), R = number of rules, P = average premise length; overall O(R² × P)
- Space: O(R + F) for working memory entries where F = original fact count
- Determinism: yes — rule selection is deterministic via `|certainty|` sort with id tiebreak; `combine_cf` is deterministic for given inputs

## Generalization examples
- **Infection diagnosis**: facts encode patient symptoms and lab results; rules encode diagnostic chains (`fever=high + culture=positive → diagnosis=bacterial-infection` with CF 0.85); MYCIN propagates certainty through the chain and selects the conclusion with highest CF
- **Process conformance assessment**: facts encode observed trace deviations; rules encode inference chains (`deviation=skip + activity=approve → risk=high` with CF 0.9); MYCIN infers compound risk classifications from partial evidence

## Adversarial coverage
- Test file: `crates/wasm4pm-cognition/tests/adversarial_bypass.rs`
- Bypass attempts caught: human authority — mixed human-text inputs trigger `HUMAN_OUTPUT_USED_AS_AUTHORITY`; central firehose — `central_bus=true` triggers `CENTRAL_EVENT_FIREHOSE_REINTRODUCED` regardless of messaging system label
- Property tests: `combine_cf` satisfies Rank-1 mathematical properties documented in source — commutativity for same-sign inputs, identity (`combine(x, 0) == x`), and bounds `[-1.0, 1.0]` for inputs in `[-1.0, 1.0]`

## See also
- `docs/cognition-overview.md`
- `docs/cognition-error-catalog.md` for failure modes
- `crates/wasm4pm-cognition/src/breeds/production_rules.rs` for source
