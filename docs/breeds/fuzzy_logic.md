# fuzzy_logic — Fuzzy Controller

## 1. Identity & Lineage
FUZZY_LOGIC (Mamdani & Assilian 1975, "An Experiment in Linguistic Synthesis with a Fuzzy Logic Controller", IJMMS 7(1)). Tradition: Fuzzy control, approximate reasoning. BreedId `fuzzy_logic`.

## 2. Algorithm
Mamdani inference: crisp inputs are fuzzified through triangular/trapezoidal membership functions. Rules fire with min t-norm over premise memberships. Consequent strengths aggregate with max. Each output variable is defuzzified by a 101-point discrete centroid over the union of its clipped terms.

## 3. Input Contract
facts `fuzzy:<var>:<term>` = `tri:a,b,c` | `trap:a,b,c,d`.
facts `fuzzy:input:<var>` = crisp value.

## 4. Output Contract
facts `fuzzy:output:<var>` — centroid value.

## 5. Trace & OCEL Lifecycle
`fuzzy-fuzzify`(1,*) → `fuzzy-fire`(1,*) → `fuzzy-aggregate`(1,*) → `fuzzy-defuzz`(1,1). Report fitness 1.0.

## 6. Oracles
Paper: Mamdani 1975 — hand-derived asymmetric discrete centroid 41.66667.
Adversarial: Term boundary logic, t-norm boundaries.

## 7. Determinism & Bounds
O(|terms| + |rules| + 101·|output terms|). All working sets use BTreeMap. Memberships round to 1e-5 for bit-stable float receipts.

## 8. Provenance
Fixture `tests/fixtures/papers/fuzzy_logic.json` (Mamdani 1975).
