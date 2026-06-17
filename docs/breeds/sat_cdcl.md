# SAT (CDCL)

## Origin
- **Paper:** "GRASP: a search algorithm for propositional satisfiability" (1999)
- **Authors:** João P. Marques-Silva, Karem A. Sakallah
- **Tradition:** Conflict-driven clause learning; modern SAT solving

## Algorithm
CDCL with naive-scan unit propagation, lowest-index positive-phase branching, GRASP/1-UIP conflict analysis (resolving the conflicting clause backwards along implication-trail antecedents until one current-level literal remains), and non-chronological backjumping to the second-highest level in the learned clause. Every `learn-clause` trace step carries a resolution certificate (`learned=`, `from=` antecedent clause indices, `pivots=` resolution variables) so oracles re-derive the learned clause independently.

## Pseudocode
```
function run(input):
    db = clauses from clause:<i> facts            # trace load-clause
    loop:
        propagate units (naive clause scan)        # trace propagate
        if conflict:
            if level == 0: return UNSAT
            cur = conflict clause
            while >1 literal of current level:
                resolve cur with reason of last-assigned such literal  # 1-UIP
            learn cur (+certificate)               # trace learn-clause
            backjump to 2nd-highest level; assert UIP   # trace backjump
        else if all vars assigned: return SAT
        else decide lowest unassigned var := true  # trace decide
```

## Input contract
- `facts`: `clause:<i>` with DIMACS-style values ("1 -2 3"); 1-based vars, negative = negated
- caps (refusals): ≤64 variables, ≤256 input clauses, no empty clause values, no literal 0

## Output contract
- `facts`: `learned:<i>` clauses; `model:<var>` assignments when SAT
- `selected`: "SAT" or "UNSAT"
- `inference_trace`: `load-clause`+ → {`decide`,`propagate`,`conflict`,`learn-clause`,`backjump`}+ → `decision`

## Complexity
Worst case exponential (SAT is NP-complete) but bounded by the 64-var/256-clause caps and a 100k-iteration search budget (refusal on exhaustion).

## Generalization examples
Pigeonhole infeasibility, dependency-conflict detection, configuration constraint checking.

## Adversarial coverage
- Refusal: empty formula; >64 vars; malformed literals
- Hidden oracle: PHP(3,2) UNSAT with ≥1 learned clause; each learned clause re-derived in the test by replaying the `from=`/`pivots=` resolution certificate and compared for equality
- Paper fixture: GRASP conflict analysis exercised on PHP(3,2)

## See also
- `crates/wasm4pm-cognition/src/breeds/sat_cdcl.rs`; types: `src/breeds/support/clauses.rs`
- OCPN: `ocel/models/l1/sat_cdcl.ocpn.json`; report: `ocel/reports/sat_cdcl.json`
