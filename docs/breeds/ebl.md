# EBL

## Origin
- **Paper:** "Explanation-Based Generalization: A Unifying View" (Machine Learning 1(1), 1986)
- **Authors:** Tom M. Mitchell, Richard M. Keller, Smadar T. Kedar-Cabelli
- **Tradition:** Analytic learning, explanation-based learning

## Algorithm
Three phases. Explain: SLD backward chaining (term unification with depth-suffixed variable renaming, depth ≤32) proves the training goal from facts + the domain theory, building a proof tree. Generalize: EGGS goal regression — every constant argument of the goal becomes a fresh `?targetN` variable (multi-argument goals included; audit defect EBL-3 fixed) and the proof's substitutions are replayed symbolically. Operationalize: the generalized proof's leaves become the premise of a new operational rule emitted as the `ebl:rule` fact. Anti-fraud postcondition: the learned rule must contain at least one variable.

## Pseudocode
```
function run(input):
    proof = explain(goal, rules, facts, 32)        // emit ebl-explain per node
    gen_goal = goal with all constant args → ?targetN
    leaves = generalize(proof, gen_goal)           // emit ebl-generalize per rule node
    rule = leaves.join(", ") + " => " + gen_head   // emit ebl-operationalize
    output fact ebl:rule
```

## Input contract
- facts: ground atoms in their KEYS (e.g. `weight(obj1,light)`)
- rules: `?var` arguments; goals[0] = training example (predicate is the atom when value=="true")

## Output contract
- fact `ebl:rule` = `"p1, p2 => head"` with ≥1 variable
- trace: `ebl-explain`(1,*) → `ebl-generalize`(1,*) → `ebl-operationalize`(1,1)

## Complexity
O(b^d) proof search, depth-capped at 32.

## Generalization examples
SafeToStack, cup/drinkable, macro-operator learning from single examples.

## Adversarial coverage
- Refusal: no goals, no domain theory, unprovable goal
- Hidden: the learned rule is EXECUTED as a domain rule through a second inference run on fresh objects never seen in training (audit defect EBL-1 fixed: no string-replacement simulation); real double-run determinism (EBL-2 fixed)
- Paper: Mitchell 1986 SafeToStack — learned rule fully variablized over training constants

## See also
- `prolog` lineage (SLD resolution) in the P0 cards
