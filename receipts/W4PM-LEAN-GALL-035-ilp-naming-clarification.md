---
receipt: W4PM-LEAN-GALL-035
date: 2026-07-29
status: ALIVE
gate: ILP naming/doc clarification (doc-only, no behavior change)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-020 (receipts/W4PM-LEAN-GALL-020-algorithm-crown.md)
mfact_revision: 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564
---

# 035 — ILP Naming/Doc Clarification

## Context

`W4PM-LEAN-GALL-018` independently re-confirmed that `ilp-petri-net` (along with 5 other
algorithms) is `no_lean_coverage` — no Lean formalization of an actual Integer Linear
Programming model exists in `mfact` or `mfw` for this function. `W4PM-LEAN-GALL-020`'s
crown carried this forward without correction. Neither checkpoint addressed whether the
Rust implementation's own doc comments overclaim what it does — this checkpoint does.

## Finding: `discover_ilp_petri_net_from_log` (`wasm4pm/src/ilp_discovery.rs:63`) is NOT an
## ILP solve

Read directly: the function runs a 4-stage deterministic pipeline (build causal/parallel
pairs from the DFG → generate candidate places → validate each via token replay → **greedy
set-cover** to pick a subset of consistent places covering all causal pairs, implemented in
`ilp_greedy_cover`, `src/ilp_discovery.rs:224`). There is no ILP/MILP model construction, no
simplex or branch-and-bound, and no external or in-crate solver dependency anywhere in this
module. The greedy set-cover step (`ilp_greedy_cover`) gives no optimality guarantee — it
repeatedly selects whichever consistent candidate place covers the most still-uncovered
causal pairs, which is a standard polynomial-time approximation to the NP-hard exact
set-cover problem, not an equivalent-strength solve.

Separately, `discover_optimized_dfg_from_log` (`src/ilp_discovery.rs:449`, not the function
named in this checkpoint's scope but sharing the module) runs a genuine discrete-optimization
sweep over every distinct edge-frequency threshold and picks the argmax by a weighted
fitness/simplicity objective — this is real, correctly-described discrete optimization, but
still not ILP (no linear program is constructed; it is an exhaustive sweep over a finite,
enumerable threshold set).

## What changed

Doc-only, no behavior change, per the task's explicit instruction not to rename the public
function (would break existing callers of `discover_ilp_petri_net_from_log` /
`wasm_compute_simplicity` and friends).

1. `discover_ilp_petri_net_from_log`'s doc comment (`src/ilp_discovery.rs:63`) rewritten to
   state plainly: "NOT an Integer Linear Programming solve," name the actual algorithm
   (threshold-sweep + greedy set-cover approximation — corrected from the previous
   "region-based ILP-inspired" framing), and explain why the `ilp_*` naming is kept
   (backward compatibility, not accuracy).
2. Added a module-level doc comment (`//!` at the top of the file, none existed before) with
   the same one-line disclaimer, so the clarification is visible without opening the
   specific function.

No function signatures, logic, or field names changed. No renaming performed (as instructed
— would break callers of `discover_ilp_petri_net_from_log`, `wasm_compute_simplicity`, and
`ilp_discovery::*` throughout `benches/`, `tests/`, and the CLI bridge crates).

## Test evidence

Baseline (`cd wasm4pm/wasm4pm && cargo test --lib`, before any edits this session):
```
test result: ok. 1004 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.42s
```

After this checkpoint's doc-only edit:
```
test result: ok. 1004 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.42s
```

Identical pass/fail count — confirms zero behavior change, as expected for a doc-only edit.

## Standing

`ALIVE` — a doc correction with a re-run test count proving no regression. This does not
change the algorithm's classification (`no_lean_coverage`/`UNSUPPORTED`, per `018`/`020`); it
only stops the Rust source itself from implying a solver technique (ILP) that isn't present,
independent of the separate (and still-open) Lean-coverage question.
