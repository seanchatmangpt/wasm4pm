# Classical Discovery Algorithms — Historical Lineage

*Generated 2026-05-30 — static knowledge base, no network calls.*

Source hierarchy: peer-reviewed conf/journal > standard > PhD thesis > book > arXiv preprint.

Coverage kinds: `direct` | `derived` | `engineering` | `consumer-contract` | `future`

---

## `dfg`

**Formal object:** Directly-Follows Graph: weighted directed graph of activity pair frequencies
**coverage_kind:** `direct`
**confidence:** `medium`
**first_known:** `van_der_aalst_2016_process_mining`
**first_peer_reviewed:** `van_der_aalst_2016_process_mining`
**canonical:** `van_der_aalst_2016_process_mining`

**Notes:**
- DFG as a named, formally defined concept is in the 2016 book.
- Frequency-based directly-follows relation appears in earlier discovery papers implicitly.

---

## `process_skeleton`

**Formal object:** Process skeleton: compressed DFG retaining only high-frequency paths
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering variant of DFG; no canonical PM paper defines 'process skeleton' by this name.

---

## `optimized_dfg`

**Formal object:** Optimized DFG with improved memory layout for large logs
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering optimization; no PM paper defines this variant.

---

## `hierarchical_dfg`

**Formal object:** Hierarchical DFG with activity abstraction levels
**coverage_kind:** `engineering`
**confidence:** `engineering_only`

**Notes:**
- Engineering extension; hierarchical abstraction in PM exists (e.g., Günther & van der Aalst) but not under this name.

---

## `alpha_plus_plus`

**Formal object:** Alpha++ algorithm: Petri net discovery handling short loops and non-free-choice constructs
**coverage_kind:** `direct`
**confidence:** `medium`
**first_known:** `van_der_aalst_weijters_maruster_2004`
**first_peer_reviewed:** `wen_et_al_alpha_pp_2007`
**canonical:** `wen_et_al_alpha_pp_2007`

**Notes:**
- Alpha (original): van der Aalst, Weijters, Maruster — IEEE TKDE 2004.
- Alpha+: handles length-1 and length-2 loops (de Medeiros et al.).
- Alpha++: Wen, van der Aalst, Wang, Sun 2007 — handles non-free-choice constructs.
- Distinct papers; do not conflate Alpha, Alpha+, Alpha++.

---

## `heuristic_miner`

**Formal object:** Heuristics net: dependency graph discovery via frequency/dependency thresholds
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `weijters_van_der_aalst_2003`
**first_peer_reviewed:** `weijters_van_der_aalst_2003`
**canonical:** `weijters_van_der_aalst_2003`

**Notes:**
- Weijters & van der Aalst, CogSci 2003 / Integrated Computer-Aided Engineering 2003.
- Heuristics Miner extended in Weijters, van der Aalst, de Medeiros 2006 technical report.
- Implementation uses dependency_threshold parameter; 0.2–0.4 for real logs.

---

## `inductive_miner`

**Formal object:** Block-structured process tree via recursive log splitting (cut detection: sequence, choice, parallel, loop)
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `leemans_fahland_van_der_aalst_2013_constructive`
**first_peer_reviewed:** `leemans_fahland_van_der_aalst_2013_constructive`
**canonical:** `leemans_fahland_van_der_aalst_2013_constructive`, `leemans_fahland_van_der_aalst_2014_incomplete`

**Notes:**
- IM (2013, Petri Nets): guarantees sound, block-structured process tree.
- IM-incomplete (2014, Petri Nets): handles incomplete event logs.
- Multiple variants: IM, IMf (filtering), IMc (completeness). Confirm which is implemented.

---

## `ilp`

**Formal object:** — (not in known database)
**coverage_kind:** `unknown`
**confidence:** `not_found`
**recommended_action:** research_more

---

## `hill_climbing`

**Formal object:** Hill-climbing local search over Petri net structure space
**coverage_kind:** `derived`
**confidence:** `low`

**Notes:**
- General hill-climbing is classical (no single PM paper defines this).
- PM application: part of multi-start local search in genetic/hybrid discovery papers.
- No accepted PM-specific hill-climbing paper found; classify as derived (local search family).

---

## `simulated_annealing`

**Formal object:** Simulated annealing over Petri net structure space for process discovery
**coverage_kind:** `derived`
**confidence:** `low`
**first_known:** `kirkpatrick_gelatt_vecchi_1983`
**canonical:** `kirkpatrick_gelatt_vecchi_1983`

**Notes:**
- Generic SA origin: Kirkpatrick, Gelatt, Vecchi 1983 (Science).
- No accepted PM-specific SA discovery paper found.
- Classify as derived: SA adapted for Petri net discovery.

---

## `genetic_algorithm`

**Formal object:** Genetic algorithm for Petri net structure discovery from event logs
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `de_medeiros_et_al_2007_genetic`
**first_peer_reviewed:** `de_medeiros_et_al_2007_genetic`
**canonical:** `de_medeiros_et_al_2007_genetic`

**Notes:**
- de Medeiros, van Dongen, van der Aalst, Weijters — Genetic Process Mining. BPM 2007 / IEEE TKDE.
- Earlier: de Medeiros et al. 'Process Mining: Extending the Alpha-Algorithm to Mine Short Loops' 2004.
- Two separate ACO implementations in wasm4pm (discover_ant_colony vs discover_aco_algorithm).

---

## `aco`

**Formal object:** Ant colony optimization adapted for Petri net discovery
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `de_medeiros_et_al_2007_genetic`
**first_peer_reviewed:** `de_medeiros_et_al_2007_genetic`
**canonical:** `de_medeiros_et_al_2007_genetic`

**Notes:**
- ACO for PM: part of the genetic process mining family (de Medeiros et al.).
- Generic ACO origin: Dorigo & Gambardella 1997.
- WARNING: wasm4pm has two ACO implementations with different parameter names.

---

## `pso`

**Formal object:** Particle Swarm Optimization adapted for Petri net structure discovery
**coverage_kind:** `engineering`
**confidence:** `engineering_only`
**first_known:** `kennedy_eberhart_1995`

**Notes:**
- Generic PSO origin: Kennedy & Eberhart, ICNN 1995.
- No accepted PM-specific PSO paper found. Classify as engineering_only.

---

## `a_star`

**Formal object:** A*-based optimal alignment search on synchronous product automaton
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `adriansyah_2014_phd`
**first_peer_reviewed:** `adriansyah_munoz_gama_carmona_2011`
**canonical:** `adriansyah_2014_phd`

**Notes:**
- Alignment A* is part of the Adriansyah conformance checking work (not a discovery algorithm).
- First conference paper: Adriansyah, Munoz-Gama, Carmona, BPI 2011 workshop.
- PhD thesis (2014): full formalization and optimizations.

---

## `causal_graph`

**Formal object:** Causal graph: dependency graph with causal direction inference from event logs
**coverage_kind:** `derived`
**confidence:** `low`

**Notes:**
- Causal structure in event logs: related to Heuristics Miner and cause-effect nets.
- No single canonical PM paper for 'causal graph' by this name.

---

## `correlation_miner`

**Formal object:** Correlation Miner: discovery without case IDs using event correlation
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `pourmirza_et_al_2017`
**first_peer_reviewed:** `pourmirza_et_al_2017`
**canonical:** `pourmirza_et_al_2017`

**Notes:**
- Pourmirza, Peters, Dijkman, Grefen — Correlation Miner. IEEE TSC 2017.
- Discovers process models from event logs without case IDs.

---

