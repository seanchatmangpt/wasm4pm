# ProbLog

## Origin
- **Paper:** "ProbLog: a probabilistic Prolog and its application in link discovery" (2007, IJCAI)
- **Authors:** Luc De Raedt, Angelika Kimmig, Hannu Toivonen
- **Tradition:** Probabilistic logic programming; Sato's distribution semantics

## Algorithm
Exact possible-worlds inference: with k probabilistic facts (`pfact:<atom>` = p), all 2^k total choices are enumerated; each world's weight is `Π p_i · Π (1−p_i)`, the shared Horn forward-closure engine decides whether the query is derivable, and the success probability is the sum of derivable-world weights — no approximation, no sampling.

## Pseudocode
```
function run(input):
    pf = sorted pfacts (1 ≤ k ≤ 12 else refuse)    # trace load-pfact
    P = 0
    for mask in 0..2^k:
        world = deterministic facts ∪ {pf_i | bit i set}
        w = Π chosen p_i · Π unchosen (1-p_i)
        derived = query ∈ forward_close(world, rules)   # trace enumerate-world
        if derived: P += w                              # trace sum-weight
    trace decision "P(query) = %.6f"
```

## Input contract
- `facts`: `pfact:<atom>` = probability ∈ [0,1] (1–12, refused outside); any other fact key = deterministic atom
- `rules`: definite Horn rules over atoms
- `goals[0].value`: the query atom (required)

## Output contract
- `facts`: `prob:<query>` = probability formatted to 6 dp (bit-stable receipts)
- `selected`: the formatted probability
- `inference_trace`: `load-pfact`+ → `enumerate-world`/`sum-weight`+ → `decision`

## Complexity
O(2^k × closure) with k ≤ 12 (≤4096 worlds) — exactness is bought with a hard refusal cap, never silent truncation.

## Generalization examples
Noisy-or fault trees, link prediction in probabilistic graphs, reliability of derivations over uncertain inputs.

## Adversarial coverage
- Refusal: 13 pfacts; probability outside [0,1]; missing query goal
- Hidden oracle: novel program with hand-derived P = 0.25 + 0.75·0.35·0.6 = 0.4075 asserted to 1e-6; world count asserted (2^3 = 8)
- Paper fixture: distribution semantics instance with P(wet) = 1 − 0.8·0.8·0.7 = 0.552 exact (PRD-mandated oracle value)

## See also
- `crates/wasm4pm-cognition/src/breeds/problog.rs`; engine: `src/breeds/support/closure.rs`
- OCPN: `ocel/models/l1/problog.ocpn.json`; report: `ocel/reports/problog.json`
