# Answer Set Programming (ASP)

## Origin
- **Paper:** "The Stable Model Semantics for Logic Programming" (Gelfond & Lifschitz, 1988)
- **Authors:** Michael Gelfond, Vladimir Lifschitz
- **Tradition:** Logic Programming, Stable Models Semantics, Negation as Failure (NAF)

## Algorithm
The Answer Set Programming breed computes stable models of a logic program over a finite domain of atoms using the Gelfond-Lifschitz reduct.
1. Gather all unique atoms appearing in the logic program rules, facts, and candidates.
2. For each possible interpretation (subset of all atoms):
   - Compute the Gelfond-Lifschitz reduct $P^I$ of the logic program with respect to the interpretation $I$:
     - For each rule, if a premise has `"not atom"` and `atom` $\in I$, discard the rule.
     - Otherwise, keep the rule with the remaining positive premises.
   - Compute the unique least model of the positive reduct logic program $P^I$ by iterating to a fixpoint.
   - If the least model is exactly equal to the interpretation $I$, then $I$ is a stable model (answer set).

## Pseudocode
```
function solve(input):
    atoms = gather_atoms(input)
    stable_models = []
    
    for each interpretation I in power_set(atoms):
        reduct_rules = GelfondLifschitzReduct(input.rules, I)
        least_model = ComputeLeastModel(reduct_rules, input.facts)
        if I == least_model:
            stable_models.push(I)
            
    return stable_models
```

## Input contract
- `intent`: not used
- `facts`: list of facts acting as ground atoms.
- `rules`: rules containing a `conclusion` and a list of premises. Negation as failure (NAF) is supported using the `"not "` prefix in premises.
- `goals`: not used
- `candidates`: candidate structures whose IDs are collected as atoms and scored if they are in the selected stable model.

## Output contract
- `selected`: ID of candidate that is included in the first stable model, if any.
- `explanation`: `"ASP: found <N> stable model(s). Selected candidate: <id>"`
- `inference_trace`: trace steps recording `"asp-load"`, `"asp-solve"`, and `"asp-model"`.

## Complexity
- Time: Exponential $O(2^A \cdot R)$ in the number of unique atoms $A$ (max 16) and rules $R$.
- Space: $O(A + R)$ to store interpretations and reduct rules.

## Generalization examples
- **Process Configuration Rules**: Check if a selected set of process variants satisfies negation-as-failure configuration constraints.
- **Workflow Resource Constraints**: Enforce mutually exclusive role assignments via stable model rules.

## Adversarial coverage
- Precondition rejects if rules and facts are both empty.
- Limit of 16 atoms is enforced to prevent state explosion; more than 16 atoms returns a BreedError.
