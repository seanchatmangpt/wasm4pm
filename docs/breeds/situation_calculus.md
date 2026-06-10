# Situation Calculus

## Origin
- **Paper:** "The frame problem in the situation calculus: a simple solution (sometimes) and a completeness result for goal regression" (1991)
- **Authors:** Raymond Reiter
- **Tradition:** Logical action theories; McCarthy's situation calculus with successor-state axioms

## Algorithm
The breed progresses an initial situation through an ordered action sequence using Reiter successor-state axioms: a fluent holds after `do(a, s)` iff `a` added it, or it held in `s` and `a` did not delete it. Action preconditions (`Poss`) are checked before each step; a violated precondition is a run error. Fluents never touched by any executed action persist purely by inertia, and each emits a `frame-persist` trace step — machine evidence that frame inertia, not re-derivation, carried the fluent.

## Pseudocode
```
function run(input):
    fluents = {f | fact "fluent:f"}; actions parsed from action:<a>:pre/add/del
    sequence = do:0..do:N (contiguous)
    current = fluents; touched = {}
    for (n, a) in sequence:
        require pre(a) ⊆ current else Err
        current -= del(a); current += add(a); touched += del(a) ∪ add(a)
        trace regress-step
    for f in fluents where f ∉ touched: trace frame-persist(f)
    emit holds:<f> for f in current; trace decision
```

## Input contract
- `facts`: `fluent:<f>` (initial situation), `action:<a>:pre|add|del` (repeatable), `do:<n>` (0-based contiguous action sequence)
- caps (refusals): ≤64 fluents, ≤32 steps; undefined action in `do:` refused
- `rules`/`goals`/`cases`/`state`: unused

## Output contract
- `facts`: `holds:<f>` = "true" for each fluent in the final situation
- `selected`: `s<N>` (the final situation term)
- `inference_trace`: `load-axioms` (1) → `regress-step`/`frame-persist`+ → `decision` (1)

## Complexity
O(steps × fluents) set operations over BTreeSets; fully deterministic, no RNG.

## Generalization examples
Any STRIPS-style progression domain: workflow state machines, robot block stacking, document lifecycle transitions — anything with add/delete effects and inertial state.

## Adversarial coverage
- Refusal: empty `do:` sequence; >32 steps; >64 fluents; undefined action (tests/oracle_negative.rs)
- Hidden oracle: untouched fluent persists AND is named in a `frame-persist` step; touched fluents must not claim inertia (tests/oracle_hidden.rs)
- Paper fixture: Reiter 1991 blocks world pickup/putdown (tests/fixtures/papers/situation_calculus.json)

## See also
- `crates/wasm4pm-cognition/src/breeds/situation_calculus.rs`
- OCPN: `ocel/models/l1/situation_calculus.ocpn.json`; report: `ocel/reports/situation_calculus.json`
