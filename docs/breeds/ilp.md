# ILP (FOIL)

## Origin
- **Paper:** "Learning logical definitions from relations" (1990, Machine Learning 5)
- **Authors:** J. Ross Quinlan
- **Tradition:** Inductive logic programming; top-down clause refinement

## Algorithm
FOIL grows one Horn clause at a time from the bare head `target(V0,…)`: candidate body literals (background predicates over existing variables plus at most one new variable) are scored by information gain `t·(log2(p1/(p1+n1)) − log2(p0/(p0+n0)))` over positive/negative binding tuples; the best literal (lex tie-break) is added until no negative binding survives. Covered positives are removed (cover-remove) and induction repeats until all positives are covered (≤8 clauses, body ≤4).

## Pseudocode
```
function run(input):
    parse pos:/neg:/bg: ground atoms        # trace load-example
    remaining = positives
    while remaining ≠ ∅:
        pos_b/neg_b = head-variable bindings; body = []
        while neg_b ≠ ∅ (body ≤ 4 else refuse):
            for candidate literal L:        # propose-literal, score-gain
                gain(L) = t·(I(after) − I(before))
            add argmax-gain literal          # add-literal; extend bindings
        remove covered positives             # cover-remove
        emit clause                          # emit-clause
    trace decision
```

## Input contract
- `facts`: `pos:<atom>`, `neg:<atom>` (single target predicate), `bg:<atom>` ground background atoms like `parent(ann,mary)`
- caps (refusals): ≤64 bg facts, ≤32 examples, body ≤4, ≤256 candidate literals per step, ≥1 pos and ≥1 bg

## Output contract
- `facts`: `ilp:rule:<i>` = clause text, e.g. `daughter(V0,V1) :- female(V0), parent(V1,V0)`
- `selected`: the first learned clause
- postcondition fraud guard: a learned clause must contain at least one variable
- `inference_trace`: `load-example`+ → {`propose-literal`,`score-gain`,`add-literal`,`cover-remove`,`emit-clause`}+ → `decision`

## Complexity
O(clauses × body × candidates × bindings × bg) — small by the declared caps.

## Generalization examples
Kinship relations (the paper's case), learning routing rules from labeled traffic examples, inducing access-control predicates from grant/deny examples.

## Adversarial coverage
- Refusal: no background knowledge; mixed target predicates; inseparable data at the body cap
- Hidden oracle: the clause learned on family A is applied by an independent in-test evaluator to disjoint family B (constants never in training) and must classify held-out examples correctly
- Paper fixture: Quinlan daughter/parent — learned body set-equal to {female(V0), parent(V1,V0)}

## See also
- `crates/wasm4pm-cognition/src/breeds/ilp.rs`
- OCPN: `ocel/models/l1/ilp.ocpn.json`; report: `ocel/reports/ilp.json`
