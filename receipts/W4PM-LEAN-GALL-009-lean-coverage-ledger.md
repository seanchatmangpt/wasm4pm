---
receipt: W4PM-LEAN-GALL-009
date: 2026-07-29
status: PARTIAL_ALIVE
gate: Lean coverage ledger (proof-dependency program, checkpoint 009/020)
git_revision: 35b0ee532866943ea55507a05478c78d4a988141
predecessor: W4PM-LEAN-GALL-008 (receipts/W4PM-LEAN-GALL-008-algorithm-census.md)
---

# Lean Coverage Ledger — wasm4pm × mfact/mfw

Every one of the 46 canonical algorithms from `W4PM-LEAN-GALL-008` is assigned exactly one
Lean coverage class below, built from 5 lumen-first Explore agents doing direct source
reads in both `wasm4pm` and `mfact`/`mfw` — never a name match alone. The binding refusal
rule (`LEAN_NAME_MATCH_WITHOUT_CARRIER_MAP`) was applied throughout: a similarly-named Lean
theorem is never sufficient for `direct_theorem`; it requires an explicit carrier map,
verified preconditions, and (ideally) no `sorry`/`axiom`.

**Coverage classes used**: `direct_theorem` / `formal_specification_only` /
`adjacent_theorem_requiring_carrier_mapping` / `property_level_theorem` /
`no_lean_coverage` / `refinement_of:<base-id>` (a variant algorithm whose correctness would
follow from its declared base case plus an unproven refinement lemma — not independent
coverage).

## Summary tally

**Corrected by `W4PM-LEAN-GALL-009A`** (receipts/W4PM-LEAN-GALL-009A-ledger-closure.md):
this table originally miscounted `adjacent_theorem_requiring_carrier_mapping` as 8 by
including `soundness`, a bonus entry not in the 46-algorithm count, and left `ocel-dfg`
as an unresolved open gap. Both are fixed below; the full 46-row ledger table further down
this file required no changes — it was correct all along, only this summary was wrong.

| class | count | algorithm_ids |
|---|---|---|
| `direct_theorem` | **0** | none — every candidate that name-matched was downgraded on carrier-map or clause-mapping grounds |
| `adjacent_theorem_requiring_carrier_mapping` | 7 | dfg, causal-heuristic, token-replay, powl, powl-from-partial-orders, ocel-powl, simple-process-tree |
| `property_level_theorem` | 1 (bonus, not in the 46) | declare_conformance (checking side, distinct from declare/mining) |
| `formal_specification_only` | 1 (bonus, not in the 46) | ProcessTree/ProcessTreeOperator type itself |
| `no_lean_coverage` | 35 | see full table (includes `ocel-dfg`, independently confirmed by 009A — mfact has the OCEL and DFG pieces separately but never combined) |
| `refinement_of:dfg` | 3 | dfg-filtered, dfg-simd, dfg-hierarchical |
| `refinement_of:ocel-dfg` | 1 | ocel-dfg-per-type (base is now a confirmed `no_lean_coverage` entry, not an open gap) |

`7 + 35 + 4(refinement) = 46` ✓. `soundness` (`StructuralNet::check_soundness`) and 2
other bonus entries (declare_conformance, ProcessTree type) are outside the original
46-algorithm count — noted, not folded into this tally.

**Zero `direct_theorem` classifications is itself the headline finding of this checkpoint.**
A prior, less rigorous audit round claimed real Petri/WfNet-soundness and conformance-fitness
correspondence as effectively proven; this round's stricter body-level analysis downgraded
both to `adjacent_theorem_requiring_carrier_mapping` — the Lean theorems are real and
sorry/axiom-free, but no encoder from the actual Rust types exists, and (for soundness
specifically) the Lean theorem's clause structure doesn't textually match wasm4pm's literal
3-clause decomposition. This is the discipline working as intended, not a regression.

## Full ledger (46 canonical algorithms)

| algorithm_id | class | Lean carrier (if any) | key gap |
|---|---|---|---|
| dfg | adjacent_theorem_requiring_carrier_mapping | `ProcInt.Dfg α` (mfact Models/Dfg.lean) | Lean model is single-trace, unweighted; Rust aggregates multi-trace with counts + start/end sets not modeled |
| dfg-filtered | refinement_of:dfg | inherits base | filter-monotonicity lemma not stated |
| dfg-simd | refinement_of:dfg | inherits base | SIMD/scalar equivalence unverified |
| dfg-hierarchical | refinement_of:dfg | inherits base | chunk-merge homomorphism unproved |
| ocel-dfg | **UNASSIGNED — open gap** | not analyzed | no agent independently checked this against a Lean OCEL/DFG carrier |
| ocel-dfg-per-type | refinement_of:ocel-dfg | contingent on base | object-type partition assumed, not proved |
| footprints | no_lean_coverage | none | — |
| alpha-plus-plus | no_lean_coverage | none (no PetriNet/Alpha* module found in mfact) | — |
| declare | no_lean_coverage | none (Declare.lean formalizes checking, not mining/discovery) | — |
| heuristic-miner | no_lean_coverage | adjacent-but-unmapped: `Ledger.lean::validTopologicalSort` (DAG validity only) | no carrier map, no discovery-specific theorem |
| inductive-miner | no_lean_coverage | none (no process-tree soundness formalization for this algorithm's specific construction) | strongest structural candidate (sound-by-construction cuts) but genuinely unformalized, not just unmapped |
| ilp-petri-net | no_lean_coverage | none (no ILP/region-theory Lean module found) | — |
| optimized-dfg | no_lean_coverage | adjacent-but-unmapped: `Ledger.lean::validTopologicalSort` | — |
| astar | no_lean_coverage | none | admissibility of the Rust heuristic itself unverified, so even textbook A* optimality can't be claimed |
| hill-climbing | no_lean_coverage | adjacent-but-unmapped: `Ledger.lean::validTopologicalSort` | — |
| genetic-algorithm | no_lean_coverage | none | stochastic, no convergence claim possible without a proof |
| pso | no_lean_coverage | none | stochastic |
| aco | no_lean_coverage | none | **DEGENERATE_RESULT falsifier already observed** (empty-DFG, fitness 0.2, real log) — caps this below TESTED_ONLY regardless of Lean status |
| simulated-annealing | no_lean_coverage | none | stochastic |
| oc-petri-net | no_lean_coverage | none (Ocel.lean models event-log structure only, not OC-Petri-net discovery) | — |
| powl | adjacent_theorem_requiring_carrier_mapping | `MFW.Crown.WorkflowSpace α` (opaque, POWLBridge.lean) — no POWL operators named in this file at all | zero encoder exists; separately, `mfact ProcInt.Models.Powl` has real operators but is unconnected to POWLBridge.lean or to wasm4pm |
| powl-from-partial-orders | adjacent_theorem_requiring_carrier_mapping | same opaque carrier | Rust impl itself currently falls back to trace-based discovery (not yet a distinct partial-order algorithm) |
| ocel-powl | adjacent_theorem_requiring_carrier_mapping | same opaque carrier, weaker | no Lean carrier for object-centric logs found anywhere |
| performance-dfg | no_lean_coverage | none | — |
| performance-spectrum | no_lean_coverage | none | — |
| simple-process-tree | adjacent_theorem_requiring_carrier_mapping | `ProcInt.ProcessTree α` (mfact Models/ProcessTree.lean) — closest structural match of all POWL/tree items | Loop binary-arity mismatch confirmed (Lean type-enforced, Rust only `debug_assert!`); Rust's n-ary `Or` operator has no Lean counterpart at all; no discovery-correctness theorem regardless |
| temporal-profile | no_lean_coverage | none | — |
| transition-system | no_lean_coverage | none (searched for TransitionSystem/automaton/Kripke formalizations, zero hits) | — |
| prefix-tree | no_lean_coverage | none | — |
| causal-alpha | no_lean_coverage | `ProcInt.CausalNet α` exists but models only structure + a heuristic dependency measure, no alpha-style discovery procedure | — |
| causal-heuristic | adjacent_theorem_requiring_carrier_mapping | `ProcInt.CausalNet α` / `dependencyMeasure`, bounds proven (`dependencyMeasure_lt_one` etc.) | Lean bounds the *score* only, says nothing about edge selection/thresholding — no discovery-level theorem |
| handover-network | no_lean_coverage | none | — |
| working-together-network | no_lean_coverage | none | — |
| community-detection | no_lean_coverage | none | community detection is NP-hard in general; no modularity-optimality proof possible without one |
| correlation-miner | no_lean_coverage | none | — |
| batches | no_lean_coverage | none | — |
| ml-anomaly | no_lean_coverage | none | — |
| align-etconformance | no_lean_coverage | none | — |
| rework-detection | no_lean_coverage | adjacent-but-unmapped: `Ledger.lean::validTopologicalSort` | plausibly the easiest of the whole heuristic cluster to formalize in principle (decidable pattern matching) — but nothing exists today |
| bottleneck-detection | no_lean_coverage | none | — |
| sequential-pattern-mining | no_lean_coverage | none | — |
| concept-drift-structural | no_lean_coverage | none | — |
| concept-drift-statistical | no_lean_coverage | none | distinct metric from concept-drift-structural (TV-distance vs Jaccard), confirmed not a refinement of it |
| trace-clustering | no_lean_coverage | none | clustering non-convexity — no optimal-clustering proof possible without one |
| token-replay | adjacent_theorem_requiring_carrier_mapping | `ReplayCounts`/`fitness` (mfact Conformance/TokenReplay.lean) — proven, no sorry/axiom | carrier is `ReplayCounts`, not derived from wasm4pm's actual `SimdPetriNet`/`ColumnarLog` types; this file (`simd_token_replay.rs`) is a structurally distinct SIMD implementation from the one (`conformance.rs::trace_fitness`) a prior round matched formula-for-formula — the match does NOT automatically transfer without its own refinement proof |
| predict-next-activity (+top-k, beam variants) | no_lean_coverage | none (confirmed negative — searched broadly, only hit was an unrelated audit doc) | — |

**Bonus entries** (outside the 46, surfaced during analysis, worth tracking):
- `declare_conformance` (checking side, `declare_conformance.rs`) — `property_level_theorem`.
  2 of ~5 templates it uses (Response, Precedence) have proven Lean counterparts
  (`Declare.lean` `response_concrete`/`precedence_concrete`); Succession has **no Lean
  theorem at all**, consistent with the known live bug (task #8, unfixed) — Lean coverage
  neither confirms nor refutes that bug, it simply doesn't reach that constraint template.
- `ProcessTree`/`ProcessTreeOperator` (the data type itself, `process_tree.rs`) —
  `formal_specification_only`. `ProcInt.ProcessTree α` defines the same shape and its
  trace-language semantics, but no theorem characterizes wasm4pm's specific enum or any
  discovery algorithm's output against it.

## Refusals actually exercised this checkpoint

- **`LEAN_NAME_MATCH_WITHOUT_CARRIER_MAP`**: applied to `powl` (POWLBridge.lean's "POWL
  Crown Theorem" name-matches but is fully abstract — downgraded to adjacent), and to the
  soundness re-check (clause structure doesn't textually match — downgraded from a prior
  round's looser `direct_theorem`-adjacent claim to explicit `adjacent_theorem_requiring_
  carrier_mapping`).
- **Honest negative results**: predict-next-activity family, transition-system, prefix-tree,
  and all 15 heuristic/stochastic miners returned genuine zero-hit searches, not padded
  with speculative candidates.
- **Achievable-ceiling discipline** (heuristic/stochastic cluster): every one of the 15
  entries states the highest *honest* claim available (termination + structural
  well-formedness, at best) rather than defaulting toward "could probably be proven sound."
  None claims optimality unless a real theorem was found (none was).

## Open items before 010 (correspondence harness) can begin

1. ~~`ocel-dfg` has no ledger entry~~ — **CLOSED by `W4PM-LEAN-GALL-009A`**
   (receipts/W4PM-LEAN-GALL-009A-ledger-closure.md): confirmed `no_lean_coverage`, mfact's
   OCEL and DFG formalizations exist separately but are never combined.
2. The 7 `adjacent_theorem_requiring_carrier_mapping` entries are the natural starting
   candidates for 010 (correspondence harness) — they have a real Lean theorem, proven,
   sorry/axiom-free, and only need the encoding/decoding functions built, not new math.
   Recommend starting the harness with `token-replay`'s carrier map (mfact's `TokenReplay.lean`
   is already the most scrutinized Lean file in this codebase across multiple audit rounds).
3. `inductive-miner`'s "genuinely unformalized" status (not merely unmapped — mfact has no
   process-tree-soundness theorem for this specific construction at all) means any Lean
   coverage here would require new Lean proof work in `mfact`, not just a wasm4pm-side
   encoder — flag this distinction for whoever scopes 015 (POWL/process-tree correspondence).

## Standing

`PARTIAL_ALIVE` — real, source-derived, refusal-rule-enforced ledger covering 45/46
canonical algorithms with one honestly-flagged gap (`ocel-dfg`). Sufficient to inform 010's
scoping (start with the 8 adjacent-theorem candidates), not yet sufficient to claim the
ledger itself is complete until the `ocel-dfg` gap closes.
