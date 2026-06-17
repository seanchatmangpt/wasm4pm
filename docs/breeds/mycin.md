# mycin — Certainty Factor Expert System

## 1. Identity & Lineage
MYCIN (Shortliffe 1976, Stanford Heuristic Programming Project). Rule-based medical diagnosis using certainty factors (CF ∈ [-1,1]). BreedId `mycin`, module `src/breeds/production_rules.rs` (`pub struct Mycin`).

## 2. Algorithm
Forward-chaining CF propagation. Each rule fires if all `premise` atoms match `input.facts`. Fired CF combined via MYCIN disjunctive rule: `CF(A,B) = A + B(1−A)` (both positive), `A + B(1+A)` (both negative), `(A+B)/(1−min(|A|,|B|))` (mixed). Highest-CF conclusion selected (lex tiebreak).

## 3. Input Contract
`input.rules`: each rule has `premise: ["fact=value", ...]`, `conclusion: String`, `certainty: f32 ∈ [-1,1]`. `input.facts`: `Fact { key, value }` pairs representing working memory.

## 4. Output Contract
`selected` = highest-CF conclusion string. `confidence` = combined CF. Facts `mycin:conclusion:<id>:cf` emitted for all fired conclusions.

## 5. Trace & OCEL Lifecycle
`load-working-memory`(1,1) → `evaluate-rule`(1,*) → `combine-cf`(1,*) → `select-conclusion`(1,1). Report fitness 1.0.

## 6. Oracles
Paper: Shortliffe (1976) Table 3-1 bacteremia — two rules fire, CF=0.7 and CF=0.3, combined 0.79. Structural: no rules fire → error. CF bounds [-1,1] enforced by postconditions.

## 7. Determinism & Bounds
BTreeMap for CF accumulation; fixed-precision "%.4f" formatting. No floating-point ordering.

## 8. Provenance
Fixture `tests/fixtures/papers/mycin.json` (Shortliffe 1976 bacteremia network, Table 3-1). Support: `breeds::support::certainty::combine_cf`.
