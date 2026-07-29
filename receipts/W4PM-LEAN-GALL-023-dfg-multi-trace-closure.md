---
receipt: W4PM-LEAN-GALL-023
date: 2026-07-29
status: ALIVE
gate: multi-trace DFG aggregation correspondence (closes the `dfg` row's multi-trace gap, 009 ledger)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-020 (receipts/W4PM-LEAN-GALL-020-algorithm-crown.md)
mfact_revision: 0732d26038f1b6d68f3fbbb59e9a3f6c2fb4e5a0
---

# 023 — DFG Multi-Trace Aggregation Closure

## The gap this closes

The W4PM-LEAN-GALL-009 lean-coverage ledger's `dfg` row read:

> `dfg | adjacent_theorem_requiring_carrier_mapping | ProcInt.Dfg α (mfact Models/Dfg.lean) |
> Lean model is single-trace, unweighted; Rust aggregates multi-trace with counts + start/end
> sets not modeled`

Checkpoint 017 built a harness for `dfgOfTrace` restricted to a single trace (see
`receipts/W4PM-LEAN-GALL-017-ocel-semantics-correspondence.md`). This checkpoint extends
`mfact/procint/ProcInt/Models/Dfg.lean` itself with genuine multi-trace aggregation
definitions and theorems, then builds a new Rust harness comparing them against wasm4pm's real
`discover_dfg_from_log` (`wasm4pm/src/discovery.rs:28-75`) on a multi-trace log — the part of
the gap note that was previously unmodeled on the Lean side.

## What was added to Dfg.lean

- `Dfg.append` — merges two DFGs' edge lists by list append (the raw combination step, not
  itself an aggregation).
- `dfgOfLog (log : List (List α)) : Dfg α` — folds `dfgOfTrace` over every trace in a log via
  `Dfg.append`, the multi-trace counterpart of the existing single-trace `dfgOfTrace`.
- `dfgOfLog_nil` — the empty log yields the empty DFG.
- `dfgOfLog_singleton` — a one-trace log's `dfgOfLog` reduces to plain `dfgOfTrace` on that
  trace, the consistency theorem connecting the new multi-trace definition back to the
  existing single-trace one.
- `foldr_add_offset` (private helper) and `Dfg.append_weight` — prove that `Dfg.weight` (the
  existing, unmodified frequency aggregator) is additive across `Dfg.append`: the combined
  weight of a directly-follows pair after merging two DFGs is the sum of each side's own
  weight.
- `dfgOfLog_weight_eq_sum` — the central multi-trace aggregation theorem: a directly-follows
  pair's aggregated weight across an entire log equals the sum, over every trace, of that
  pair's weight within the trace's own single-trace DFG. This is the Lean-side statement of
  wasm4pm's real `BTreeMap<(u32,u32), usize>` accumulation loop (`discovery.rs:39-61`).
- `traceStart`/`traceEnd`, `startActivities`/`endActivities` — model wasm4pm's
  `start_activities`/`end_activities` frequency maps (`discovery.rs:55-60`), plus
  `startActivities_nil`, `startActivities_singleton_self`, `endActivities_singleton_self`.

No `sorry`, no `axiom` anywhere in the added code (confirmed by direct read of the final file).

## Lean verification status — honest, not rounded up

**The new Lean proofs WERE kernel-verified by a completed `lake build` in this session.**
`mfact/procint`'s `.lake` state had no built Mathlib when this checkpoint began (confirmed —
`.lake/packages/{mathlib,cslib}` existed as unbuilt source clones only). During this checkpoint
a `lake exe cache get` (fetching prebuilt Mathlib `.olean` artifacts) was started in the
background, completed successfully (`[25/25] Built cache:exe`), and its `leantar` extraction
ran to completion; a scoped `lake build ProcInt.Models.Dfg` was then run against the now-cached
Mathlib and finished with:

```
$ lake build ProcInt.Models.Dfg
Build completed successfully (8558 jobs).
```

re-run directly (not just observed via the background job) to confirm the result:

```
$ cd /Users/sac/mfact/procint && lake build ProcInt.Models.Dfg
Build completed successfully (8558 jobs).
```

This means every new definition and theorem in this checkpoint's `Dfg.lean` addition
(`Dfg.append`, `dfgOfLog`, `dfgOfLog_nil`, `dfgOfLog_singleton`, `foldr_add_offset`,
`Dfg.append_weight`, `dfgOfLog_weight_eq_sum`, `traceStart`, `traceEnd`, `startActivities`,
`endActivities`, `startActivities_nil`, `startActivities_singleton_self`,
`endActivities_singleton_self`) was admitted by the Lean 4 kernel — not merely
syntactically-plausible-but-unverified Lean, and not a hand-reviewed guess at correctness. Other
AI fleets were observed concurrently building unrelated modules (`ProcInt.Models.CausalNetClamp`)
against the same shared `.lake` state during this session, per this repo's documented
multi-agent-reality constraint — the successful build reported above is this checkpoint's own
direct re-run, not inferred from their activity.

## File hash

```
$ shasum -a 256 /Users/sac/mfact/procint/ProcInt/Models/Dfg.lean
0270e4ea625bb41aaae76c43e953ad798b836c521636fdf10bf447befa81312e
```

## mfact commit

Committed in `/Users/sac/mfact` with its own commit message; see that repo's log for the exact
SHA (this receipt cites it as `mfact_revision` once available — search
`git -C /Users/sac/mfact log --oneline -1 -- procint/ProcInt/Models/Dfg.lean` if this receipt's
header still shows `PENDING_MFACT_COMMIT`). This checkpoint's `mfact` commit supersedes the
prior pin `801abf7933dabf5c95f9fb18ff21a7a8a1f6a564` used by checkpoints 010–020 for this file
specifically (other cited files in that revision are unaffected).

## Rust harness

New module `wasm4pm/src/correspondence/dfg_multi_trace.rs`, registered in
`wasm4pm/src/correspondence/mod.rs`. Hand-transcribes `dfgOfLog`'s edge multiset and
`startActivities`/`endActivities` over a `u32`-id representation (mirroring wasm4pm's own
`col.events: Vec<u32>` internal columnar form, avoiding a string-interning re-implementation),
then differentially compares against a direct transcription of `discover_dfg_from_log`'s real
`BTreeMap` accumulation loop. 10 tests: empty log, single-trace consistency, repeated-pair
aggregation within one trace, the central multi-trace claim (weight sums across traces, not
concatenation or trace-membership counting), a general per-trace-sum property check over 5
traces, empty-trace exclusion, start/end-activity tallying, empty-traces excluded from
start/end tallies, a negative falsifier (trace-count vs. real occurrence-sum aggregation), and
the lean-file-hash citation-freshness test.

Updating `Dfg.lean` also changed its content hash, which correctly broke checkpoint 017's
existing `correspondence::ocel_semantics::lean_file_hashes_match_citation` test (it cited the
old hash) — this is the citation-staleness mechanism working as designed, not a regression;
`LEAN_DFG_FILE_SHA256` in `ocel_semantics.rs` was updated to the new hash with a note explaining
why (the file's `dfgOfTrace`-specific content this harness relies on was not itself modified).

Carrier map: `wasm4pm/correspondence/maps/dfg-multi-trace.json`.

## Full command output

```
$ cargo test --lib correspondence::dfg_multi_trace
running 10 tests
test correspondence::dfg_multi_trace::tests::empty_traces_do_not_count_as_starts_or_ends ... ok
test correspondence::dfg_multi_trace::tests::start_and_end_activities_tally_across_traces ... ok
test correspondence::dfg_multi_trace::tests::tampered_aggregation_is_caught ... ok
test correspondence::dfg_multi_trace::tests::empty_log_has_zero_weight_everywhere ... ok
test correspondence::dfg_multi_trace::tests::repeated_pair_within_one_trace_aggregates ... ok
test correspondence::dfg_multi_trace::tests::single_trace_matches_dfg_of_trace_special_case ... ok
test correspondence::dfg_multi_trace::tests::empty_traces_within_a_log_contribute_no_edges ... ok
test correspondence::dfg_multi_trace::tests::multi_trace_sums_across_traces_not_just_concatenates ... ok
test correspondence::dfg_multi_trace::tests::weight_equals_sum_of_per_trace_weights_property ... ok
test correspondence::dfg_multi_trace::tests::lean_file_hash_matches_citation ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 1032 filtered out; finished in 0.02s
```

Baseline `cargo test --lib` measured at the start of this checkpoint (before any edits, this
session): **1005 passed, 0 failed, 12 ignored**. Full-suite `cargo test --lib` measured after
this checkpoint's changes: **1036 passed, 0 failed, 12 ignored**. The delta (+31) is larger than
this checkpoint's own +10 new tests because other AI fleets committed unrelated new
correspondence harnesses (`heuristic_miner_threshold`, `inductive_miner_cut_soundness`,
`rework_detection`) to the same shared `wasm4pm/src/correspondence/mod.rs` concurrently during
this session — confirmed by a live race observed mid-session where a concurrent edit to that
file briefly dropped this checkpoint's own `pub mod dfg_multi_trace;` line, caught and restored
before finalizing (per this repo's documented multi-agent-reality constraint; `git worktree`
isolation was not used for this checkpoint since the conflict was small and resolved cleanly).
Isolating this checkpoint's own contribution: before this session's edits + 10 new tests = 1015
expected if no other fleet had touched the crate; the observed 1036 reflects the other fleets'
concurrent +21.

## Evidence class achieved

`carrier_mapped_formula_correspondence (curated_fixture_domain)` for the Rust↔Lean formula
correspondence itself (the Rust harness is still a curated-fixture differential check, not an
exhaustive one) — but unlike every prior checkpoint in this program (010–020), the Lean side of
this claim is now backed by an actual completed `lake build`, not citation-by-hash alone. This
is the first checkpoint in the program to close that specific gap for its own claim.

## Explicit scope boundary

Does not cover: `dfg-filtered`/`dfg-simd`/`dfg-hierarchical` refinement rows (009 ledger,
inherit this base, not separately re-verified here); `ocel-dfg`/`ocel-dfg-per-type`
(`UNMAPPED` per `ocel-semantics.json`, unaffected by this checkpoint); a general
`dfgOfLog_edges_eq_flatMap`-style edge-list identity (only the `weight`/aggregated-frequency
projection is compared, since that is the quantity `discover_dfg_from_log` actually returns);
live re-verification of any *prior* checkpoint's Lean citations (unaffected by this checkpoint
except where `Dfg.lean`'s hash change required updating `ocel_semantics.rs`'s citation, done
above).

## Standing

`ALIVE` — new, real Lean definitions/theorems with no `sorry`/`axiom`, kernel-verified by a
completed and independently re-run `lake build ProcInt.Models.Dfg` (8558 jobs, success), plus a
real differential Rust harness with 10 passing tests including a negative falsifier. This
upgrades the program's standard evidence tier for this specific claim beyond the
citation-by-hash pattern used by checkpoints 010–020 (their Lean sides remain unverified in this
session; this receipt does not re-verify them).
