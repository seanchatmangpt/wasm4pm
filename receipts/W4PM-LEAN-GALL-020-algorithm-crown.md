---
receipt: W4PM-LEAN-GALL-020
date: 2026-07-29
status: PARTIAL_ALIVE
gate: algorithm crown — closing tally (proof-dependency program, checkpoint 020/020, TERMINAL)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-019 (receipts/W4PM-LEAN-GALL-019-native-wasm-simd-refinement.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 020 — Algorithm Crown: Closing Tally

Terminal checkpoint of the 20-checkpoint program (008 census → 009/009A ledger → 010–019
per-domain correspondence). This receipt does not re-derive the 46-algorithm census or the
base Lean-coverage ledger — both are the source of record (`W4PM-LEAN-GALL-008`,
`-009`, `-009A`) and required no correction here. This checkpoint's job is the closed
invariant: account for every one of the 46 canonical algorithms exactly once, show which
ones moved as a direct result of checkpoints 010–019's real evidence, and show that none
silently disappeared from the total.

## Baseline (from `W4PM-LEAN-GALL-009A`, unchanged, re-verified by direct read this checkpoint)

```
7  adjacent_theorem_requiring_carrier_mapping  → mapped to UNMAPPED
35 no_lean_coverage                            → mapped to UNSUPPORTED
4  refinement_of:<base>                        → mapped to UNSUPPORTED
------------------------------------------------
46 total, 0 in any PROVEN tier
```

## Movement ledger: what checkpoints 010–019 actually changed within the 46

Of the 7 `UNMAPPED` (real Lean theorem exists, no carrier map built until this program):

| algorithm_id | checkpoint | outcome |
|---|---|---|
| `token-replay` | 010 | **advanced to VALIDATOR_BACKED** — real differential harness (`correspondence::token_replay`) against `TokenReplay.lean`'s `fitness`, curated + example-case evidence, 7 tests. |
| `simple-process-tree` | 015 | **advanced to VALIDATOR_BACKED, scope-restricted** — bridged to `ProcInt.ProcessTree` via a purpose-built binary `RestrictedTree` carrier, exhaustive 158-tree language equality — but explicitly excludes `Loop` (cyclic, deferred) and `Or` (confirmed dead code, no Lean counterpart). The *full* `simple-process-tree` claim (n-ary, Loop, Or) remains unaddressed; only the Seq/Xor/Par/binary/acyclic restriction is evidenced. |
| `dfg` | 017 | **unchanged (remains UNMAPPED)**, but its stated gap ("Lean model is single-trace, unweighted; Rust aggregates multi-trace with counts + start/end sets not modeled," 009 row 59) is now *partially* narrowed: checkpoint 017 built a real, bounded-property-checked harness for the single-trace restriction specifically (`dfgOfTrace` vs `discover_dfg_from_log` on a 1-trace log). The full multi-trace, weighted, start/end-set claim this row actually makes is still not evidenced — no reclassification of the row itself, noted as a documented sub-claim advance only. |
| `causal-heuristic` | 016 | **unchanged (remains UNMAPPED)** — 016 verified `dependencyMeasure`'s own proven properties (bounds, antisymmetry, self-zero) reproduce in Rust, but explicitly refused to claim correspondence to wasm4pm's real `CausalRelation.strength` field (different, unsigned, lossy-clamped formula that destroys the antisymmetry the Lean proof depends on). The row's actual claim — a discovery-level theorem connecting the score to edge selection — remains as unaddressed as 009 found it. |
| `powl` | 015 | **unchanged (remains UNMAPPED)** — 015 explicitly sidestepped `POWLBridge.lean`'s opaque `WorkflowSpace` carrier entirely rather than bridging it. |
| `powl-from-partial-orders` | 015 | **unchanged** — same sidestep; also still blocked by its own separate gap (Rust falls back to trace-based discovery, not yet a distinct partial-order algorithm). |
| `ocel-powl` | 015, 017 | **unchanged** — no Lean carrier for object-centric process trees was found by either checkpoint. |

Of the 39 `UNSUPPORTED` (35 `no_lean_coverage` + 4 `refinement_of`):

| algorithm_id | checkpoint | outcome |
|---|---|---|
| `dfg-simd` | 019 | **advanced to TESTED_ONLY** — 009's row 61 gap was "SIMD/scalar equivalence unverified." Checkpoint 019 re-ran 23 pre-existing tests confirming SIMD-path and scalar-path output equivalence within one compile target (`simd_streaming_dfg::tests::test_parity_with_scalar_dfg` et al.) — a real, empirical closure of that specific engineering gap. This is NOT a Lean proof of the `refinement_of:dfg` relationship (no such proof exists or was attempted), so the row advances to `TESTED_ONLY`, not any PROVEN tier. |
| `genetic-algorithm`, `pso`, `aco`, `heuristic-miner`, `inductive-miner`, `ilp-petri-net` | 018 | **unchanged (remain UNSUPPORTED)** — independently re-confirmed `no_lean_coverage` for all 6, no correction to 009's ledger needed. `aco` additionally received a real, test-verified defect fix (core-level degenerate-result guard) — an engineering improvement, not a reclassification, since Lean coverage remains absent. |
| all other 30 `no_lean_coverage` / 3 remaining `refinement_of` entries | — | **untouched this program** — not in scope for any of checkpoints 010–019; no claim is made about them beyond 009's original classification. |

## Recomputed closing tally

```
total canonical algorithms (46)
=
0  EXACT_CORRESPONDENCE
+ 0  REFINEMENT_PROVEN
+ 0  INVARIANTS_PROVEN
+ 0  ERROR_BOUND_PROVEN
+ 2  VALIDATOR_BACKED      (token-replay; simple-process-tree [scope-restricted])
+ 1  TESTED_ONLY           (dfg-simd)
+ 0  DIVERGENT
+ 5  UNMAPPED              (dfg, causal-heuristic, powl, powl-from-partial-orders, ocel-powl)
+ 38 UNSUPPORTED           (35 no_lean_coverage + 3 remaining refinement_of, unchanged)
= 46 ✓
```

No algorithm disappeared from the total: `2 + 1 + 5 + 38 = 46`, matching the 009A baseline's
`7 + 39 = 46` exactly, with 3 entries moved out of `UNMAPPED` (net −2, since 2 moved to
`VALIDATOR_BACKED` and stayed inside the accounted total) and 1 entry moved out of
`UNSUPPORTED` into `TESTED_ONLY`. Every movement above cites the specific checkpoint and
test evidence that caused it — none is asserted without a receipt to point to.

## Bonus entries (outside the 46 canonical count, per 009A's own precedent — tracked, not folded in)

009A already established that `soundness` is real work surfaced during this program but
never one of the 46 canonical discovery algorithms. This program's checkpoints added
several more bonus entries in the same category — genuine correspondence evidence for
Rust infrastructure/primitives that underlie multiple canonical algorithms, but that are
not themselves one of the 46:

| bonus entry | checkpoint | evidence class |
|---|---|---|
| `soundness` (`StructuralNet::check_soundness`) | 012 | `VALIDATOR_BACKED` (curated fixtures against `WfNet.lean`/`Soundness.lean`) |
| `petri-net-firing` (`enabled`/`fire`) | 011 | `VALIDATOR_BACKED` (exhaustive 118,098-triple bounded domain against `Petri/{Net,Firing}.lean`) |
| `alignment-cost` (`Move` cost, `alignments.rs`) | 013 | `VALIDATOR_BACKED` (against `Conformance/Moves.lean`; a genuine bug — `ModelOnly` vs `SilentModel` constructor conflation — was found and fixed as part of this harness) |
| `declare_conformance` (checking side) | 014 | advanced from `property_level_theorem` (009) to `VALIDATOR_BACKED` (30 tests, 6 evidence types per constraint template); this checkpoint also fixed a live silent-wrong-answer bug (task #8) in the same pure core the harness exercises |
| `ocel-lifecycle-ordering` (`validate_ocel_object_lifecycles`) | 017 | `VALIDATOR_BACKED` (curated fixtures against `OCEL.TimeOrdered`) |
| `causal-dependency-measure` (formula properties only, explicitly NOT `CausalRelation.strength`) | 016 | `VALIDATOR_BACKED (formula_property_reproduction_only)` — narrowest qualifier in the program, an explicit non-claim about production wiring |
| native/wasm32/SIMD compilation gates | 019 | verified `PASS` (cross-cutting infrastructure check, not a per-algorithm entry) |

These bonus entries are real, receipted achievements of this program but are correctly kept
outside the 46-total invariant, exactly as 009A treated `soundness` — counting them into the
46 would inflate the denominator with items the census never included.

## What this crown does NOT claim

- **No `EXACT_CORRESPONDENCE`, `REFINEMENT_PROVEN`, `INVARIANTS_PROVEN`, or
  `ERROR_BOUND_PROVEN` claim anywhere in this program.** Every advance is `VALIDATOR_BACKED`
  or `TESTED_ONLY` — differential evidence against a cited, hashed Lean source, never a live
  kernel-checked proof re-execution (mfact's `.lake` build directory has remained empty
  across all 10 correspondence checkpoints in this program — a standing, explicitly-stated
  constraint, not a new finding).
- **The 5 remaining `UNMAPPED` and 38 `UNSUPPORTED` entries are not "probably fine."** Each
  retains exactly the gap 009 originally found; this crown does not round any of them up.
- **Full native/wasm32 cross-target output equivalence is not established** (019's own
  explicit ledger entry) — only in-target SIMD/scalar equivalence and clean compilation on
  both targets.
- **Two pending non-checkpoint tasks remain open and unaddressed by this program**: task
  #27 (reconcile 3 inconsistent `simplicity` metric implementations) and task #28 (reconcile
  3 inconsistent aggregate quality-score/F1 implementations) — flagged in earlier checkpoints,
  never in scope for 010–020, still pending.

## Standing

`PARTIAL_ALIVE` — a real, source-cited, checkpoint-by-checkpoint-traceable closing tally.
Not `ALIVE` for the same standing reason every checkpoint in this program has stated: no
live Lean re-verification has occurred (citation is by content hash, with staleness-detection
tests, across all 10 correspondence harnesses built). This is the program's terminal
checkpoint per the original 20-checkpoint specification — closure of the algorithm crown
does not mean closure of the underlying Lean-verification gap, which remains exactly as
open as checkpoint 010 found it to be.
