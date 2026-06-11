# autoinstinct_neurosis — Autoinstinct Neurosis Engine

## 1. Identity & Lineage
Adaptive autoinstinct: conflict-detection among active rules; generates introspective inhibition signals when incompatible conclusions compete. BreedId `autoinstinct_neurosis`, module `src/breeds/autoinstinct_neurosis.rs`.

## 2. Algorithm
1. Fire all rules whose premises match working memory.
2. Detect conflicts: rules with opposite-polarity conclusions to the same head (`conflict:` prefix).
3. Compute inhibition score = sum of conflicting certainties.
4. Emit `neurosis:conflict:<pair>` facts with inhibition magnitude.
5. Select the rule with the highest net certainty after conflict suppression.

## 3. Input Contract
`input.rules`: rules with `certainty`. `input.facts`: working memory. `facts[key="conflict:<ruleA>:<ruleB>"]`: explicit conflict declarations (optional; auto-detected by opposite conclusions).

## 4. Output Contract
`selected` = winning rule conclusion. `confidence` = net certainty after conflict. Facts `neurosis:conflict:<pair>:inhibition`.

## 5. Trace & OCEL Lifecycle
`fire-rules`(1,1) → `detect-conflict`(1,*) → `suppress`(1,*) → `select`(1,1). Report fitness 1.0.

## 6. Oracles
Two rules with equal certainty and opposite conclusions → inhibition 1.0 → both suppressed → error. Single uncontested rule → selected with original certainty.

## 7. Determinism & Bounds
BTreeMap conflict accumulation; conflict pair key sorted lex.

## 8. Provenance
Fixture `tests/fixtures/papers/autoinstinct_neurosis.json` (synthetic ambivalence scenario).
