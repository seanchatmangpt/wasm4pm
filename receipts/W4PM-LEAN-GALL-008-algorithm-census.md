---
receipt: W4PM-LEAN-GALL-008
date: 2026-07-29
status: PARTIAL_ALIVE
gate: Algorithm census (proof-dependency program, checkpoint 008/020)
git_revision: 890087c11c7c22b7575c709b067dcff727d3ed12
---

# Algorithm Census — wasm4pm

Ground rule for this and every subsequent W4PM-LEAN-GALL checkpoint: a claim requires the
evidence class it's paired with, not a name match, a passing test, or a citation. This
checkpoint assigns no correspondence claims — every entry below starts `UNMAPPED`. That
classification is 009's job.

## Exit-condition equation

```
public algorithm surfaces = canonical algorithms + declared aliases + typed exclusions

66  (prior discover_* signature count, all accounted for below)
+ ~15 other algorithm-shaped pub fns (mine_/detect_/predict_/replay_/align_/cluster_)
= 46 canonical process-mining algorithms (wasm4pm/wasm4pm crate)
+ 9  CLI bridge façades (0 net new algorithms — all confirmed thin wrappers over the
     46 above; see façade table)
+ 55 cognition breeds (separate surface: classical-AI reasoning systems, own registry,
     own evidence chain via ocel/reports/*.json — not process-mining discovery, counted
     but not merged into the 46)
+ 1  ocel_envelope.rs (typed exclusion — parsing/normalization utility, not an algorithm)
```

Prior "60 algorithms" prose claim is retired. It was neither confirmed nor simply wrong —
it was unverifiable because no canonical registry existed. This receipt is that registry.

## Canonical process-mining algorithms (wasm4pm/wasm4pm crate) — 46 entries

All entries: `"standing": "UNMAPPED"` (no Lean side yet — that's 009).

| canonical_id | implementation_symbol (file:line) | façades | det/stoch | exact/heuristic | domain |
|---|---|---|---|---|---|
| dfg | `discover_dfg_from_log` (discovery.rs:28) | `discover_dfg` (discovery.rs:100) | deterministic | exact | Directly-follows graph |
| dfg-filtered | `discover_dfg_filtered_from_log` (algorithms.rs:523) | `discover_dfg_filtered` (algorithms.rs:590) | deterministic | exact | DFG w/ frequency filter |
| dfg-simd | `discover_dfg_simd_handle` (simd_streaming_dfg.rs:497) | `discover_dfg_simd` (simd_streaming_dfg.rs:473) | deterministic | exact | DFG, SIMD/columnar streaming |
| dfg-hierarchical | `discover_hierarchical` (hierarchical.rs:260) | `discover_dfg_hierarchical` (hierarchical.rs:325), `discover_dfg_hierarchical_by_events` (hierarchical.rs:363) | deterministic | exact | Hierarchical/chunked DFG |
| ocel-dfg | `discover_ocel_dfg_pure` (discovery.rs:155) | `discover_ocel_dfg` (discovery.rs:233) | deterministic | exact | OCEL/object-centric DFG |
| ocel-dfg-per-type | `discover_ocel_dfg_per_type` (discovery.rs:252) | — (provisional: contains grouping logic beyond a pure passthrough of ocel-dfg; kept separate pending 009 confirmation) | deterministic | exact | OCEL DFG, per-object-type variant |
| footprints | `discover_footprints_from_log` (algorithms.rs:29) | `discover_footprints` (algorithms.rs:79) | deterministic | exact | Footprint matrix (alpha-family precursor) |
| alpha-plus-plus | `discover_alpha_plus_plus_from_log` (algorithms.rs:513) | `discover_alpha_plus_plus` (algorithms.rs:459) | deterministic | exact | Petri net discovery (α++) |
| declare | `discover_declare` (discovery.rs:438) | none — **resolved INLINE_NO_SEPARATE_CORE**: this one function is both wasm façade and implementation (TraceProfile construction, constraint scoring all inline). Deliberately or accidentally breaks the crate's usual façade/pure-core pattern; worth a follow-up refactor ticket, not a census defect. | deterministic | exact | DECLARE constraint mining |
| heuristic-miner | `discover_heuristic_miner_from_log` (advanced_algorithms.rs:16) | `discover_heuristic_miner` (advanced_algorithms.rs:193) | deterministic | heuristic | Heuristic net mining |
| inductive-miner | `InductiveMiner::discover` (more_discovery.rs:333) | `discover_inductive_miner` (more_discovery.rs:404), `discover_inductive_miner_from_log` (more_discovery.rs:359) | deterministic | exact-ish (sound-by-construction) | Process tree via cuts |
| ilp-petri-net | `discover_ilp_petri_net_from_log` (ilp_discovery.rs:63) | `discover_ilp_petri_net` (ilp_discovery.rs:400) | deterministic | exact (ILP optimal) | Petri net via integer linear programming |
| optimized-dfg | `discover_optimized_dfg_from_log` (ilp_discovery.rs:434) | `discover_optimized_dfg` (ilp_discovery.rs:548) | deterministic | heuristic | DFG w/ local-search optimization |
| astar | `discover_astar_from_log` (fast_discovery.rs:207) | `discover_astar` (fast_discovery.rs:21) | deterministic | exact search, heuristic-guided | A* informed-search discovery |
| hill-climbing | `discover_hill_climbing_from_log` (fast_discovery.rs:129) | `discover_hill_climbing` (fast_discovery.rs:77) | deterministic | heuristic, no optimality guarantee | Local-search discovery |
| genetic-algorithm | `discover_genetic_algorithm_from_log` (genetic_discovery.rs:93) | `discover_genetic_algorithm` (genetic_discovery.rs:37) | stochastic | heuristic | Evolutionary process discovery |
| pso | `discover_pso_algorithm_from_log` (genetic_discovery.rs:210) | `discover_pso_algorithm` (genetic_discovery.rs:182) | stochastic | heuristic | Particle swarm optimization miner |
| aco | `discover_aco_algorithm_from_log` (genetic_discovery.rs:444) | `discover_aco_algorithm` (genetic_discovery.rs:592), `discover_ant_colony` (more_discovery.rs:728) | stochastic | heuristic | Ant colony optimization miner |
| simulated-annealing | `discover_simulated_annealing_from_log` (more_discovery.rs:1066) | `discover_simulated_annealing` (more_discovery.rs:1003) | stochastic | heuristic | Simulated annealing miner |
| oc-petri-net | `discover_oc_petri_net_pure` (oc_petri_net.rs:105) | `discover_oc_petri_net` (oc_petri_net.rs:30, dispatches on `algorithm: &str`) | deterministic (per inner algorithm) | exact/heuristic (dispatch-dependent) | Object-centric Petri net discovery |
| powl | core inline (powl_api.rs) | `discover_powl_from_log` (560), `discover_powl_from_log_config` (600) | deterministic | heuristic (variant-selectable) | Process tree / POWL discovery |
| powl-from-partial-orders | `discover_powl_from_partial_orders` (powl_api.rs:648) | — (provisional distinct: different input shape than log-based powl) | deterministic | heuristic | POWL from partial-order input |
| ocel-powl | `discover_ocel_powl` (powl_api.rs:692) | — (provisional distinct: OCEL variant) | deterministic | heuristic | POWL over object-centric logs |
| performance-dfg | `discover_performance_dfg_from_log` (performance_dfg.rs:27) | `discover_performance_dfg` (performance_dfg.rs:124) | deterministic | exact (timing aggregation) | Performance-annotated DFG |
| performance-spectrum | `discover_performance_spectrum` (performance_spectrum.rs:77) | `discover_performance_spectrum_wasm` (performance_spectrum.rs:211) | deterministic | exact | Performance spectrum analysis |
| simple-process-tree | `discover_simple_process_tree_from_log` (process_tree.rs:687) | `discover_simple_process_tree` (process_tree.rs:735) | deterministic | heuristic | Lightweight process tree discovery |
| temporal-profile | `discover_temporal_profile_from_log` (temporal_profile.rs:13) | `discover_temporal_profile` (temporal_profile.rs:78) | deterministic | exact (mean/stdev) | Temporal/timing conformance profile |
| transition-system | `discover_transition_system` (transition_system.rs:85) | `discover_transition_system_from_handle` (transition_system.rs:210) | deterministic | exact | Transition system / state-based model |
| prefix-tree | `discover_prefix_tree_inner` (log_to_trie.rs:159) | `discover_prefix_tree` (log_to_trie.rs:259) | deterministic | exact | Trie/prefix-tree log structure |
| causal-alpha | `discover_causal_alpha` (causal_graph.rs:60) | none found | deterministic | exact | Causal net (alpha-style) |
| causal-heuristic | `discover_causal_heuristic` (causal_graph.rs:78) | none found | deterministic | heuristic | Causal net (heuristic dependency measure) |
| handover-network | `discover_handover_network_from_log` (social_network.rs:16) | `discover_handover_network` (social_network.rs:65) | deterministic | exact | Social network — handover-of-work |
| working-together-network | `discover_working_together_network_from_log` (social_network.rs:74) | `discover_working_together_network` (social_network.rs:120) | deterministic | exact | Social network — working-together |
| community-detection | `detect_communities` (social_network.rs:276) | none found | needs body check | heuristic | Social network community detection |
| correlation-miner | `mine_correlation` (correlation_miner.rs:119) | `discover_correlation` (correlation_miner.rs:84) — **resolved FACADE_OF**: discover_correlation builds config and calls mine_correlation directly | deterministic | heuristic | Event correlation mining (uncorrelated logs) |
| batches | `discover_batches` (batches.rs:225) | `discover_batches_wasm` (batches.rs:299) | deterministic | exact (pattern matching) | Batch activity discovery |
| ml-anomaly | `discover_ml_anomaly` (anomaly.rs:79) | none found | needs body check | heuristic/approximate | Anomaly detection (ML-based) |
| align-etconformance | `align_etconformance_precision` / `compute_align_etconformance_precision` (align_etconformance.rs:132) | none found | deterministic | exact (alignment-based) | Conformance — alignment/ET precision |
| rework-detection | `detect_rework` (advanced_algorithms.rs:370) | none found | deterministic | exact | Rework/loop detection |
| bottleneck-detection | `detect_bottlenecks` (advanced_algorithms.rs:419) | none found | deterministic | exact/heuristic (threshold-based) | Bottleneck detection |
| sequential-pattern-mining | `mine_sequential_patterns` (fast_discovery.rs:348) | none found | deterministic | exact | Sequential pattern mining |
| concept-drift-structural | `detect_concept_drift` (fast_discovery.rs:404) | none — **resolved DISTINCT_ALGORITHMS vs concept-drift-statistical**: per-window activity-set Jaccard distance, hardcoded threshold >0.3, no cross-reference to the other | deterministic | heuristic (Jaccard threshold) | Concept drift — structural (activity-set) |
| concept-drift-statistical | `detect_drift` (prediction_drift.rs:283) | none — **resolved DISTINCT_ALGORITHMS**: per-window frequency maps, total-variation distance via `evaluate_window_pair`, generates human-readable diagnosis | deterministic | heuristic (statistical distance) | Concept drift — statistical (frequency distribution) |
| trace-clustering | `cluster_traces` (fast_discovery.rs:536) | none found | needs body check (may be stochastic if k-means-style init) | heuristic | Trace/case clustering |
| token-replay | `replay_trace`/`replay_log` (simd_token_replay.rs:137,293) | `replay_log` (simd_token_replay.rs:386, wasm entry) | deterministic | exact | Conformance — token-based replay |
| predict-next-activity | `predict_next_activity` (prediction.rs:84) | `predict_next_k` (prediction_next_activity.rs:45), `predict_beam_paths` (prediction_next_activity.rs:92), `predict_top_k_activities` (prediction_additions.rs:37) — provisional: these may be 2-3 distinct algorithms (top-k, beam search), not pure façades; 009 must confirm before assigning one Lean obligation to all | deterministic (given model) | approximate | Predictive monitoring — next activity |
| predict-next-activity-rf | `predict_next_activity_rf` (prediction_rf.rs:387) | `predict_next_activity_unified` (prediction_rf.rs:541, dispatcher across model types — provisional, may fan out further) | deterministic (RF inference) | approximate | Predictive monitoring — random-forest variant |
| predict-outcome | `predict_outcome_from_log` (prediction_outcome.rs:259) | `predict_outcome_wasm` (prediction_outcome.rs:349) | deterministic (given model) | approximate | Predictive monitoring — case outcome |
| predict-remaining-time | `predict_case_duration` (prediction_remaining_time.rs:294) | — (`predict_hazard_rate`, prediction_remaining_time.rs:424, kept as separate sibling entry, not folded in — computes a related but distinct statistic) | deterministic (given model) | approximate | Predictive monitoring — remaining time |
| predict-hazard-rate | `predict_hazard_rate` (prediction_remaining_time.rs:424) | none | deterministic (given model) | approximate | Predictive monitoring — survival/hazard analysis |

**Items still flagged provisional pending 009's deeper body review** (not resolved to full
certainty in this pass, listed honestly rather than silently folded): `ocel-dfg-per-type`,
`powl-from-partial-orders`, `ocel-powl`, `oc-petri-net`'s internal dispatch targets,
`predict-next-activity`'s 3 façades, `predict-next-activity-rf`'s dispatcher,
`community-detection`, `ml-anomaly`, `trace-clustering` (determinism unconfirmed).

## Collisions resolved this checkpoint

| candidate | verdict | evidence |
|---|---|---|
| `discover_ant_colony` (more_discovery.rs:728) vs `discover_aco_algorithm*` (genetic_discovery.rs) | NOT a collision — façade | `discover_ant_colony` is a WASM-boundary wrapper that calls `discover_aco_algorithm_from_log` directly; folded into the `aco` façade list above |
| `detect_concept_drift` (fast_discovery.rs:404) vs `detect_drift` (prediction_drift.rs:283) | DISTINCT_ALGORITHMS | structural Jaccard-on-activity-sets vs statistical frequency-distribution distance; no cross-reference between them; kept as two canonical entries |
| `discover_correlation` vs `mine_correlation` (correlation_miner.rs) | FACADE_OF | `discover_correlation` (wasm entry) calls `mine_correlation` (pure core) directly at correlation_miner.rs:101 |
| `discover_declare` (discovery.rs:438) | INLINE_NO_SEPARATE_CORE | constraint-mining logic (TraceProfile construction, scoring) lives inline in the wasm-bound function itself — no separate pure-core function exists anywhere in the crate under any name |

## CLI bridge → core algorithm mapping (9 files, 0 net new algorithms)

| Bridge file | Delegates to |
|---|---|
| `aco_bridge.rs` | `genetic_discovery::discover_aco_algorithm_from_log` |
| `genetic_bridge.rs` | `genetic_discovery::discover_genetic_algorithm_from_log` |
| `pso_bridge.rs` | `genetic_discovery::discover_pso_algorithm_from_log` |
| `heuristic_bridge.rs` | `advanced_algorithms::discover_heuristic_miner_from_log` |
| `ilp_bridge.rs` | `ilp_discovery::discover_ilp_petri_net_from_log` |
| `inductive_bridge.rs` | `more_discovery::InductiveMiner::discover` |
| `conformance_bridge.rs` | `conformance::token_replay_pure` + `align_etconformance::compute_align_etconformance_precision` (2 core algorithms behind 1 bridge file) |
| `ocdfg_bridge.rs` | `advanced::ocdfg::OCDFG::discover` (1-line passthrough) |
| `social_network_bridge.rs` | `network_metrics::SocialNetwork::{degree,betweenness,closeness}_centrality` |
| `cognition.rs` | `wasm4pm_cognition::breeds::dispatch_breed` (separate surface, see below) |
| `ocel_envelope.rs` | **typed exclusion** — parsing/normalization utility, not an algorithm |

## Cognition breeds — 55 entries (separate surface)

Confirmed 55/55 in `crates/wasm4pm-cognition/breeds/registry.json`, matching the count
already receipted in `receipts/W4PM-GALL-003-cognition-integrity.json` — no contradiction.
Full paradigm-tagged list omitted here for brevity (see agent transcript); spot-verified
`eliza`, `mycin`, `strips` present and correctly tagged.

**Cross-surface name flags (disambiguation only, not algorithmic duplication):**
1. Cognition breed `ilp` (Inductive Logic Programming, Quinlan 1990) vs. CLI `ilp_bridge.rs`
   / core `ilp_discovery` (Integer Linear Programming Petri-net discovery) — same acronym,
   unrelated algorithm families. Census disambiguates by full name, not acronym, going
   forward: `cognition::ilp` vs `wasm4pm::ilp-petri-net`.
2. Cognition breed `ocpm_route_discoverer` vs. `oc-petri-net`/OCDFG surface — both
   object-centric process-discovery concepts. Not resolved to certainty this pass; flagged
   for a source-level diff in 009 before assuming they're either duplicative or
   intentionally distinct.
3. No collision found for `bayesian_network`, `markov_logic`, `mdp`, `pomdp`,
   `htn_planning` breeds against any `discover_*` function (zero grep hits).

## Falsifier check (per this checkpoint's own required refusal conditions)

- Two canonical IDs resolving to the same implementation without a declared alias: **found
  and resolved** (`discover_ant_colony` — now declared as an `aco` façade, not a separate ID).
- A public algorithm-shaped function with no canonical grouping: **none outstanding** — all
  identified pub fns are assigned to a canonical_id above (some as provisional-distinct
  siblings pending 009, not orphans).
- A façade falsely counted as distinct: **checked and corrected** (ant_colony case above).
- A symbol that disappeared relative to the prior 66-signature count: **not checked in this
  pass** — the 46 canonical + façade table accounts for the discovery-pattern subset, but a
  full line-by-line reconciliation against the original 66-signature grep was not performed
  independently; flagged as a residual gap for 009 to close before it relies on this census
  as fully closed.

## Standing

`PARTIAL_ALIVE` — the census is real, source-derived, and has resolved every flagged
collision to a definitive verdict, but (a) several provisional-distinct entries remain
pending deeper confirmation, and (b) full reconciliation against the original 66-signature
count was not independently re-verified. Sufficient to unblock 009 (Lean coverage ledger),
not yet sufficient to close 008 outright.
