# CSP_AC3

## Origin
- **Paper:** "Consistency in Networks of Relations" (AIJ 8(1), 1977)
- **Authors:** Alan K. Mackworth
- **Tradition:** Constraint satisfaction, arc consistency

## Algorithm
Delegates to the proven `support::csp` solver: AC-3 runs the revise queue to fixpoint (domain wipeout ⇒ unsatisfiable); search uses backtracking with MRV variable selection (lexicographic tie-break), lexicographic value ordering, and MAC — full AC-3 re-propagation after every assignment. The solver records Init/Revise/Assign/Backtrack/Verdict events translated 1:1 into trace steps.

## Pseudocode
```
function run(input):
    build vars (csp-var facts) and binary constraints (csp-constraint)
    emit csp-init
    if !ac3(domains): verdict UNSAT
    backtrack: var = MRV-lex; for val in sorted(domain):
        if consistent: assign (emit csp-assign); MAC ac3 (emit csp-revise…)
        on failure: emit csp-backtrack
    emit csp-verdict; explanation "SAT: lex-sorted assignment" | "UNSAT"
```

## Input contract
- facts `csp-var` = `"Name:v1,v2"` (≤24 vars, domains ≤16)
- facts `csp-constraint` = `"X!=Y"` | `"X==Y"`

## Output contract
- explanation `SAT: V1=…, V2=…` (lex order) or `UNSAT`; facts `csp:assignment:<var>`
- trace: `csp-init`(1,1) → {`csp-revise`,`csp-assign`,`csp-backtrack`}(0,*) → `csp-verdict`(1,1)

## Complexity
AC-3 O(e·d³); search worst-case exponential, bounded by the 24/16 caps.

## Generalization examples
Graph coloring, scheduling, configuration with inequality/equality constraints.

## Adversarial coverage
- Refusal: >24 vars, domain >16, malformed var/constraint
- Hidden: K4-minus-edge 3-coloring exact lex-least V1=B,V2=G,V3=R,V4=R; K3/2-colors UNSAT with domain-wipeout revise steps
- Paper: Mackworth 1977 — inequality triangle, exact lex-least coloring

## See also
- `default_logic.md`
