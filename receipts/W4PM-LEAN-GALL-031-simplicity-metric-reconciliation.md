---
receipt: W4PM-LEAN-GALL-031
date: 2026-07-29
status: PARTIAL_ALIVE
gate: reconcile 3 simplicity metric implementations (pending task #27 from W4PM-LEAN-GALL-020)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-035 (receipts/W4PM-LEAN-GALL-035-ilp-naming-clarification.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 031 — Simplicity Metric Reconciliation

Addresses task #27, flagged as open/unaddressed in `W4PM-LEAN-GALL-020`'s "What this crown
does NOT claim" section.

## The 3 implementations found (confirmed by direct read, not by name-matching alone)

1. **`simplicity_arc_degree`** — `wasm4pm/src/complexity_metrics.rs:290`. Formula:
   `1.0 - (num_arcs / (num_places * num_transitions))`, clamped to `[0.0, 1.0]`. Comment
   states it mirrors `pm4py.analysis.simplicity_petri_net()` variant `"arc_degree"`.
2. **`compute_simplicity`** — `wasm4pm/src/ilp_discovery.rs:36`. Formula: geometric mean of
   three ratios (`min_places/places`, `min_transitions/transitions`, `min_arcs/arcs`) against
   the theoretical minimum for a linear sequence of `N` visible activities (`N+1` places,
   `N` transitions, `2N` arcs). Cites García & Caballero, Buijs et al.
3. **`compute_simplicity`** (duplicate name) — `wasm4pm/benchmarks/benchmark.rs:408`. Before
   this checkpoint, its doc comment claimed to "mirror `ilp_discovery.rs::compute_simplicity`"
   but its actual formula was `1.0 / (1.0 + ln(1 + places + transitions + arcs))` — a
   completely different curve. **This file is not part of the crate's build graph**: it is
   not registered as a `[[bin]]` or `[[example]]` in `Cargo.toml`, has no `use wasm4pm::...`
   dependency, and is not compiled by `cargo test --lib`, `cargo test`, or `cargo check`
   today (verified: `grep -n "benchmarks/benchmark" Cargo.toml` returns nothing).

## Verdict: 2 pairs, 2 different resolutions

**(1) vs (2) — legitimately distinct metrics, correctly kept separate.** `simplicity_arc_degree`
measures arc *density* relative to the maximum possible bipartite place-transition
connectivity. `ilp_discovery::compute_simplicity` measures element *count* relative to the
theoretical minimum for a linear-sequence model. These are two different published
pm4py-style simplicity variants with different reference baselines, not a copy that drifted.
Resolution: documented the distinction in both doc comments, and added
`test_simplicity_arc_degree_and_compute_simplicity_are_distinct_metrics`
(`src/complexity_metrics.rs`) asserting they give different, non-agreeing scores on a shared
`(places=4, transitions=4, arcs=6)` fixture (`0.625` vs a different value from the geometric
mean formula).

**(2) vs (3) — a real divergence bug, now fixed.** `benchmark.rs`'s own doc comment stated an
intent to mirror `ilp_discovery::compute_simplicity`, but its formula did not; this is
exactly the "meant to be the same, but drifted" case. Because `benchmarks/benchmark.rs` has
no crate dependency and is not built by cargo today, it cannot literally call
`ilp_discovery::compute_simplicity` without adding a new dependency/registration (a change
this checkpoint judged out of scope and unnecessary risk for an otherwise-dead file).
Resolution: replaced the formula in `benchmarks/benchmark.rs::compute_simplicity` with the
verbatim geometric-mean-of-ratios logic from `ilp_discovery::compute_simplicity`, so the two
now agree by construction on identical inputs, and corrected the doc comment to state
explicitly that this is a hand-copied duplicate with no compiler-enforced link, not a call.
No test proving (2)≡(3) numerically was added inside `benchmarks/benchmark.rs`'s own
`#[cfg(test)]` module beyond the pre-existing `test_compute_simplicity_*` tests there (which
already assert the empty/monotonic-decrease/bounds properties both formulas share) — since
this file is not part of any `cargo test` invocation, any new assertion added there would be
inert and unverifiable by CI; this is flagged here rather than silently omitted.

## Test evidence

Baseline (before any of this session's edits): `1004 passed; 0 failed; 12 ignored`.

After this checkpoint (`cargo test --lib` in `wasm4pm/wasm4pm`):
```
test result: ok. 1005 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.41s
```
+1 test (`test_simplicity_arc_degree_and_compute_simplicity_are_distinct_metrics`), 0
regressions.

A later full run in this session (after checkpoint 032's edits were also applied) showed
`1009 passed; 1 failed; 12 ignored` — the 1 failure is
`correspondence::ocel_semantics::tests::lean_file_hashes_match_citation`, a pre-existing
content-hash staleness check against a file in the sibling `mfact` repo
(`ProcInt/Models/Dfg.lean`) that is outside this checkpoint's edited files
(`complexity_metrics.rs`, `ilp_discovery.rs`) and outside this repo's own git tree. Per this
repo's documented multi-agent-concurrency caveat, this is attributed to a concurrently-running
fleet editing the sibling `mfact` repo, not to this checkpoint's changes — confirmed by
re-running `cargo test --lib correspondence::ocel_semantics` in isolation, which reproduces
the same hash mismatch independent of any file this checkpoint touched.

## Standing

`PARTIAL_ALIVE` — the (1)/(2) distinction is real and now test-proven; the (2)/(3) fix
closes a genuine drift bug but only inside a file that is not currently compiled or tested by
this crate's build (`UNVERIFIED` by any automated gate — a human or future build change would
need to wire `benchmarks/benchmark.rs` into `Cargo.toml` before its tests could ever run).
