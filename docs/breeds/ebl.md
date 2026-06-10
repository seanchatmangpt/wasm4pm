# Explanation-Based Learning (EBL)

## Origin
- **Paper:** "Explanation-Based Generalization: A Unifying View" (Mitchell, Keller & Kedar-Cabelli, 1986)
- **Authors:** Tom M. Mitchell, Richard M. Keller, Smadar T. Kedar-Cabelli
- **Tradition:** Machine Learning, Generalization, Analytical Learning, Prolog Lineage

## Algorithm
Explanation-Based Learning learns a generalized rule from a single training example and domain theory.
1. **Explain:** Perform SLD backward chaining to prove the training example goal using the domain rules and training facts, up to a maximum depth (32). Construct a proof tree of the derivation.
2. **Generalize:** Regress the generalized target concept (replacing constants with variables) back through the proof tree. For each node in the tree:
   - Unify the generalized subgoal with the rule conclusion.
   - Propagate the resulting substitutions down to the subgoals (premises).
3. **Operationalize:** Extract the leaves of the generalized proof tree (which represent operational predicates) and combine them as premises to form a new operational rule:
   `Leaf1, Leaf2, ... => Generalized_Concept`.
4. Return the new rule as a discovered fact `ebl:rule`.

## Pseudocode
```
function run(input):
    goal = parse_goal(input.goals[0])
    proof_tree = prove(goal, input.rules, input.facts)
    if proof_tree is null:
        return Err("explain phase failed")
        
    gen_goal = generalize_concept(goal)
    leaves = regress(proof_tree, gen_goal)
    
    new_rule = join(leaves) + " => " + gen_goal
    return new_rule
```

## Input contract
- `intent`: not used
- `facts`: contains training example facts.
- `rules`: represents the domain theory.
- `goals`: first goal is the training example to explain.
- `cases`: not used
- `state`: not used
- `candidates`: passed through unchanged

## Output contract
- `selected`: newly learned operationalized rule.
- `explanation`: `"EBL operationalized a new rule"`
- `facts`: contains original facts plus `ebl:rule` showing the generalized rule.
- `inference_trace`: trace steps recording `"ebl-explain"`, `"ebl-generalize"`, and `"ebl-operationalize"`.

## Complexity
- Time: $O(D \cdot R \cdot U)$ where $D$ is the proof depth, $R$ is the number of rules, and $U$ is the cost of unification.
- Space: $O(P)$ where $P$ is the size of the proof tree.

## Generalization examples
- **Safe State Learning**: Deriving generalized safety rules from a single crash trace by regressing hazard conditions to structural root causes.
- **Workflow Optimization**: Generalizing a specific order-processing sequence to a reusable generic template.

## Adversarial coverage
- Precondition rejects if goals or rules (domain theory) are empty.
- Postcondition validates that `ebl:rule` is produced with variables, and trace contains `ebl-explain`, `ebl-generalize`, and `ebl-operationalize` steps.
