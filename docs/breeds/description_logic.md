<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/breeds/description_logic.md; reason: path-local documentation retained pending domain-specific supersession -->

contract updated 2026-10-10, DL rewritten to Surface-3: `dl:subclass:`/`dl:conj:`/
`dl:exists_rhs:`/`dl:exists_lhs:` axioms + `dl:subsumes` goals; EL completion rules
CR1-CR4 to fixpoint with via-clause attribution; per-goal `classify-verdict`.

# Description Logic (DL)

## Origin
- **Paper:** "The Description Logic Handbook" (Baader et al., 2003)
- **Authors:** Franz Baader et al.
- **Tradition:** Ontological Reasoning, Semantic Web, TBox Subsumption (EL)

## Algorithm
EL description-logic classification over the TBox, via the standard completion
rules CR1-CR4 (Baader et al. 2003, EL section).
1. Parse `dl:` axioms from facts: `dl:subclass:A` = `B` (A ⊑ B),
   `dl:conj:<A1>+<A2>` = `B` (A1 ⊓ A2 ⊑ B), `dl:exists_rhs:A` = `r.B`
   (A ⊑ ∃r.B), `dl:exists_lhs:r.A` = `B` (∃r.A ⊑ B).
2. `normalize` opens the trace with concept/axiom counts.
3. Initialize subsumer sets S(A) reflexive-closed ({A} ⊆ S(A)).
4. Applied subclass axioms emit `apply-cr1` steps in input order.
5. To fixpoint, apply:
   - CR1: A ⊑ B, B ⊑ C ⇒ A ⊑ C — detail names the premise: `{A} ⊑ {C} (via {B} ⊑ {C})`.
   - CR2: A1,A2 ∈ S(C), A1⊓A2 ⊑ B ⇒ C ⊑ B — detail `(via {A1} ⊓ {A2})`.
   - CR3: A ⊑ ∃r.B ⇒ ({A},{B}) ∈ R(r) — detail `({A},{B}) ∈ R({r})`.
   - CR4: ∃r.A ⊑ B, ({C},{A}) ∈ R(r) ⇒ C ⊑ B — detail `(via ∃{r}.{A})`.
   Each rule batch is sorted+deduped before emission (deterministic order).
6. `fixpoint` reports saturated subsumption/role-edge totals.
7. Per goal (`dl:subsumes`, value `"A:B"`, sorted), a `classify-verdict` step
   emits `dl:verdict:A:B` = `true`/`false` (B ∈ S(A)).

## Pseudocode
```
function solve(input):
    axioms = parse(input.facts)          // dl:* grammar
    S = {C: {C} for each concept C}      // reflexive
    repeat until no change:
        CR1: A in S(B), C in S(B), C not in S(A) -> S(A) += C
        CR2: A1,A2 in S(C), conj(A1,A2,B) -> S(C) += B
        CR3: exists_rhs(A,r,B) and edge absent -> edges += (A,r,B)
        CR4: exists_lhs(r,A,B), (C,r,A) in edges, B not in S(C) -> S(C) += B
    for each query A:B: verdict = B in S(A)
```

## Input contract
- `intent`: not used
- `facts` (all `dl:`-prefixed keys; non-`dl:` facts are ignored):
  - `dl:subclass:<A>` = `<B>` — A ⊑ B
  - `dl:conj:<A1>+<A2>` = `<B>` — A1 ⊓ A2 ⊑ B (malformed key without `+` is a refusal)
  - `dl:exists_rhs:<A>` = `<r>.<B>` — A ⊑ ∃r.B (value without `.` is a refusal)
  - `dl:exists_lhs:<r>.<A>` = `<B>` — ∃r.A ⊑ B (key without `.` is a refusal)
- `goals`: `{predicate: "dl:subsumes", value: "<A>:<B>"}` — at least one required;
  goal value without `:` is a refusal.

## Output contract
- `facts`: one `dl:verdict:<A>:<B>` = `"true"|"false"` per goal (goals sorted).
- `selected`: first goal rendered `"{A}⊑{B}={verdict}"`.
- `explanation`: `"EL completion (CR1–CR4) to fixpoint over <N> concepts; verdicts: ..."`
- `inference_trace`: `normalize` (first) -> `apply-cr1`/`apply-cr2`/`apply-cr3`/
  `apply-cr4`* -> `fixpoint` -> `classify-verdict`* (fixpoint precedes verdicts).

## Refusals
- Empty facts (precondition).
- Zero `dl:*` axioms (only unrelated facts).
- No `dl:subsumes` goals (or goals exist but none are `dl:subsumes`).
- Malformed keys/values: `dl:conj` without `+`, `dl:exists_rhs` value without
  `.`, `dl:exists_lhs` key without `.`, goal value without `:`.
- More than 32 distinct concepts.

## Complexity
- Time: polynomial in concept count C (capped at 32): each fixpoint pass is
  bounded by |S| x axioms; passes are monotone (sets only grow), so termination
  in O(C) passes worst case.
- Space: $O(C^2)$ for subsumer sets + $O(C^2)$ role edges.

## Generalization examples
- **Workflow Compliance Auditing**: classify activity types against a compliance
  TBox (subclass + existential role axioms) and query subsumption verdicts.
- **Data Model Ontologies**: classify schema concepts through conjunction and
  role-restriction axioms to a saturated completion.

## Adversarial coverage
- Precondition rejects an empty knowledge base; zero-`dl:`-axiom and zero-goal
  inputs are typed refusals.
- Per-goal verdicts are pinned exactly by the oracle (`t_Cat ⊑ t_Animal : true`
  and reverse `false`), killing a cheat that answers "true" unconditionally.
- Reflexive-counted fixpoint (S includes self) is asserted in the `fixpoint`
  detail; malformed-key refusals are the documented U4 refusal corpus.
