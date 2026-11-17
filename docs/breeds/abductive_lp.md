<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/abductive_lp.md; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, Surface-3 `alp:abducible:`/`alp:ic:`/`alp:observe`
grammar; size-then-lex delta enumeration over the LM closure; explain-accept/
explain-reject (non-minimal superset) -> minimal-set trace pinned.

# Abductive Logic Programming (ALP)

## Origin
- **Paper:** "Abductive Logic Programming" (Kakas, Kowalski, Toni, 1992)
- **Authors:** A.C. Kakas, R.A. Kowalski, F. Toni
- **Tradition:** Logic Programming, Abduction, Hypothesis Generation, Integrity Constraints

## Algorithm
ALP enumerates subsets Δ of the abducibles in size-then-lex order and keeps the
minimal explanations of the observation.
1. Parse `alp:abducible:<X>` facts (abducibles A), `alp:ic:<id>` facts
   (forbidden co-derivable atom sets) and rules with conclusion `"false"`
   (ICs as well). The goal `{predicate:"alp:observe"}` names the observation.
2. For each Δ ⊆ A (size-then-lex):
   - Superset of an already-accepted Δ -> `explain-reject` (non-minimal).
   - Compute the least model LM(P ∪ Δ) = Δ + context facts (values of
     non-`alp:` facts) + rule closure.
   - IC fires (all its atoms ∈ LM) -> `explain-reject` (IC violated).
   - Observation ∉ LM -> `explain-reject` (observation not derived).
   - Otherwise -> `explain-accept` and record Δ as a minimal explanation.
3. `minimal-set` closes with the accepted count.

## Pseudocode
```
function solve(input):
    accepted = []
    for each subset D of A (size-then-lex):
        if superset of some accepted: reject (non-minimal)
        LM = closure(D + context facts)
        if any IC fires over LM: reject
        elif obs not in LM: reject
        else: accept; accepted.push(D)
    return accepted
```

## Input contract
- `intent`: not used
- `facts`:
  - `alp:abducible:<X>` = `"true"` — abducible atom
  - `alp:ic:<id>` = `"atom1,atom2"` — forbidden co-derivable set
  - other fact values act as context atoms (e.g. `context` = `d`)
- `rules`: Horn rules; conclusion `"false"` = integrity constraint.
- `goals`: `{predicate: "alp:observe", value: "<obs>"}` — required.

## Output contract
- `facts`: `alp:explanation:<i>` = `"{a,b}"` (sorted, comma-joined, in
  discovery order) + `alp:explanation_count`.
- `selected`: first minimal explanation set string (`"{c}"`).
- `explanation`: `"KKT abduction: <N> minimal explanation(s) of '<obs>' over <M> abducibles."`
- `inference_trace`: `load-abducibles` (first) -> per-Δ `candidate-delta` ->
  `derive` -> `explain-accept`/`explain-reject` -> `minimal-set` (last).

## Refusals
- Empty rules (precondition, error mentions "rule").
- No `alp:observe` goal (precondition).
- More than 16 abducibles.

## Complexity
- Time: Exponential $O(2^A \cdot R)$ in abducible count $A$ (max 16) and rules $R$.
- Space: $O(A + R)$.

## Generalization examples
- **Diagnostic Root Cause Analysis**: Find the minimal set of faulty components (abducibles) that explain observed process errors without violating physical constraints.
- **Security Intrusion Attribution**: Find minimum-cardinality attack steps explaining audit logs.

## Adversarial coverage
- Size-then-lex enumeration guarantees the superset of an accepted Δ is
  enumerated AFTER the accepted singleton, so the non-minimal rejection is
  witnessed in the trace — a greedy cheat (AC-GREEDY) that accepts the first
  full set is killed by the oracle's exact `explain-accept` and
  non-minimal-rejection assertions.
