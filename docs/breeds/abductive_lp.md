# Abductive Logic Programming (ALP)

## Origin
- **Paper:** "Abductive Logic Programming" (Kakas, Kowalski, Toni, 1992)
- **Authors:** A.C. Kakas, R.A. Kowalski, F. Toni
- **Tradition:** Logic Programming, Abduction, Hypothesis Generation, Integrity Constraints

## Algorithm
ALP finds minimal abductive explanations (subsets of abducible atoms) to satisfy query goals under integrity constraints.
1. Identify abducible atoms: either explicitly specified in facts, or derived as undefined atoms appearing only in premises.
2. Explore subsets of abducible atoms. For each subset (hypothesis):
   - Compute the least model of the rules $P \cup \text{hypothesis}$ by iterating rules to a fixpoint.
   - Verify that all goals in `input.goals` are satisfied by the model.
   - Verify that no integrity constraints are violated (rules with conclusion `"false"` must not fire).
3. Sort valid explanations by size (minimal first) and filter for minimality (no subset of an explanation can be a valid explanation).

## Pseudocode
```
function solve(input):
    abducibles = get_abducibles(input)
    explanations = []
    
    for each subset H of abducibles:
        model = ComputeLeastModel(input.rules, input.facts, H)
        if satisfies_goals(model, input.goals) and not violates_constraints(model, input.rules):
            explanations.push(H)
            
    minimal_explanations = filter_minimal(explanations)
    return minimal_explanations
```

## Input contract
- `intent`: not used
- `facts`: contains facts and optional abducible definitions (`key="abducible", value="atom"`).
- `rules`: rules with conclusion and premises; rules concluding `"false"` represent integrity constraints.
- `goals`: list of query goals to satisfy.

## Output contract
- `selected`: ID of candidate that is part of the best minimal explanation.
- `explanation`: `"ALP: generated <N> explanations. Best explanation: <best>"`
- `inference_trace`: trace steps recording `"alp-load"`, `"alp-abduce"`, and `"alp-hypothesis"`.

## Complexity
- Time: Exponential $O(2^A \cdot R)$ in abducible count $A$ (max 16) and rules $R$.
- Space: $O(A + R)$ to store states.

## Generalization examples
- **Diagnostic Root Cause Analysis**: Find the minimal set of faulty components (abducibles) that explain observed process errors (goals) without violating physical constraints.
- **Security Intrusion Attribution**: Find minimum-cardinality attack steps explaining audit logs.

## Adversarial coverage
- Precondition rejects if rules are empty or goals are empty.
- Enforces a limit of 16 abducibles to avoid state space explosion (returns BreedError if exceeded).
