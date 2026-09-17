<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/breeds/autoinstinct_neurosis.md; source-sha256: a3dfda8925196f2c6a9528f981d475b9ca79737aaaaaa58de32082950a97fb67; reason: tooling or agent control surface -->

# autoinstinct_neurosis — Autoinstinct Neurosis Engine

## 1. Identity & Lineage
Adaptive autoinstinct: conflict-detection among active rules; generates introspective inhibition signals when incompatible conclusions compete, in the tradition of Colby's PARRY and Abelson's ideology machines (Colby, Weber & Hilf 1971, "Artificial Paranoia," per this module's own doc comment). BreedId `autoinstinct_neurosis`, module `src/breeds/autoinstinct_neurosis.rs`.

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
Fixture `tests/fixtures/papers/autoinstinct_neurosis.json` (synthetic ambivalence scenario, citing Colby, Weber & Hilf 1971 "Artificial Paranoia" -- the real primary source this module's own doc comment names, not Boden 1977, which is a secondary survey of the same work).
