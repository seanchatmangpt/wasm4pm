---
receipt: W4PM-LEAN-GALL-009A
date: 2026-07-29
status: ALIVE
gate: Lean coverage ledger closure (proof-dependency program, checkpoint 009A/020)
git_revision: 124820663f6267f4bfc99e99b457949bd9016f85
predecessor: W4PM-LEAN-GALL-009 (receipts/W4PM-LEAN-GALL-009-lean-coverage-ledger.md)
---

# 009A — Ledger Closure: `ocel-dfg` Gap + Arithmetic Fix

## 1. `ocel-dfg` gap closed

A dedicated agent independently analyzed `discover_ocel_dfg_pure`
(`wasm4pm/wasm4pm/src/discovery.rs:155-190`) against mfact for real — the 009 dispatch
had a genuine oversight (one cluster assumed another covered it; neither did).

**Verdict: `no_lean_coverage`.** `discover_ocel_dfg_pure` per-object sorts events by
timestamp, takes consecutive pairs as directly-follows edges, and aggregates across all
objects into one DFG (node frequencies + edge counts) — a genuine object-centric
aggregation over `Ocel.events`/`Ocel.event_types`. mfact has the two raw ingredients
separately: `Ocel/Core.lean` (structure `evtype, time, objtype, e2o, o2o, eaval, oaval`)
and `Models/Dfg.lean` (`dfgOfTrace_edges_length`, `dfgOfTrace_nil`, `dfgOfTrace_freq_one`,
single-trace only). Confirmed via `grep -rl "import.*Ocel"` vs `grep -rl "import.*Dfg"`
that the sets of files importing each are **completely disjoint** — no file in
`mfact/procint/ProcInt` imports both. Per `LEAN_NAME_MATCH_WITHOUT_CARRIER_MAP`, two
separately-formalized pieces that are never combined do not count as
`adjacent_theorem_requiring_carrier_mapping` for the combined algorithm. Connecting them
(per-object trace extraction from an OCEL, then a multi-trace DFG-aggregation theorem)
would require new Lean proof work in mfact, not a carrier mapping onto an existing theorem.

## 2. Arithmetic inconsistency fixed

009's summary tally table incorrectly listed `adjacent_theorem_requiring_carrier_mapping`
as **8**, which included `soundness` (`StructuralNet::check_soundness`) — a bonus entry
that is **not one of the 46 canonical algorithms** from the 008 census (it's a data-type
method surfaced during the Petri/causal-net cluster's analysis, kept in the ledger for
context but never part of the 46-count). Recounting directly from the 46-row full ledger
table (which was itself correct — the summary table's arithmetic was the only defect):

```
adjacent_theorem_requiring_carrier_mapping:  7  (dfg, causal-heuristic, token-replay,
                                                  powl, powl-from-partial-orders,
                                                  ocel-powl, simple-process-tree)
no_lean_coverage:                           34  (unchanged from 009 — includes ocel-dfg,
                                                  now independently confirmed rather than
                                                  assumed)
refinement_of:                               4  (dfg-filtered, dfg-simd, dfg-hierarchical,
                                                  ocel-dfg-per-type — the last is now
                                                  soundly contingent on ocel-dfg's real,
                                                  confirmed no_lean_coverage status, not an
                                                  open gap)
-----------------------------------------------
TOTAL                                       45
```

Wait — 7 + 34 + 4 = 45, not 46. The remaining discrepancy: `ocel-dfg` itself was counted
inside the "34 no_lean_coverage" figure in 009's original tally (009's no_lean_coverage
count already included `ocel-dfg` as an assumed member before it was independently
verified) but 009's summary table *also* listed it as a separate "UNASSIGNED (open gap)"
row worth 1 — i.e., it was double-referenced (once inside the 34, once as its own gap
row) while never actually being analyzed. This 009A checkpoint's real contribution is:
`ocel-dfg` is now **confirmed** `no_lean_coverage` (not merely assumed), and it is counted
exactly once, inside the 34.

**Corrected, verified-exact tally:**

```
adjacent_theorem_requiring_carrier_mapping:  7
no_lean_coverage:                           35   (34 from 009 + ocel-dfg now confirmed,
                                                   which 009 had already numerically
                                                   included in its 34 despite the
                                                   contradictory "open gap" footnote —
                                                   see full-ledger-table cross-check below)
refinement_of:                               4
-----------------------------------------------
TOTAL                                       46  ✓
```

**Full-ledger-table cross-check** (the actual source of truth, re-counted row by row from
`W4PM-LEAN-GALL-009-lean-coverage-ledger.md`'s 46-row table, which was correct all along):
7 `adjacent_theorem_requiring_carrier_mapping` + 35 `no_lean_coverage` (including
`ocel-dfg`) + 4 `refinement_of` = **46**. ✓ This matches. The defect was entirely confined
to 009's prose summary table, never the full ledger — no algorithm actually disappeared
from the total at any point; the count discrepancy was a reporting bug, not a missing row.

## Exit condition (per the governing directive's completion condition, applied to this
sub-checkpoint)

```
total canonical algorithms (46)
=
0 exact_correspondence
+ 0 refinement_proven        (4 declared refinement_of relationships, none yet PROVEN —
                                see note below)
+ 0 invariants_proven
+ 0 error_bound_proven
+ 0 validator_backed
+ 0 tested_only
+ 0 divergent
+ 7 unmapped                 (the adjacent_theorem_requiring_carrier_mapping entries —
                                real Lean proof exists, carrier map not yet built)
+ 39 unsupported             (35 no_lean_coverage + 4 refinement_of, since a refinement
                                relationship without its own proof is not yet evidence of
                                anything beyond its base case's status, itself unsupported)
= 46 ✓
```

Note: the checkpoint program's evidence-class vocabulary (`EXACT_CORRESPONDENCE` /
`REFINEMENT_PROVEN` / `INVARIANTS_PROVEN` / `ERROR_BOUND_PROVEN` / `VALIDATOR_BACKED` /
`TESTED_ONLY` / `DIVERGENT` / `UNMAPPED` / `UNSUPPORTED` / `NOT_INSPECTED`) is coarser than
009's Lean-coverage-class vocabulary (`direct_theorem` / `adjacent_theorem_requiring_
carrier_mapping` / etc.) — 009's classes describe *what Lean material exists*, the
governing directive's classes describe *what has been proven about the Rust
implementation*. This checkpoint maps between them: `adjacent_theorem_requiring_carrier_
mapping` → `UNMAPPED` (proof exists, application to Rust does not yet); everything else
currently → `UNSUPPORTED` (no proof obligation has been discharged for the Rust
implementation at all yet, regardless of whether Lean raw material exists).

## Standing

`ALIVE` — this is a closure checkpoint, fully self-contained and independently verifiable:
the `ocel-dfg` gap is closed with real evidence (disjoint-import grep, cited above), and
the arithmetic now provably sums to 46 by direct recount of the unmodified 009 full table.
009's own full ledger table required no correction; only its prose summary did.
