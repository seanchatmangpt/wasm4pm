# autoinstinct_vision — Autoinstinct Vision Perception

## 1. Identity & Lineage
Perceptual autoinstinct: symbolic scene interpretation from feature-vector inputs. BreedId `autoinstinct_vision`, module `src/breeds/autoinstinct_vision.rs`.

## 2. Algorithm
1. Parse scene features from `input.facts[key="pixel:<x>:<y>"]` = intensity string.
2. Compute region-level statistics: mean intensity per quadrant.
3. Apply symbolic classification rules from `input.rules`: each rule's `premise` contains `region=<quadrant>:intensity><threshold>` conditions.
4. Select highest-priority classification that fires (rule certainty as priority).

## 3. Input Contract
`input.facts[key="pixel:<x>:<y>"]`: intensity values as f32 strings (0–1). `input.rules`: classification rules. Optional `facts[key="width"]`, `facts[key="height"]`.

## 4. Output Contract
`selected` = classification label (rule conclusion). `confidence` = rule certainty. Facts `vision:region:<q>:mean_intensity` for each quadrant.

## 5. Trace & OCEL Lifecycle
`load-scene`(1,1) → `compute-regions`(1,1) → `classify`(1,*) → `select`(1,1). Report fitness 1.0.

## 6. Oracles
Bright top-left quadrant triggers `"object-detected"`. Dark scene triggers fallback. Quadrant mean values asserted in fixture.

## 7. Determinism & Bounds
BTreeMap pixel store; fixed quadrant partition at width/2, height/2.

## 8. Provenance
Fixture `tests/fixtures/papers/autoinstinct_vision.json` (synthetic 4x4 scene, bright top-left).
