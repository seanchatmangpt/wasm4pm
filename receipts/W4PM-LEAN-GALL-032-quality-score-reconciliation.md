---
receipt: W4PM-LEAN-GALL-032
date: 2026-07-29
status: PARTIAL_ALIVE
gate: reconcile 3 aggregate quality-score/F1 implementations (pending task #28 from W4PM-LEAN-GALL-020)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-031 (receipts/W4PM-LEAN-GALL-031-simplicity-metric-reconciliation.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 032 — Quality-Score/F1 Metric Reconciliation

Addresses task #28, flagged as open/unaddressed in `W4PM-LEAN-GALL-020`'s "What this crown
does NOT claim" section.

## The 3 implementations found (confirmed by direct read)

1. **`compute_quality_metrics`** — `wasm4pm/benchmarks/benchmark.rs:118`. Computes
   `(fitness, precision, simplicity, f_measure)` for a discovered Petri net against an event
   log; `f_measure = 2*fitness*precision / (fitness+precision)` when both are computable
   (`benchmark.rs:134`) — a process-mining F-measure (van der Aalst-style harmonic mean of
   token-replay fitness and ETConformance precision).
2. **`OutcomeAccuracy::f1`** — `wasm4pm/benches/prediction_accuracy.rs:556`. Classification
   F1 computed from TP/FP/FN counters (`precision()`/`recall()` at lines 538/547) for
   next-outcome prediction accuracy — a predictive-monitoring task, not model discovery.
3. **`quality_score`** (ad-hoc heuristic, no dedicated function — inlined twice) —
   `wasm4pm/src/ensemble.rs:125` and `:202`. Formula:
   `fitness * (1.0 - (complexity_ratio - 1.0).abs().min(1.0) * 0.2)` — a ranking heuristic
   for DFG-variant candidates in ensemble discovery, penalizing edge/node ratio deviation
   from 1.0. Notably has no precision term at all and is not a harmonic mean of anything.

## Verdict: legitimately 3 distinct metrics, correctly kept separate

All three serve different callers and different questions:
- (1) answers "how good is this discovered Petri net, structurally and behaviorally, against
  the log it was mined from?" (model discovery quality).
- (2) answers "how accurate is this trained predictor at classifying the next
  outcome/activity?" (predictive monitoring accuracy) — an entirely different pipeline stage,
  with inputs (TP/FP/FN counts over predicted-vs-actual outcome labels) that share no data
  with (1)'s token-replay/escaping-edges computation.
- (3) answers "which of several candidate DFG-threshold variants should be ranked highest?" —
  a ranking heuristic, not a correctness/accuracy metric, and structurally different (no
  precision or recall term).

(1) and (2) share the textbook F1/F-measure *shape* (`2pr/(p+r)`), which is presumably why
this was flagged as needing reconciliation — but they are not two implementations of the same
underlying computation: (1)'s `p` and `r` come from continuous-valued token-replay fitness
and escaping-edges precision on a process model; (2)'s come from discrete TP/FP/FN counts on
a classification task. Unifying them would require conflating two different domains'
definitions of "precision" and "recall," which would be incorrect, not a fix.

## What changed

Documented the distinction directly at each site:
- `src/ensemble.rs`, above the `quality_score` computation (`:113`–`:120` region): added a
  comment naming all three implementations and stating why `quality_score` is not an F1/
  F-measure.
- `src/ensemble.rs` test module: added
  `test_three_quality_metrics_are_distinct_not_duplicated`, which computes all three formulas
  on a matched scenario (`fitness=0.9, precision=0.8, recall=0.8, complexity_ratio=0.8`) and
  asserts pairwise inequality — proving the three do not silently agree and are not
  copy-drift of one canonical formula.

No production formula was changed in this checkpoint (unlike checkpoint 031's `benchmark.rs`
fix) — none of the three needed to be made canonical/delegating, since none were intended to
compute the same thing.

## Test evidence

Baseline (before any of this session's edits): `1004 passed; 0 failed; 12 ignored`.
After checkpoint 031 alone: `1005 passed; 0 failed; 12 ignored`.

After this checkpoint (`cargo test --lib` in `wasm4pm/wasm4pm`):
```
test result: FAILED. 1009 passed; 1 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.41s
```
+4 passed relative to checkpoint 031's count (1 new test in `ensemble.rs`
`test_three_quality_metrics_are_distinct_not_duplicated`; the other +3 tests observed in this
run were not added by this checkpoint — `git diff --stat` at the time of this receipt shows
concurrent edits to files this checkpoint never touched, e.g. `oc_petri_net.rs`,
`correspondence/causal_dependency_measure.rs`, and CLI crates, consistent with this repo's
documented multi-agent-concurrency environment).

The 1 failure, `correspondence::ocel_semantics::tests::lean_file_hashes_match_citation`, is a
pre-existing content-hash staleness check against `ProcInt/Models/Dfg.lean` in the sibling
`mfact` repo. It is unrelated to this checkpoint's edited files (`ensemble.rs`) — confirmed by
running `cargo test --lib correspondence::ocel_semantics` in isolation, which reproduces the
identical hash mismatch (`left: 31ff7a5e...`, `right: d2717c4f...`) regardless of this
checkpoint's changes. Not investigated further here (out of scope for tasks #27/#28).

## Standing

`PARTIAL_ALIVE` — the distinctness claim is real, source-cited, and test-proven on a shared
scenario. Not `ALIVE` end-to-end for the whole test suite this session, since one unrelated,
pre-existing external test remains failing due to a sibling-repo content drift outside this
checkpoint's control or scope.
