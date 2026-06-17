# Default Logic

## Origin
- **Paper:** "A Logic for Default Reasoning" (Reiter, 1980)
- **Authors:** Raymond Reiter
- **Tradition:** Nonmonotonic Reasoning, Formal Logic, Knowledge Representation

## Algorithm
Default Logic computes nonmonotonic extensions closed under Reiter's normal default rules. Normal defaults have the form `A : B / B` (if A is known, and it is consistent to assume B, then infer B).
1. Initialize extension set from the input facts values.
2. Sort default rules by specificity: premise count descending, certainty factor descending, then lexicographical order.
3. Iteratively attempt to apply default rules:
   - For each rule, check if all premises are satisfied in the current extension.
   - For justification requirements (`unless:X`), check if `X` is absent in the current extension.
   - If premises match and justifications are consistent, add the conclusion to the extension.
   - If justification is violated, record default blocking.
4. Continue until a fixpoint is reached (no further rules can fire).

## Pseudocode
```
function run(input):
    extension = {f.value for f in input.facts}
    rules = sort_by_specificity(input.rules)
    
    loop:
        changed = false
        for each rule in rules:
            if premise_satisfied(rule, extension):
                if justification_violated(rule, extension):
                    record_blocking(rule)
                else:
                    extension.insert(rule.conclusion)
                    record_firing(rule)
                    changed = true
        if not changed:
            break
            
    return extension
```

## Input contract
- `intent`: not used
- `facts`: initial known facts; values are added directly to the starting extension.
- `rules`: Reiter normal default rules. Premises with `"unless:X"` represent justifications that must be consistent (i.e. `X` must be absent).
- `goals`: not used
- `cases`: not used
- `state`: not used
- `candidates`: passed through unchanged

## Output contract
- `selected`: comma-separated sorted list of facts in the final extension.
- `explanation`: `"DefaultLogic: extension finalized with N facts"`
- `inference_trace`: trace steps recording `"default-load"`, `"default-fire"`, `"default-block"`, and `"default-extension"`.

## Complexity
- Time: O(R^2 * P) where R is the number of rules and P is the average premise count.
- Space: O(F + R) where F is the number of facts and R is the number of rules.

## Generalization examples
- **Common-sense Reasoning**: default rules for birds flying (`bird : fly / fly`), blocked by specific non-flying birds (`penguin`).
- **Policy Enforcement**: default permissions (`employee : access / access`), blocked by specific revoked criteria (`on_probation`).

## Adversarial coverage
- Precondition rejects if rules list is empty.
- Postcondition validates that the trace contains `default-extension` step.
