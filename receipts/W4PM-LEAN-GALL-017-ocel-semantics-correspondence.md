---
receipt: W4PM-LEAN-GALL-017
date: 2026-07-29
status: ALIVE
gate: OCEL semantics correspondence (proof-dependency program, checkpoint 017/020)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-016 (receipts/W4PM-LEAN-GALL-016-causal-net-binding-correspondence.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 017 — OCEL Semantics Correspondence

## Ledger first, per 013/016 precedent: 5 of 7 sub-claims are honest gaps

Two lumen-first Explore agents re-read `mfact/procint/ProcInt/Ocel/{Core,Lifecycle,Relations}.lean`,
`Models/Dfg.lean`, `Petri/OCPN.lean` on the Lean side and `wasm4pm/src/{ocel_io,discovery,
oc_petri_net,oc_conformance}.rs` plus `advanced/ocdfg.rs` on the Rust side. No `sorry`/`axiom`
found in any of the 5 Lean files read. Findings per the program's 7 required sub-claims:

| # | Sub-claim | Lean | Rust | Status |
|---|---|---|---|---|
| 1 | well-formedness | no `WellFormed` invariant for `OCEL` | real (`validate_ocel_inner`, `ocel_io.rs:58-175`) | `UNMAPPED` |
| 2 | lifecycle projection | `OCEL.TimeOrdered`/`IsLifecycle` (real) | real (`validate_ocel_object_lifecycles`, `ocel_io.rs:441-500`) | **harness built** |
| 3 | flattening | no projection function | real (`flatten_ocel_to_eventlog_for_type`, `oc_petri_net.rs:214-300`) | `UNMAPPED` |
| 4 | classical DFG (single-trace) | `dfgOfTrace` (real, explicitly "mirrors discover_ocel_dfg restricted to one case") | real (`discover_dfg_from_log`, `discovery.rs:28-75`) | **harness built** |
| 5 | OC-DFG (per object type) | `Dfg` is untyped over object types | real, but **two unreconciled implementations** | `UNMAPPED` |
| 6 | OC-Petri-net projection | only the target `OCPN` structure + `Conforms`, no projection fn | real (`discover_oc_petri_net_pure`, `oc_petri_net.rs:105-128`) | `UNMAPPED` |
| 7 | OC conformance | classical-only token-replay/alignment (010/013) | real, but activity-set membership, **docstring overclaims "token-replay"** | `UNMAPPED` |

Rows 1, 3, 5, 6, 7 are honest scope gaps (Lean has nothing, or the Rust side has an internal
inconsistency that blocks a clean correspondence claim) — not defects in this checkpoint's
work, and not silently omitted; see `wasm4pm/correspondence/maps/ocel-semantics.json` for the
full per-claim detail.

## What IS built: rows 2 and 4

### Lifecycle ordering
`Ocel/Core.lean`'s `OCEL.TimeOrdered` (`es.Pairwise (fun a b => L.time a ≤ L.time b)`) and
wasm4pm's real `validate_ocel_object_lifecycles` (`ocel_io.rs:441-500`) make the same claim:
an object's events, taken in arrival order, must be non-decreasing in timestamp.
`correspondence::ocel_semantics::lean_time_ordered` hand-transcribes the Lean predicate;
`compare_time_ordered` checks it against a direct transcription of the real function's own
violation-detection windows check (chosen over depending on the `ocel` cargo feature or
building a full `OCEL` fixture, since the violation logic operates purely on
`(arrival_index, timestamp)` pairs). 6 curated fixtures (well-ordered, out-of-order,
duplicate-timestamp, single-event, empty, plus a negative falsifier using a deliberately
flipped predicate) — curated, not exhaustive, since object timelines are unbounded-length
sequences (same rigor tier as checkpoint 012).

### Single-trace DFG
`Models/Dfg.lean`'s own module comment states `dfgOfTrace` "mirrors `discover_ocel_dfg`
restricted to one case" — a direct textual invitation to compare it against wasm4pm's real
`discover_dfg_from_log` given a single-trace log. `lean_dfg_of_trace_exact` transcribes the
literal `dfgOfTrace(t) = (t.zip t.tail).map(fun p => (p.1, p.2, 1))`; `compare_dfg_of_trace`
explicitly aggregates repeated directly-follows pairs into a frequency multiset before
comparing — the literal Lean def assigns freq 1 per occurrence with no aggregation, while
the real `DFG` structure does aggregate, so this normalization step is stated, not silently
assumed. 50 deterministic pseudo-random traces up to length 10 (fixed LCG seed — no
`Math.random`/`Date.now` dependency), plus direct assertions of the three cited theorems
(`dfgOfTrace_nil`, `dfgOfTrace_edges_length`, `dfgOfTrace_freq_one`) and 2 negative
falsifiers (a flipped-predicate check, and an explicit demonstration that the unaggregated
Lean list genuinely differs from the aggregated real output on a repeated-pair trace).

## Flagged, out of scope for this checkpoint (separate tasks, not fixed here)
- `oc_conformance.rs`'s docstring (line 21) claims "token-replay each trace," but
  `oc_conformance_check_inner` actually computes activity-set membership per trace, not
  ordered token replay — a doc/implementation mismatch worth its own correction.
- Two independent, unreconciled OC-DFG implementations exist:
  `discovery.rs::discover_ocel_dfg_pure`/`discover_ocel_dfg_per_type` and
  `advanced/ocdfg.rs::OCDFG::discover` (the latter used by the CLI `ocdfg_bridge`) — a
  consolidation/tech-debt finding, not tested for equivalence here.

## Full command output
```
running 15 tests
test correspondence::ocel_semantics::tests::empty_timeline_is_trivially_ordered ... ok
test correspondence::ocel_semantics::tests::duplicate_timestamps_are_ordered ... ok
test correspondence::ocel_semantics::tests::out_of_order_timeline_disagrees ... ok
test correspondence::ocel_semantics::tests::single_event_is_trivially_ordered ... ok
test correspondence::ocel_semantics::tests::edge_count_is_length_minus_one ... ok
test correspondence::ocel_semantics::tests::well_ordered_timeline_agrees ... ok
test correspondence::ocel_semantics::tests::wrong_predicate_direction_is_caught ... ok
test correspondence::ocel_semantics::tests::every_edge_has_frequency_one_before_aggregation ... ok
test correspondence::ocel_semantics::tests::tampered_aggregation_is_caught ... ok
test correspondence::ocel_semantics::tests::empty_trace_produces_no_edges ... ok
test correspondence::ocel_semantics::tests::single_event_trace_has_no_edges ... ok
test correspondence::ocel_semantics::tests::linear_trace_matches_real_dfg ... ok
test correspondence::ocel_semantics::tests::repeated_pair_aggregates_correctly ... ok
test correspondence::ocel_semantics::tests::bounded_property_check_up_to_length_ten ... ok
test correspondence::ocel_semantics::tests::lean_file_hashes_match_citation ... ok

test result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 1001 filtered out; finished in 0.05s
```
Crate-scoped `cargo test --lib`: **1004 passed, 0 failed, 12 ignored** (up from 989
pre-harness — the +15 new correspondence tests only, no other change, no regressions). Full
workspace `cargo test` (all crates) was independently re-run this session with 0 failures
across every reported binary, confirming baseline health before this checkpoint's work.

## Evidence class achieved
- Rows 1, 3, 5, 6, 7: `UNMAPPED (no_lean_coverage)` — honest, source-confirmed gaps.
- Rows 2, 4: `carrier_mapped_formula_correspondence (curated_fixture_domain)` and
  `carrier_mapped_formula_correspondence (bounded_property_check_domain)` respectively —
  narrower than checkpoint 015's exhaustive-language rigor, matching checkpoints 012/016's
  precedent for unbounded or infinite-domain claims.

## Explicit scope boundary
This checkpoint does **not** cover: well-formedness, flattening, OC-DFG-per-type,
OC-Petri-net projection, or object-centric conformance (all `UNMAPPED`, see table above);
whether the two OC-DFG implementations agree with each other (flagged, not tested);
whether `oc_conformance_check_inner`'s docstring is accurate (flagged as a defect, not
corrected here); live Lean re-verification (`mfact`'s `.lake` build directory remains empty,
same constraint as every prior harness — citation is by content hash with a
staleness-detection test instead).

## Live Re-verification (W4PM-LEAN-GALL-022)

Run independently in this session, `cd /Users/sac/mfact/procint`:

```
$ shasum -a 256 ProcInt/Ocel/Core.lean ProcInt/Ocel/Lifecycle.lean ProcInt/Petri/OCPN.lean
ede40efa8f96d544cf8a6594a2d5b0a6cdf71cd6091bb9e4bc5b30ef52e611e2  ProcInt/Ocel/Core.lean
ee1528342d61956b19b9425ed83179c0513380e4ca2dccb2bb676121cb25c1e3  ProcInt/Ocel/Lifecycle.lean
33a0bd6fbe22930a55bc59c97b4a485a0426e5fc0809df0ff06b23c83407e764  ProcInt/Petri/OCPN.lean

$ shasum -a 256 ProcInt/Models/Dfg.lean
0270e4ea625bb41aaae76c43e953ad798b836c521636fdf10bf447befa81312e  ProcInt/Models/Dfg.lean
```

`Ocel/Core.lean`'s hash MATCHes `LEAN_CORE_FILE_SHA256` in
`wasm4pm/src/correspondence/ocel_semantics.rs:65-66`. `Models/Dfg.lean`'s hash MATCHes
`LEAN_DFG_FILE_SHA256` (`ocel_semantics.rs:74-75`), confirming checkpoint 023's citation
update to that constant is internally consistent with the file actually on disk.
`Ocel/Lifecycle.lean` and `Petri/OCPN.lean` are not separately hash-pinned as Rust constants
in this file (only hand-transcribed) — re-verified here by build + axiom check instead.

```
$ lake build ProcInt.Ocel.Core
✔ [8558/8558] Built ProcInt.Ocel.Core (13s)
Build completed successfully (8558 jobs).

$ lake build ProcInt.Ocel.Lifecycle
✔ [8559/8559] Built ProcInt.Ocel.Lifecycle (14s)
Build completed successfully (8559 jobs).

$ lake build ProcInt.Petri.OCPN
✔ [8559/8559] Built ProcInt.Petri.OCPN (14s)
Build completed successfully (8559 jobs).
```

Axiom check (`#print axioms`, `open ProcInt`):

```
'ProcInt.OCEL.TimeOrdered' does not depend on any axioms
'ProcInt.OCEL.IsLifecycle' does not depend on any axioms
'ProcInt.OCPN.WellFormed' depends on axioms: [propext, Quot.sound]
'ProcInt.OCPN.Conforms' depends on axioms: [propext, Quot.sound]
```

No `sorryAx`, no custom axiom. `grep -n "sorry\|^axiom "` over all three files also returns
nothing.

Note (non-blocking): cited `mfact_revision` (`801abf7933dabf5c95f9fb18ff21a7a8a1f6a564`)
predates current `mfact` HEAD (`cf5e047264ccd117b49c97b0effb392a5e478e6b`); citation here is
by content hash, which still matches, so this does not invalidate the citation.

## Standing
`ALIVE` for the Lean-side re-verification specifically — the "not ALIVE until a live `lake
build` closes the Lean-side re-verification gap" condition is now satisfied: hashes match
citations (`Core.lean`, `Dfg.lean`), all three Ocel/Petri modules build successfully, and the
cited declarations (`OCEL.TimeOrdered`, `OCEL.IsLifecycle`, `OCPN.WellFormed`,
`OCPN.Conforms`) carry no axioms beyond standard ones and no `sorry`. This does not newly
close the 5 honestly-documented correspondence gaps or the 2 flagged-but-unfixed defects
noted above — those remain exactly as scoped; only the Lean-file-freshness/build/axiom
standing improves.
