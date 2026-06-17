# Cognition Breed Latency — 2026-06-10

Consolidated Criterion median wall-clock per breed `run()` on representative paper-fixture-sized input. Measured on the `periodic/integration` branch (52 PARTIAL_ALIVE breeds) via `cargo bench -p wasm4pm-cognition --bench breed_latency`. Budget: global median ≤ 100µs.

| Tier | Breed | Median | ≤100µs |
|---|---|---|---|
| original (13) | eliza | 3.7514 µs | yes |
| original (13) | cbr | 4.6503 µs | yes |
| original (13) | dendral | 571.51 ns | yes |
| original (13) | strips | 6.4223 µs | yes |
| original (13) | prolog | 7.9576 µs | yes |
| original (13) | mycin | 2.2184 µs | yes |
| original (13) | gps | 962.72 ns | yes |
| original (13) | soar | 1.1449 µs | yes |
| original (13) | hearsay | 1.2692 µs | yes |
| original (13) | autoinstinct_vision | 1.086 µs | yes |
| original (13) | autoinstinct_semantics | 842.39 ns | yes |
| original (13) | autoinstinct_neurosis | 2.7922 µs | yes |
| original (13) | autoinstinct_learning | 632.27 ns | yes |
| P1 (10) | ltl_monitor | 4.1094 µs | yes |
| P1 (10) | allen_temporal | 4.8987 µs | yes |
| P1 (10) | fuzzy_logic | 3.4048 µs | yes |
| P1 (10) | bayesian_network | 6.9666 µs | yes |
| P1 (10) | csp_ac3 | 28.828 µs | yes |
| P1 (10) | default_logic | 2.0788 µs | yes |
| P1 (10) | htn_planning | 2.7153 µs | yes |
| P1 (10) | dempster_shafer | 2.789 µs | yes |
| P1 (10) | frames_inheritance | 2.0011 µs | yes |
| P1 (10) | ebl | 10.065 µs | yes |
| P2 (12) | asp | 8.2938 µs | yes |
| P2 (12) | description_logic | 7.9667 µs | yes |
| P2 (12) | abductive_lp | 4.3979 µs | yes |
| P2 (12) | abductive_ibe | 2.8265 µs | yes |
| P2 (12) | partial_order_plan | 6.4389 µs | yes |
| P2 (12) | event_calculus | 1.7721 µs | yes |
| P2 (12) | mdp | 3.9549 µs | yes |
| P2 (12) | version_space | 9.3401 µs | yes |
| P2 (12) | belief_merging | 3.8297 µs | yes |
| P2 (12) | qualitative_reason | 3.5955 µs | yes |
| P2 (12) | script_sam | 1.8916 µs | yes |
| P2 (12) | clp | 11.48 µs | yes |
| P3 (11) | situation_calculus | 2.6194 µs | yes |
| P3 (11) | circumscription | 2.1332 µs | yes |
| P3 (11) | analogy_sme | 5.4381 µs | yes |
| P3 (11) | act_r | 1.7877 µs | yes |
| P3 (11) | problog | 3.3612 µs | yes |
| P3 (11) | sat_cdcl | 3.7061 µs | yes |
| P3 (11) | episodic_memory | 3.2108 µs | yes |
| P3 (11) | rl_symbolic | 37.54 µs | yes |
| P3 (11) | ctl_check | 2.635 µs | yes |
| P3 (11) | ilp | 11.501 µs | yes |
| P3 (11) | naive_physics | 2.0771 µs | yes |
| P4 (6) | tableaux | 5.7591 µs | yes |
| P4 (6) | construction_grammar | 4.8414 µs | yes |
| P4 (6) | markov_logic | 5.3748 µs | yes |
| P4 (6) | pomdp | 61.315 µs (PRD POMDP budget is 50–300µs; global ≤100µs held via PBVI structural caps — see docs/breeds/pomdp.md) | yes |
| P4 (6) | contingent_plan | 2.8216 µs | yes |
| P4 (6) | meta_reasoning | 2.5318 µs | yes |

**Summary:** 52 breeds measured. Median range 0.572µs – 61.315µs. All ≤ 100µs (slowest: POMDP at 61.315µs, within both the global budget and the PRD 300µs POMDP allowance).
