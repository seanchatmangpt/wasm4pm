# CSP AC-3

## Origin
- **Paper:** "Consistency in Networks of Relations" (Mackworth, 1977)
- **Authors:** Alan Mackworth
- **Tradition:** Constraint Satisfaction Problems, Arc Consistency, Backtracking Search

## Algorithm
Finite-domain Constraint Satisfaction is solved using the AC-3 algorithm for maintaining arc consistency combined with backtracking search. Minimum Remaining Values (MRV) is used as a variable ordering heuristic, and lexicographic value sorting is used for tie-breaking.
During backtrack search:
1. Select the unassigned variable with the fewest remaining values (lexicographic tiebreak).
2. For each value in the variable's sorted domain:
   - Check consistency with current assignments.
   - If consistent, assign the variable, and maintaining arc consistency (MAC) via AC-3 is run.
   - Recursively solve for remaining variables.
   - If search fails, backtrack and restore domains.

## Pseudocode
```
function solve(input):
    vars = parse_vars(input.facts)
    constraints = parse_constraints(input.facts)
    domains = {v: v.domain for v in vars}
    
    if not ac3(domains, constraints):
        return UNSAT
        
    assignments = {}
    if backtrack(assignments, domains, constraints):
        return SAT(assignments)
    return UNSAT

function ac3(domains, constraints):
    queue = all_arcs(constraints)
    while queue not empty:
        (x, y) = queue.pop()
        if revise(domains, x, y):
            if domains[x] is empty:
                return false
            for each neighbor z of x (z != y):
                queue.push((z, x))
    return true

function revise(domains, x, y):
    revised = false
    for each vx in domains[x]:
        if no vy in domains[y] satisfies constraint(x, y):
            remove vx from domains[x]
            revised = true
    return revised
```

## Input contract
- `intent`: not used
- `facts`: contains variables and constraints. Variable encoded as `csp-var` with value `"name:domain_value1,domain_value2,..."`. Constraint encoded as `csp-constraint` with value `"var1!=var2"` or `"var1==var2"`.
- `rules`: not used
- `goals`: not used
- `cases`: not used
- `state`: not used
- `candidates`: passed through unchanged

## Output contract
- `selected`: `"sat"` if satisfiable, otherwise `None`
- `explanation`: `"SAT: var1=val1, var2=val2, ..."` (sorted lexicographically) or `"UNSAT"`
- `inference_trace`: trace steps recording `"csp-init"`, `"csp-revise"`, `"csp-assign"`, `"csp-backtrack"`, `"csp-verdict"`

## Complexity
- Time: AC-3 time complexity is O(c * d^3) where c is constraint count and d is max domain size. Combined with backtracking, worst-case is exponential in variable count.
- Space: O(v * d + c) where v is variable count and c is constraint count.

## Generalization examples
- **Resource Allocation**: variables represent resources, domains represent timeslots, constraints enforce non-overlapping allocation (AllDiff or Inequality).
- **Process Step Assignment**: variables represent steps in a workflow, domains represent actors, constraints enforce separation of duties (e.g. `stepA != stepB`).

## Adversarial coverage
- Precondition rejects if variables exceed 24 or domain size exceeds 16.
- Empty variables array triggers a precondition error.
- Postcondition validates that the trace contains `csp-init` and `csp-verdict` steps.
