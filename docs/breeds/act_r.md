# ACT-R

## Origin
- **Paper:** *The Atomic Components of Thought* (1998)
- **Authors:** John R. Anderson, Christian Lebiere
- **Tradition:** Unified cognitive architectures; declarative/procedural memory separation

## Algorithm
A production cycle (≤32 iterations) interleaved with declarative retrieval. Conflict resolution picks the highest-utility (certainty) matching production, lexicographic id tie-break. A conclusion `retrieve:<k>=<v>` issues a retrieval request: chunk activation follows the ACT-R equation `A_i = B_i + Σ_j W_j·S_ji` with base level `B_i = Case.outcome_score`, source weights `W_j = 1/n` over the n working-memory atoms, and `S_ji = 1` when chunk i contains atom j. The best chunk above threshold τ (default 0.0) enters working memory; otherwise a `retrieval-failure` is recorded.

## Pseudocode
```
function run(input):
    wm = {key=value atoms}; chunks = cases (trace load-chunk each)
    loop ≤32:
        applicable = unfired rules with premise ⊆ wm
        rule = max by (certainty, lex id)        # match-production, fire-production
        if rule.conclusion = "retrieve:k=v":
            A_i = B_i + |slots_i ∩ wm| / |wm| for chunks with slot k=v
            best ≥ τ → retrieve-chunk (slots + retrieved=<id> into wm)
            else retrieval-failure (retrieval=failure into wm)
        else wm += conclusion
    trace decision
```

## Input contract
- `facts`: working memory seed (`actr:threshold` optionally overrides τ)
- `cases`: declarative chunks (facts = slots, outcome_score = base activation)
- `rules`: productions (premise atoms = `key=value`; conclusion plain atom or `retrieve:` request); ≥1 required
- cap (refusal): ≤64 chunks

## Output contract
- `facts`: new working-memory atoms (retrieved chunk slots, conclusions)
- `selected`: last retrieved chunk id
- `inference_trace`: `load-chunk`* → {`match-production`,`fire-production`,`retrieval-request`,`retrieve-chunk`,`retrieval-failure`}+ → `decision` (one multi-kind cycle phase, HEARSAY precedent)

## Complexity
O(cycles × rules × premises + cycles × chunks × slots); deterministic (no noise; the architecture's optional activation noise is intentionally not implemented).

## Generalization examples
Arithmetic-fact retrieval (paper case), choosing the remembered runbook entry that best matches current incident context, skill selection by utility.

## Adversarial coverage
- Refusal: no productions; >64 chunks
- Hidden oracle: two chunks identical except base activation — higher B wins, with the activation value evidenced in the `retrieve-chunk` detail
- Paper fixture: Anderson & Lebiere addition retrieval (3+4 → fact34, A = 0.5 + 2/3)

## See also
- `crates/wasm4pm-cognition/src/breeds/act_r.rs`
- OCPN: `ocel/models/l1/act_r.ocpn.json`; report: `ocel/reports/act_r.json`
