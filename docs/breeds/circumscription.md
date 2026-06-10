# Circumscription

## Origin
- **Paper:** "Circumscription — a form of non-monotonic reasoning" (1980)
- **Authors:** John McCarthy
- **Tradition:** Non-monotonic logic; minimal-model semantics

## Algorithm
Abnormality atoms (names starting `ab_`) are circumscribed: every subset S of ab-atoms is enumerated (bitmask order, ≤12 atoms); a candidate is a model iff the Horn closure of `facts ∪ S` (with `not_ab_x` premises evaluated against S) derives exactly the ab-atoms in S and does not derive `false`. Subset-minimal ab-sets are kept (pruned models emit `minimize` steps); a goal atom is cautiously entailed iff it holds in every minimal model.

## Pseudocode
```
function run(input):
    abs = ab_-atoms mentioned anywhere (≤12 else refuse)
    for S in subsets(abs):                  # 2^k enumeration
        cur = closure(facts ∪ S, rules with not_ab semantics vs S)
        model iff cur∩abs == S and false ∉ cur; trace enumerate-model
    minimal = models with subset-minimal S  # prune → trace minimize
    for g in goals: entailed(g) = ∀ minimal model: g ∈ closure; trace entail
    trace decision
```

## Input contract
- `facts`: plain atoms (key = atom name)
- `rules`: Horn rules; premises may use `not_<ab-atom>` (negation ONLY on `ab_` atoms — anything else refused)
- `goals`: each `value` is an atom to test for cautious entailment (≥1 required)
- cap (refusal): ≤12 abnormality atoms

## Output contract
- `facts`: `entailed:<atom>` = "true"/"false" per goal
- `selected`: first entailed goal atom (if any)
- `inference_trace`: `load-defaults` → `enumerate-model`/`minimize`+ → `entail`+ → `decision`

## Complexity
O(2^k × rules × atoms) with k ≤ 12 — at most 4096 closures, each a small fixpoint.

## Generalization examples
Defaults with exceptions: birds fly / penguins don't, configuration defaults overridden by declared anomalies, policy rules with documented exemptions.

## Adversarial coverage
- Refusal: 13 ab-atoms; negation on a non-ab atom; missing goals (tests/oracle_negative.rs)
- Hidden oracle: naive monotone chaining would derive `flies_korv`; circumscription must not; minimize prune steps asserted (tests/oracle_hidden.rs)
- Paper fixture: McCarthy 1980 bird/penguin (flies_tweety true, flies_opus false)

## See also
- `crates/wasm4pm-cognition/src/breeds/circumscription.rs`
- OCPN: `ocel/models/l1/circumscription.ocpn.json`; report: `ocel/reports/circumscription.json`
