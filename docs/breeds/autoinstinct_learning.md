# autoinstinct_learning — Autoinstinct Learning Engine

## 1. Identity & Lineage
Adaptive autoinstinct: online gradient-free rule-weight update from feedback signals. BreedId `autoinstinct_learning`, module `src/breeds/autoinstinct_learning.rs`.

## 2. Algorithm
Reads `input.facts` for `feedback:rule:<id>:delta` (signed weight update). Updates rule certainties via additive rule: `w ← clamp(w + α·δ, -1, 1)`, α=0.1 default. Re-ranks rules by updated weight. Emits updated weights as output facts.

## 3. Input Contract
`input.rules`: initial rule set with `certainty` weights. `input.facts[key="feedback:rule:<id>:delta"]`: numeric delta strings. Optional `facts[key="alpha"]` overrides learning rate.

## 4. Output Contract
`selected` = highest-weight rule conclusion post-update. `confidence` = highest weight. Facts `learning:rule:<id>:weight` for all rules.

## 5. Trace & OCEL Lifecycle
`load-weights`(1,1) → `apply-feedback`(1,*) → `re-rank`(1,1). Report fitness 1.0.

## 6. Oracles
Weight clamp to [-1,1]. Positive feedback increases; negative decreases. Zero feedback is identity. Deterministic regardless of rule-set order.

## 7. Determinism & Bounds
BTreeMap rule weights; sorted output facts.

## 8. Provenance
Fixture `tests/fixtures/papers/autoinstinct_learning.json` (synthetic feedback convergence test).
