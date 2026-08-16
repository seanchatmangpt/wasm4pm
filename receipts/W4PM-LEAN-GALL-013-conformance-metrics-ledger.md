---
receipt: W4PM-LEAN-GALL-013
date: 2026-07-29
status: ALIVE
gate: Conformance/fitness correspondence, split per-formula (proof-dependency program, checkpoint 013/020)
git_revision: 7a61ce95f
predecessor: W4PM-LEAN-GALL-012 (receipts/W4PM-LEAN-GALL-012-wf-net-soundness-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 013 — Conformance/Fitness Correspondence, Split Per-Formula

Per the governing program, "conformance and fitness" is not one algorithm — this checkpoint
covers the 5 metrics beyond token-replay fitness (already done by `W4PM-LEAN-GALL-010`, not
redone here): **precision, generalization, simplicity, alignment cost, aggregate verdict**.
Each gets its own evidence-class assignment, not one blended claim.

## Real Rust implementations found (all confirmed by direct source read)

- **Precision**: TWO different implementations exist. `align_etconformance.rs:44-129`
  `compute_align_etconformance_precision` computes a global model-transition-coverage ratio
  (`1 - escaping_edges/total_edges`), NOT the escaping-edges-per-observed-state formula its
  own docstring describes — that formula actually lives in `etconformance_precision.rs`
  (`PrecisionResult`, `total_escaping`/`total_consumed` fields). Both float-based,
  `.clamp(0,1)`-guarded.
- **Generalization**: `generalization.rs::compute_generalization` — occurrence-based
  frequency estimator, `1.0 - penalty_sum/visible_count`, NaN-guarded/clamped.
- **Simplicity**: **THREE distinct, mutually-inconsistent implementations** — a real naming
  collision, not previously documented: `complexity_metrics.rs::simplicity_arc_degree`
  (bipartite arc-degree ratio), `ilp_discovery.rs::compute_simplicity` (geometric mean of
  place/transition/arc ratios against a theoretical minimal net), and
  `benchmark.rs` (a third, log-based variant, `1/(1+ln(1+places+transitions+arcs))`).
- **Alignment cost**: `alignments.rs`'s A* search (lines ~183-232) — sync=0, log-move=1,
  model-move=1, invisible-model-move=0 — matches mfact's `Move.cost` textbook Adriansyah/
  Carmona model exactly, under the default cost configuration.
- **Aggregate verdict**: no canonical 4-way combination found. `benchmark.rs::
  compute_quality_metrics` computes a 2-way F1 (`2·fitness·precision/(fitness+precision)`,
  ignoring generalization/simplicity); `ensemble.rs` has a separate ad-hoc
  `fitness × (1 - complexity_penalty)` heuristic; `prediction_accuracy.rs::f1` is a third,
  near-identical F1 helper. None is canonical.

## Lean-side coverage (re-confirmed live, not cited from a stale prior finding)

Searched `mfact/procint/ProcInt` exhaustively — every `Conformance/*.lean` file read in full,
repo-wide grep for "precision"/"generalization"/"simplicity":

- **Precision, generalization, simplicity: `no_lean_coverage`, confirmed.** `Conformance/
  Quality.lean` has `QualityProfile.precision/generalization/simplicity : UnitRat` as
  **opaque struct fields never computed by any function** — no `def precision`, no
  `theorem precision_*`, anywhere. `QualityWalkthrough.lean` uses hardcoded example literals
  (`⟨9/10, by norm_num⟩` etc.) for these three, not derived values. This is a genuine gap,
  not a stale assumption — the prior audit round's negative finding stands, independently
  re-verified this checkpoint.
- **Alignment cost: real coverage.** `Conformance/Moves.lean::Move.cost` (`sync=>0,
  logOnly=>1, modelOnly=>1, silentModel=>0`) is proven, no `sorry`/`axiom` — confirmed by
  direct file read this checkpoint, along with `Move.cost_le_one`/`Move.cost_eq_zero_iff`
  and `Conformance/Alignment.lean`'s `alignmentCost`/`alignmentCost_append`/
  `alignmentCost_zero_iff_all_costfree`, also sorry/axiom-free.
- **Aggregate verdict: `no_lean_coverage`, unconditionally.** An aggregate combining metrics
  most of which have zero Lean coverage cannot itself have Lean coverage — not attempted.

## What was built: `wasm4pm/src/correspondence/alignment_cost.rs`

The one metric with both a real Rust implementation and a real, proven Lean counterpart.
Transcribes `Move.cost`'s literal case split as `lean_move_cost_exact`, and wasm4pm's actual
inline cost-assignment logic (`alignments.rs:183-232`, under the default cost config) as an
independently-written `rust_move_cost` — same discipline as 010/011/012 (each harness's
"Rust side" is an independent reference implementation, not a refactor of production code).

**A genuine bug was caught and fixed during this checkpoint's own test construction**: the
first version of `all_four_move_kinds_agree` compared an invisible model move against Lean's
`ModelOnly` constructor (cost 1) instead of `SilentModel` (cost 0) — Lean's `Move` type has
these as two *separate* inductive constructors, not one with a flag. `compare_move_cost` now
explicitly reclassifies `(ModelOnly, invisible=true)` to compare against `SilentModel`'s
cost, documented inline as the correction, not silently patched.

### Required falsifiers (7, mapped to this metric honestly — some N/A, stated as such)
1. **Zero denominator** — N/A to a cost mapping (no division anywhere in Move.cost); the
   empty-trace test below covers the adjacent "zero moves" case instead of forcing a
   division that doesn't exist in this formula.
2. **Empty trace** — `empty_trace_zero_moves_zero_cost`: 0 moves sum to 0 cost on both sides.
3. **Unreachable transition** — N/A to the cost *mapping* itself (a transition's
   reachability is an A*-search-level property, out of this checkpoint's stated scope);
   not force-fit.
4. **NaN/Infinity** — `no_nan_or_infinity_for_any_move_kind`: all 4 kinds produce finite costs.
5. **Rounding boundary** — `rounding_boundary_many_moves_stay_exact_integers`: 1000
   accumulated log-moves stay exactly `1000.0`, no f64 drift vs. the exact integer Lean sum.
6. **Overflow** — implicitly covered by the 1000-move accumulation test; not separately
   pushed to `u64`/`f64` boundary values, since Move.cost's range (0 or 1 per move) makes
   overflow only a large-count concern, already exercised.
7. **Reordered event sequence** — `reordered_move_sequence_per_move_cost_is_order_independent`:
   per-move cost is order-independent by construction (a classification of the move, not a
   function of trace position) — confirmed, not merely assumed.

Plus `wrong_cost_mapping_is_caught` (negative falsifier proving the differential has teeth)
and `lean_file_hash_matches_citation` (staleness detection).

## Full command output
```
running 7 tests
test correspondence::alignment_cost::tests::wrong_cost_mapping_is_caught ... ok
test correspondence::alignment_cost::tests::reordered_move_sequence_per_move_cost_is_order_independent ... ok
test correspondence::alignment_cost::tests::no_nan_or_infinity_for_any_move_kind ... ok
test correspondence::alignment_cost::tests::all_four_move_kinds_agree ... ok
test correspondence::alignment_cost::tests::rounding_boundary_many_moves_stay_exact_integers ... ok
test correspondence::alignment_cost::tests::empty_trace_zero_moves_zero_cost ... ok
test correspondence::alignment_cost::tests::lean_file_hash_matches_citation ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 952 filtered out; finished in 0.02s
```
Full crate-wide `cargo test`: **2253 passed, 0 failed** (up from 2246 pre-harness — the +7
new correspondence tests, no other change).

## Evidence classes achieved (per program vocabulary, all 5 metrics accounted for)

| Metric | Evidence class |
|---|---|
| Precision | `RUST_ALIVE / FORMALIZATION_UNSUPPORTED` — real, tested Rust implementation(s); zero Lean coverage |
| Generalization | `RUST_ALIVE / FORMALIZATION_UNSUPPORTED` |
| Simplicity | `RUST_ALIVE / FORMALIZATION_UNSUPPORTED` — plus a real naming-collision defect (3 inconsistent implementations) flagged for a future cleanup ticket, not fixed in this pass |
| Alignment cost | `carrier_mapped_formula_correspondence (finite-case-enumeration, cost-model scope only)` |
| Aggregate verdict | `RUST_ALIVE / FORMALIZATION_UNSUPPORTED` (unconditionally — no canonical implementation exists either, a second, independent reason) |

No metric was force-fit into a stronger class than the evidence supports; the 4/5 with no
Lean coverage are documented honestly as ledger entries, matching `W4PM-LEAN-GALL-009`'s own
`no_lean_coverage` discipline, not manufactured correspondence.

## Explicit scope boundary
This checkpoint does **not**: cover token-replay fitness (010's job); prove
`compute_trace_alignment`'s A* search finds a globally optimal alignment (a search-
correctness claim distinct from the cost-model claim made here); cover non-default cost
configurations; fix the 3-way simplicity naming collision or the 3-way F1/quality-score
inconsistency found on the Rust side (both flagged as new follow-up items, not addressed
here); or claim `direct_theorem`/`EXACT_CORRESPONDENCE` for alignment cost (no live Lean
re-verification, same constraint as every prior checkpoint).

## Live Re-verification (W4PM-LEAN-GALL-022)

Performed in `/Users/sac/mfact` (mfact `HEAD` = `cf5e047264ccd117b49c97b0effb392a5e478e6b`,
ahead of the `mfact_revision` cited above; `git log --oneline -- Conformance/Moves.lean`
confirms the most recent commit touching the file is still `801abf7933d` — no drift).

**Hash re-check** — `shasum -a 256 Conformance/Moves.lean`:
```
ab98579026f3e35450d92a2c8bd0034180149a19c1bb906ab7e31aec22237b0a  Conformance/Moves.lean
```
**MATCH** against `LEAN_MOVES_FILE_SHA256` in `wasm4pm/src/correspondence/alignment_cost.rs`.

**Build**:
```
$ cd /Users/sac/mfact/procint && lake build ProcInt.Conformance.Moves
✔ [8558/8558] Built ProcInt.Conformance.Moves (14s)
Build completed successfully (8558 jobs).
```

**Axiom check** — `#print axioms` on the two lemmas this checkpoint cites (`Move.cost_le_one`,
`Move.cost_eq_zero_iff`), via a scratch file removed after the run:
```
'ProcInt.Move.cost_le_one' depends on axioms: [propext]
'ProcInt.Move.cost_eq_zero_iff' depends on axioms: [propext]
```
Only `propext`, no `sorryAx`, no custom axiom. `grep -n sorry Conformance/Moves.lean` also
returns no match (exit 1).

**Standing upgrade rationale**: hash matched, build succeeded, no sorry/axiom found for the
one Lean file this checkpoint cites (`Moves.lean`). This closes the Lean-side re-verification
gap named in the prior `PARTIAL_ALIVE` standing for the **alignment-cost metric only** — the
scope this receipt's harness (`alignment_cost.rs`) actually targets.

**Unchanged, still out of scope**: the other 4 metrics (precision, generalization, simplicity,
aggregate verdict) remain `RUST_ALIVE / FORMALIZATION_UNSUPPORTED` unconditionally — no Lean
declarations exist for them (`Quality.lean`'s fields are still uncomputed struct fields, not
re-checked this round since there is nothing to build), so this re-verification pass does not
change their standing. `Conformance/Alignment.lean` (`alignmentCost`/`alignmentCost_append`/
`alignmentCost_zero_iff_all_costfree`), mentioned in the original 013 pass but not cited by a
hash constant in `alignment_cost.rs`, was **not** re-verified this round — out of the stated
FILES TO VERIFY scope for this checkpoint.

## Standing
`ALIVE` — for the alignment-cost metric specifically: hash-matched, kernel-rebuilt
(`lake build`, this session), and axiom-clean (`#print axioms`, only `propext`) for
`Conformance/Moves.lean`, per the Live Re-verification section above. The other 4 metrics'
standing (`RUST_ALIVE / FORMALIZATION_UNSUPPORTED`, unconditional `no_lean_coverage`) is
unaffected and unchanged by this pass.
