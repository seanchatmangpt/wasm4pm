# Algorithm and Cognitive Breed Validation Ledger

## Summary

| Category | Total | Closed | Valid | Kernel-Reachable | Fixed | Refactored | Test Added | Blocked | Unsupported |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Algorithms | 60 | 60 | 60 | 29 | 0 | 0 | 0 | 0 | 0 |
| Breeds | 55 | 55 | 55 | 55 | 0 | 0 | 0 | 0 | 0 |
| Total | 115 | 115 | 115 | 84 | 0 | 0 | 0 | 0 | 0 |

## Reachability vs Validity (read this first)

"VALID" in the ledgers below means the algorithm's behavior evidence passed (positive, negative,
and invariant cases) via the internal test path. It does **not** mean the algorithm is reachable
from the product surface. Per `artifacts/release/ALGORITHM_REACHABILITY_EVIDENCE.v26.7.1.json`,
**29 of 60 algorithms are reachable** through kernel dispatch (`packages/kernel/src/api.ts` `runRaw`)
with a present WASM export. The remaining **31 are implemented and behavior-tested but not wired**
to a stable WASM export / kernel dispatch path:

`process_skeleton, pso, a_star, aco, hierarchical_dfg, smart_engine, ml_classify, ml_cluster,
ml_forecast, ml_anomaly, ml_regress, ml_pca, transition_system, log_to_trie, causal_graph,
performance_spectrum, batches, correlation_miner, etconformance_precision, complexity_metrics,
powl_to_process_tree, yawl_export, handover_network, working_together_network, ocel_petri_net,
ocel_encode, ocel_ocla, ocel_oc_declare, predict_outcome, automl_classify, automl_forecast`

All 55 breeds are dispatchable (`wpm cognition run`) with admitted OCEL fitness reports.

## Seeded Algorithm Ledger

|   # | Type      | ID                                 | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Final Status |
| --: | --------- | ---------------------------------- | -- | -- | -- | -- | -- | -- | -- | ------------ |
| 001 | algorithm | a_star                             | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 002 | algorithm | aco                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 003 | algorithm | alpha_plus_plus                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 004 | algorithm | declare                            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 005 | algorithm | dfg                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 006 | algorithm | genetic_algorithm                  | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 007 | algorithm | heuristic_miner                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 008 | algorithm | hill_climbing                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 009 | algorithm | ilp                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 010 | algorithm | inductive_miner                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 011 | algorithm | optimized_dfg                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 012 | algorithm | process_skeleton                   | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 013 | algorithm | pso                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 014 | algorithm | simulated_annealing                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 015 | algorithm | hierarchical_dfg                   | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 016 | algorithm | simd_streaming_dfg                 | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 017 | algorithm | smart_engine                       | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 018 | algorithm | streaming_log                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 019 | algorithm | analyze_process_speedup            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 020 | algorithm | analyze_variant_complexity         | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 021 | algorithm | batches                            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 022 | algorithm | causal_graph                       | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 023 | algorithm | compute_activity_transition_matrix | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 024 | algorithm | compute_trace_similarity_matrix    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 025 | algorithm | correlation_miner                  | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 026 | algorithm | log_to_trie                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 027 | algorithm | performance_spectrum               | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 028 | algorithm | transition_system                  | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 029 | algorithm | alignments                         | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 030 | algorithm | complexity_metrics                 | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 031 | algorithm | etconformance_precision            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 032 | algorithm | generalization                     | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 033 | algorithm | monte_carlo_simulation             | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 034 | algorithm | playout                            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 035 | algorithm | bpmn_import                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 036 | algorithm | pnml_import                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 037 | algorithm | powl_to_process_tree               | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 038 | algorithm | yawl_export                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 039 | algorithm | ocel_dfg                           | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 040 | algorithm | ocel_dfg_per_type                  | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 041 | algorithm | ocel_encode                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 042 | algorithm | ocel_oc_declare                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 043 | algorithm | ocel_ocla                          | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 044 | algorithm | ocel_petri_net                     | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 045 | algorithm | compute_ewma                       | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 046 | algorithm | detect_drift                       | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 047 | algorithm | predict_next_activity              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 048 | algorithm | predict_outcome                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 049 | algorithm | predict_remaining_time             | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 050 | algorithm | automl_classify                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 051 | algorithm | automl_forecast                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 052 | algorithm | ml_anomaly                         | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 053 | algorithm | ml_classify                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 054 | algorithm | ml_cluster                         | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 055 | algorithm | ml_forecast                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 056 | algorithm | ml_pca                             | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 057 | algorithm | ml_regress                         | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 058 | algorithm | handover_network                   | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 059 | algorithm | working_together_network           | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 060 | algorithm | agentic_pipeline                   | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |

## Seeded Cognitive Breed Ledger

|   # | Type  | ID                     | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Final Status |
| --: | ----- | ---------------------- | -- | -- | -- | -- | -- | -- | -- | ------------ |
| 061 | breed     | ltl_monitor                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 062 | breed     | allen_temporal                     | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 063 | breed     | ctl_check                          | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 064 | breed     | event_calculus                     | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 065 | breed     | situation_calculus                 | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 066 | breed     | fuzzy_logic                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 067 | breed     | dempster_shafer                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 068 | breed     | abductive_ibe                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 069 | breed     | bayesian_network                   | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 070 | breed     | problog                            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 071 | breed     | markov_logic                       | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 072 | breed     | htn_planning                       | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 073 | breed     | partial_order_plan                 | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 074 | breed     | contingent_plan                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 075 | breed     | mdp                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 076 | breed     | pomdp                              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 077 | breed     | strips                             | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 078 | breed     | gps                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 079 | breed     | asp                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 080 | breed     | abductive_lp                       | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 081 | breed     | tableaux                           | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 082 | breed     | prolog                             | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 083 | breed     | clp                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 084 | breed     | sat_cdcl                           | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 085 | breed     | csp_ac3                            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 086 | breed     | default_logic                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 087 | breed     | circumscription                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 088 | breed     | frames_inheritance                 | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 089 | breed     | description_logic                  | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 090 | breed     | belief_merging                     | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 091 | breed     | script_sam                         | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 092 | breed     | act_r                              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 093 | breed     | soar                               | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 094 | breed     | episodic_memory                    | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 095 | breed     | ebl                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 096 | breed     | ilp                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 097 | breed     | version_space                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 098 | breed     | analogy_sme                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 099 | breed     | rl_symbolic                        | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 100 | breed     | qualitative_reason                 | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 101 | breed     | naive_physics                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 102 | breed     | triz                               | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 103 | breed     | morphological                      | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 104 | breed     | construction_grammar               | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 105 | breed     | meta_reasoning                     | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 106 | breed     | autoinstinct_learning              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 107 | breed     | autoinstinct_neurosis              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 108 | breed     | autoinstinct_semantics             | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 109 | breed     | autoinstinct_vision                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 110 | breed     | cbr                                | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 111 | breed     | dendral                            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 112 | breed     | eliza                              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 113 | breed     | hearsay                            | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 114 | breed     | mycin                              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |
| 115 | breed     | ocpm_route_discoverer              | L5 | L5 | L5 | L5 | L5 | L5 | L5 | VALID        |

## Evidence Notes and Implementation Locations

All 115 capabilities have been expanded into dedicated validation reports under [reports/capability-validation/](file:///Users/sac/wasm4pm/reports/capability-validation).

Refer to:
- [REPORT_INDEX.md](file:///Users/sac/wasm4pm/reports/capability-validation/REPORT_INDEX.md) for direct links to each report.
- Individual reports for canonical declarations, implementation mapping, actual capabilities, test cases, and cryptographic receipts.
