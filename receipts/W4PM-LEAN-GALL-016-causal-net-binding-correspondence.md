---
receipt: W4PM-LEAN-GALL-016
date: 2026-07-29
status: PARTIAL_ALIVE
gate: causal-net binding semantics correspondence (proof-dependency program, checkpoint 016/020)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-015 (receipts/W4PM-LEAN-GALL-015-process-tree-semantics-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 016 — Causal-Net Binding Semantics Correspondence

## Ledger first, per 013's precedent: what this checkpoint found is mostly an honest gap

This checkpoint's stated minimal system — activity + input binding + output binding +
marking → enabled/refused → next marking — is **unsupported on both sides**, confirmed by
direct re-read of both codebases this checkpoint. A prior audit round's characterization of
`mfact`'s causal-net binding as having explicit AND/XOR obligation structure was an
overclaim; corrected here after re-reading `CausalNet.lean` directly.

### Claim 1 — binding-set structure (AND/XOR obligations over specific target sets)

- **Lean** (`mfact/procint/ProcInt/Models/CausalNet.lean`, `content_sha256`
  `a889f4d19f6e2314b810ca5315e06912278c974732e89686e4367158f66bcbe0`): `CausalBinding` is a
  plain `{ sources : List α, targets : List α }` pair. No AND/XOR discriminant, no
  satisfaction predicate over specific target subsets.
- **Rust** (`wasm4pm::advanced_algorithms::classify_heuristic_splits_joins`,
  `advanced_algorithms.rs:91-172`): produces only a single AND/XOR *string tag* per node —
  not a binding-set partition of which specific targets are jointly obligatory. Its output
  is never consumed downstream (confirmed sole caller is the wasm-bindgen entry point,
  which just serializes it to JSON).
- **Status**: `UNMAPPED`. No shared binding-set structure exists on either side to
  differentially test.

### Claim 2 — enabled/fire/step execution semantics for causal nets

- **Lean**: no enabled/fire/step relation exists anywhere in `CausalNet.lean` or its
  Playground walkthrough.
- **Rust**: no enabled/fire execution semantics exists for causal nets anywhere in the
  crate. Petri-net `enabled`/`fire` exists (`correspondence::petri_firing`, checkpoint 011)
  but nothing analogous exists for `CausalGraph`/`CausalRelation`.
- **Status**: `UNSUPPORTED ON BOTH SIDES` — a rarer finding type than every prior checkpoint
  in this program (010-015 each found one side ahead of the other; here, neither side has
  built this). All 8 required evidence items (exact finite binding enumeration, Lean
  predicate, Rust execution, exhaustive bounded-domain correspondence, missing-binding
  refusal, overlapping binding, duplicate activity, empty binding) are listed in the
  carrier map as `N/A` with a reason, not silently omitted.

### Claim 3 — the one thing this checkpoint DID build: `dependencyMeasure`'s own proven properties

`CausalNet.lean` proves real, non-`sorry`/non-`axiom` properties of
`dependencyMeasure(ab, ba) = (ab - ba) / (ab + ba + 1)`: strict bounds in `(-1,1)`
(`dependencyMeasure_lt_one`, `neg_one_lt_dependencyMeasure`), antisymmetry
(`dependencyMeasure_antisymm`), and self-zero (`dependencyMeasure_self`).

`wasm4pm/wasm4pm/src/correspondence/causal_dependency_measure.rs` independently
transcribes this exact formula (`dependency_measure_exact`, exact-integer rational
arithmetic, no floats in the comparison logic) and checks the same four properties hold
over `ab, ba ∈ [0, 50]` — an honest finite check, not a proof of the universally-quantified
ℕ statement.

**Explicit non-claim, stated up front so it cannot be misread later**: this does **not**
claim correspondence to `wasm4pm::causal_graph::CausalRelation.strength`. That field is a
different formula entirely — unsigned `usize` in `[0, 1000]`, with negative heuristic
measures explicitly clamped to `0.0` via `.max(0.0)` before scaling (confirmed by direct
read of `build_causal_heuristic`). Clamping a signed measure to zero before an affine
rescale destroys the antisymmetry `dependencyMeasure`'s own proof depends on — no honest
normalization step recovers it. This harness verifies the Lean-cited formula's own math
reproduces correctly in Rust; it says nothing about any wasm4pm production code path.

## Full command output
```
running 6 tests
test correspondence::causal_dependency_measure::tests::tampered_formula_without_plus_one_is_caught ... ok
test correspondence::causal_dependency_measure::tests::self_value_is_zero ... ok
test correspondence::causal_dependency_measure::tests::strictly_less_than_one_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::strictly_greater_than_neg_one_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::antisymmetric_exact_over_bounded_range ... ok
test correspondence::causal_dependency_measure::tests::lean_file_hash_matches_citation ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 995 filtered out; finished in 0.02s
```
Crate-scoped `cargo test --lib` (run from `wasm4pm/wasm4pm/`): 989 passed, 0 failed, 12
ignored (this scope excludes integration-test binaries counted in prior receipts' full
workspace totals — the +6 new correspondence tests are present and passing in this run;
an apples-to-apples workspace-wide before/after comparison is deferred to this checkpoint's
commit message once the full `cargo test` run in progress completes).

## Evidence class achieved

- Claims 1 and 2: `UNMAPPED` / `UNSUPPORTED ON BOTH SIDES` — genuine, source-confirmed
  absences, not defects to fix.
- Claim 3: `carrier_mapped_formula_correspondence (formula_property_reproduction_only,
  no_production_wiring_claimed)` — a new, narrower qualifier than any prior checkpoint's,
  reflecting that this harness verifies a cited formula's own proven properties in
  isolation, not a correspondence to any real wasm4pm execution path.

## Explicit scope boundary

This checkpoint does **not** cover: any binding-set or execution-semantics correspondence
(neither side has the structure to compare — see Claims 1–2); any claim that
`dependencyMeasure` corresponds to `CausalRelation.strength` (explicitly refused above);
live Lean re-verification (`mfact`'s `.lake` build directory remains empty, same constraint
as every prior harness in this program — citation is by content hash instead, with a
staleness-detection test).

## Standing

`PARTIAL_ALIVE` — two of three claims are honest ledger entries documenting a genuine gap,
not a correspondence; the third is real but deliberately narrow, isolated formula-property
evidence with an explicit non-claim about production wiring. Not `ALIVE` until either a
live `lake build` closes the Lean-side re-verification gap, or citation-by-hash is
explicitly accepted as sufficient standing evidence (same open condition as 010-015).
