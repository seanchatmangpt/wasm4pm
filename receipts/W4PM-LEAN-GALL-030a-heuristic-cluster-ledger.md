---
receipt: W4PM-LEAN-GALL-030a
date: 2026-07-29
status: PARTIAL_ALIVE
gate: heuristic cluster re-investigation (proof-dependency program, checkpoint 030a)
git_revision: PENDING_COMMIT
predecessor: W4PM-LEAN-GALL-020 (receipts/W4PM-LEAN-GALL-020-algorithm-crown.md)
mfact_revision: 33bdc971aa3735a1809bf0c09e4b5522ddee7966 (adds Rework.lean/ReworkTests.lean; base was 801abf7933dabf5c95f9fb18ff21a7a8a1f6a564)
---

# 030a — Heuristic Cluster Re-Investigation (footprints, alpha-plus-plus, optimized-dfg, astar, hill-climbing, rework-detection)

## Independent re-investigation, not a citation of 009

All 6 rows were re-searched fresh in both `mfact` and `mfw` this checkpoint via
`mcp__plugin_lumen_lumen__semantic_search` plus targeted `grep` for exact literal names
(A*/astar/admissible/Dijkstra, footprint/FootprintMatrix, hill climbing/local search,
alpha-plus-plus/PetriNet region theory). 5 of 6 are re-confirmed `no_lean_coverage`;
`rework-detection` got a new, genuinely proven Lean theorem this checkpoint. Full detail
in `wasm4pm/correspondence/maps/heuristic-cluster-030a.json`.

## `validTopologicalSort` re-examined directly, not trusted from the 009 note

Read `mfact/procint/ProcInt/MFW/Ledger.lean:33-38` (identical copy in
`mfw/mfw-theory/MFW/Ledger.lean:38-43`) in full. It is a real, non-tautological, decidable
4-conjunct predicate (`Nodup`, forward node-coverage, reverse node-coverage, edge-order) --
the historical `:= True` stub noted in `mfact/paper/mfw-notation.tex` describes an OLDER
version; the current source is not a stub (`Tests/LedgerTests.lean` exercises all 4
conjuncts with discriminating positive/negative `decide` witnesses).

**But it is not a process-mining carrier at all.** `MetaMathDAG`'s nodes track
*meta-mathematical claims* (`id : Nat, statement : String`) in a proof-dependency ledger --
infrastructure for ordering which `mfw`/`mfact` theorems get proved in what sequence, not a
directly-follows graph, activity-dependency graph, or any process-mining structure. No field
of `MetaMathDAG` corresponds to an activity, event, or trace. This is a stronger finding than
009's "adjacent-but-unmapped" framing suggested for `optimized-dfg` and `hill-climbing`: it
is not that a carrier map *could* plausibly be built with more work -- the two domains share
no common carrier type, so `LEAN_NAME_MATCH_WITHOUT_CARRIER_MAP` applies outright, the same
refusal already exercised against `powl`'s POWLBridge.lean name-match in 009.

## The one real finding: rework-detection is tractable, and got proven

`wasm4pm/src/models.rs::ColumnarLog::count_loops_length_1`/`count_loops_length_2` are bounded
existentials over a finite index range (`self.events[i] == self.events[i+1]`, etc.) -- fully
deterministic, no search or RNG, the same *shape* `validTopologicalSort`'s own conjuncts use
(just over a different domain). This is what makes it distinct from the other 5 in this
cluster, all of which are either stochastic, local-search-without-a-convexity-proof, or have
zero Lean work targeting their domain at all.

**New Lean file**: `mfact/procint/ProcInt/MFW/Rework.lean` -- `hasL1Loop`, `hasL2Loop`,
`hasRework` (structural recursion on `List Nat`), and a proven theorem:

```
theorem hasL1Loop_iff (l : List Nat) :
    hasL1Loop l = true ↔ ∃ i, i + 1 < l.length ∧ idx l i = idx l (i + 1)
```

Deliberately imports nothing (no `Mathlib`, no `Batteries`) -- `mfact/procint`'s `.lake`
package cache has zero Mathlib build artifacts (`ls .lake/packages/mathlib/.lake/build`
fails with "No such file or directory"), so a `lake build` from this state would require a
full from-scratch Mathlib build, impractical to run inline (matching the constraint every
prior harness in this module documents). Verified instead with a **direct `lean` invocation**
of the pinned toolchain on the standalone file:

```
$ elan run leanprover/lean4:v4.31.0 lean Rework.lean
$ echo $?
0
```

Zero warnings, zero errors. Axiom check:

```
#print axioms ProcInt.MFW.hasL1Loop_iff
'ProcInt.MFW.hasL1Loop_iff' depends on axioms: [propext, Quot.sound]
```

Only the two standard trusted kernel axioms essentially every nontrivial Lean proof depends
on -- no `sorry`, no custom `axiom` anywhere in the file. `Tests/ReworkTests.lean` adds 7
`decide`-discharged positive/negative witness examples mirroring `Tests/LedgerTests.lean`'s
own convention (including the disjointness check: an `A,A,A` triple is an L1 loop, correctly
NOT counted as an L2 loop, per the Rust doc comment).

**New Rust harness**: `wasm4pm/wasm4pm/src/correspondence/rework_detection.rs`, registered in
`correspondence/mod.rs`. Comparison mode `receipted_formula_with_cited_proof` (same as every
other harness in this module -- no live Lean invocation happens inside `cargo test`):
`lean_has_l1_loop`/`lean_has_l2_loop`/`lean_has_rework` are hand-transcribed copies of
`Rework.lean`'s definitions, differentially checked against the REAL production
`ColumnarLog::count_loops_length_1`/`count_loops_length_2` via `EventLog::to_columnar`. 10
tests, all pass (positive/negative/vacuous/empty/disjointness cases plus a negative
falsifier proving the differential has teeth):

```
$ cargo test --lib correspondence::rework_detection
running 10 tests
test correspondence::rework_detection::tests::rework_lean_file_exists_at_cited_path ... ok
test correspondence::rework_detection::tests::wrong_predicate_is_caught ... ok
test correspondence::rework_detection::tests::empty_trace ... ok
test correspondence::rework_detection::tests::l2_loop_present_no_l1 ... ok
test correspondence::rework_detection::tests::l2_loop_absent ... ok
test correspondence::rework_detection::tests::vacuous_short_trace ... ok
test correspondence::rework_detection::tests::l1_loop_present ... ok
test correspondence::rework_detection::tests::rework_helper_matches_either_primitive ... ok
test correspondence::rework_detection::tests::l1_and_l2_both_present_disjoint_by_construction ... ok
test correspondence::rework_detection::tests::l1_loop_absent ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 1022 filtered out; finished in 0.01s
```

## The other 5: confirmed negative, with reasoning, not hand-waving

- **footprints** (`wasm4pm/src/algorithms.rs::discover_footprints_from_log`): zero hits for
  footprint-matrix/alpha-relation formalizations in either repo.
- **alpha-plus-plus**: zero hits for PetriNet-region/alpha-relation Lean modules; 009's note
  independently re-confirmed.
- **optimized-dfg** (`wasm4pm/src/ilp_discovery.rs::discover_optimized_dfg_from_log`): its
  own algorithmic content (threshold-sweep + greedy set-cover) has no Lean monotonicity
  lemma; the `validTopologicalSort` note downgraded per the domain-mismatch finding above.
- **astar** (`wasm4pm/src/fast_discovery.rs`, discovery context): the Rust "heuristic" is a
  composite quality SCORE (coverage×0.8 + simplicity×0.2 − edge-penalty×0.2) for candidate
  models, not a lower-bound estimate of remaining search cost to an optimality target --
  there is no "true cost" function to check admissibility against. The search is a bounded
  beam search (`open_set` truncated to 128 candidates/iteration) using A* terminology, not
  textbook A* over a metric space. Even a hypothetical general Lean A*-admissibility theorem
  (none found) could not be invoked here -- the precondition's shape does not clearly apply,
  independent of Lean coverage. (Distinct from conformance-checking A*-alignment,
  `alignment_fitness.rs::compute_trace_alignment`, which DOES have a real `g_cost`/`h_cost`
  split -- out of scope for this discovery-context entry.)
- **hill-climbing** (`wasm4pm/src/fast_discovery.rs::discover_hill_climbing_from_log`):
  deterministic greedy local search with no global-optimality guarantee by construction
  (would need a submodularity/convexity proof of the fitness landscape, which exists nowhere
  in mfact/mfw); `validTopologicalSort` note downgraded per the domain-mismatch finding above.

## mfact commit

Two new files added, nothing else touched (mfact's working tree had pre-existing unrelated
uncommitted changes -- multiple `.agents/` deletions and a modified
`procint/ProcInt/Models/Dfg.lean` -- from a concurrent fleet per this repo's documented
multi-agent reality; neither is part of this checkpoint's scope and neither was staged):

- `procint/ProcInt/MFW/Rework.lean`
- `procint/ProcInt/MFW/Tests/ReworkTests.lean`

## `cargo test --lib` before/after

**Before** (baseline, prior to any edit this checkpoint):
```
test result: ok. 1005 passed; 0 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.40s
```

**After** (post rework-detection harness):
```
test result: FAILED. 1019 passed; 1 failed; 12 ignored; 0 measured; 0 filtered out; finished in 0.40s
```

The 1 failure is `correspondence::ocel_semantics::tests::lean_file_hashes_match_citation`,
asserting a content-hash match against `mfact/procint/ProcInt/Models/Dfg.lean`. Confirmed via
`git status` in `mfact` that this file is independently modified in `mfact`'s working tree
(uncommitted, not by this session -- `git status --short` shows `M
procint/ProcInt/Models/Dfg.lean`, and this checkpoint never opened or edited that path). This
is the concurrent-fleet drift this repo's `CLAUDE.md` explicitly warns about ("Multiple AI
fleets may edit this repo simultaneously"), not a regression caused by the
`rework-detection` work -- **flagged, not fixed**, out of this checkpoint's scope (fixing it
would require either re-hashing against `mfact`'s current `Dfg.lean` content or reverting
that file, neither of which this checkpoint's task authorizes). The `+14` passed beyond
`1005 + 10` (this checkpoint's own new tests) indicates other concurrent test additions in
the same window, consistent with the same multi-fleet activity.

## Evidence class achieved

5 of 6 (footprints, alpha-plus-plus, optimized-dfg, astar, hill-climbing): `UNMAPPED
(no_lean_coverage)`, independently re-confirmed. 1 of 6 (rework-detection): genuine new Lean
theorem (`ALIVE` -- ran + passed, this session: `lean` exit 0, axiom check clean, 10/10 Rust
differential tests pass) plus a receipted-formula Rust correspondence harness.

## Explicit scope boundary

This checkpoint does **not** claim: any Lean correspondence for
footprints/alpha-plus-plus/optimized-dfg/astar/hill-climbing (none possible given current
mfact/mfw coverage); that the rework-detection harness constitutes a live Lean-in-the-loop
check inside `cargo test` (it is `receipted_formula_with_cited_proof`, identical in kind to
every other harness in this module -- the proof itself was verified live via direct `lean`
invocation, once, outside the Rust test suite, not on every `cargo test` run); that A*
admissibility could be established for wasm4pm's discovery-context heuristic under any
circumstance; that the pre-existing `ocel_semantics` hash-drift failure has been fixed
(flagged only, confirmed not caused by this checkpoint's edits).

## Standing

`PARTIAL_ALIVE` -- one genuine new proven Lean theorem (zero `sorry`/custom `axiom`) with a
passing 10-test Rust correspondence harness for `rework-detection`; an honest,
independently-re-verified `no_lean_coverage` ledger for the other 5, including a
strengthened (not weaker) rejection of the `validTopologicalSort` name-adjacency for 2 of
them; and an honestly flagged, out-of-scope, pre-existing concurrent-edit test failure
(`ocel_semantics`) that this checkpoint did not cause and does not fix.
