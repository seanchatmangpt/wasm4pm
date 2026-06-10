# DEFAULT_LOGIC

## Origin
- **Paper:** "A Logic for Default Reasoning" (AIJ 13, 1980)
- **Authors:** Raymond Reiter
- **Tradition:** Nonmonotonic reasoning

## Algorithm
Semi-normal defaults over ground atoms: plain premises are prerequisites; `unless:<atom>` entries are justifications; `not_<atom>` conclusions encode negation. Defaults apply to fixpoint in a fixed specificity order — REAL prerequisite count descending (justifications excluded), certainty descending, lexicographic id — so specific rules fire before defaults and block them. After the fixpoint every fired rule's justifications are re-validated against the final extension; a late-derived violator refuses the run (documented deviation/guard for audit defect DL-1).

## Pseudocode
```
function run(input):
    extension = fact values; emit default-load
    sort rules by (prereq count desc, certainty desc, id)
    repeat until no change:
        for rule not fired/blocked:
            if prereqs ⊆ extension:
                if some unless:j with j ∈ extension: block (emit default-block)
                else: extension += conclusion (emit default-fire)
    re-validate fired justifications against final extension (else Err)
    emit default-extension (sorted atoms)
```

## Input contract
- facts: values are the initial atoms; ≥1 fact and ≥1 rule required
- rules: premise atoms + optional `unless:` justifications

## Output contract
- `selected` = sorted extension; facts `ext:<atom>`
- trace: `default-load`(1,1) → {`default-fire`,`default-block`}(1,*) → `default-extension`(1,1)

## Complexity
O(|rules|² × |premises|) for the fixpoint.

## Generalization examples
Taxonomic defaults with exceptions, policy rules with overrides.

## Adversarial coverage
- Refusal: empty rules / empty facts; no applicable rule
- Hidden: gronk/wibble/dark_wibble — specific rule blocks the default (extension has not_glows, block step present); without the dark chain the default fires
- Paper: Reiter 1980 Tweety — penguin blocks the birds-fly default

## See also
- `frames_inheritance.md` — default inheritance in the frame tradition
