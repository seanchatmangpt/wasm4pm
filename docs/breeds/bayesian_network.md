# BAYESIAN_NETWORK

## Origin
- **Paper:** "Probabilistic Reasoning in Intelligent Systems" (1988)
- **Authors:** Judea Pearl
- **Tradition:** Probabilistic graphical models, exact inference

## Algorithm
Exact boolean variable elimination: CPT facts become factors over node indices; evidence zeroes inconsistent factor rows; non-query, non-evidence variables are eliminated in reverse-topological order with lexicographic tie-breaks (product of relevant factors, then sum-out); the final factor is normalized over the query variable. d-separation queries use the Bayes-ball reachability algorithm (ancestors-of-observations precomputation, up/down visit states).

## Pseudocode
```
function run(input):
    parse cpt:X|P1,P2 facts (≤16 nodes, ≤4 parents) and evidence:X facts
    emit bn-load-cpt per CPT, bn-observe per evidence (BTreeMap order)
    if query == prob:X:
        build factors; reduce by evidence
        for u in reverse-topo (lex ties), u ∉ {query, evidence}:
            emit bn-eliminate; factors = sum_out(product(relevant), u)
        p = normalize(final factor over X); emit bn-verdict "prob:X=p" (9 dp)
    if query == dsep:A,B|O: Bayes-ball; emit bn-verdict "…=true|false"
```

## Input contract
- facts `cpt:X` = prior, `cpt:X|P1,P2` = P(X=t|parents) indexed by parent bits (first parent = high bit, index 0 = all false); `evidence:X` = true/false
- goal predicate `query`, value `prob:X` or `dsep:A,B|O1,O2`

## Output contract
- explanation / verdict detail `prob:X=0.ddddddddd`
- trace: `bn-load-cpt`(1,*) → `bn-observe`(0,*) → `bn-eliminate`(0,*) → `bn-verdict`(1,1)

## Complexity
O(2^w) in the induced width w; capped at 16 boolean nodes.

## Generalization examples
Diagnosis (alarm networks), sensor fusion, screening-off analyses.

## Adversarial coverage
- Refusal: no CPTs, no query, >16 nodes, >4 parents, malformed CPT lengths
- Hidden: fresh Q→R→S chain P(S)=0.328 to 1e-9; Markov blanket P(S|R=t)=0.7; collider d-sep flip under conditioning
- Paper: Pearl 1988 burglary P(B|j,m)=0.284171835 to 1e-6 (audit defect BN-2 fixed: published posterior asserted)

## See also
- `dempster_shafer.md`
