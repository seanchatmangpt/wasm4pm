# Simulation and Social Network Mining — Historical Lineage

*Generated 2026-05-30 — static knowledge base, no network calls.*

Source hierarchy: peer-reviewed conf/journal > standard > PhD thesis > book > arXiv preprint.

Coverage kinds: `direct` | `derived` | `engineering` | `consumer-contract` | `future`

---

## `monte_carlo_simulation`

**Formal object:** Monte Carlo simulation of process execution from stochastic Petri net or process tree
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `rogge_solti_weske_2013`
**first_peer_reviewed:** `rogge_solti_weske_2013`
**canonical:** `rogge_solti_weske_2013`

**Notes:**
- PM simulation: Rogge-Solti & Weske, BPM 2013 (stochastic Petri nets for remaining time).
- Generic Monte Carlo: Metropolis & Ulam 1949 (not PM-specific).
- wasm4pm uses process tree playout with random walk — align with Rogge-Solti family.

---

## `playout`

**Formal object:** Stochastic playout from process model: generates synthetic traces by random walk
**coverage_kind:** `derived`
**confidence:** `medium`
**first_known:** `van_der_aalst_2016_process_mining`
**first_peer_reviewed:** `van_der_aalst_2016_process_mining`
**canonical:** `van_der_aalst_2016_process_mining`

**Notes:**
- Playout formalized in van der Aalst 2016 book (Section 7).
- Known bug: uses unseeded fastrand — non-deterministic output across runs.

---

## `handover_network`

**Formal object:** Handover-of-work social network: edge weight = direct handoffs between resource pairs
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `van_der_aalst_et_al_social_2005`
**first_peer_reviewed:** `van_der_aalst_et_al_social_2005`
**canonical:** `van_der_aalst_et_al_social_2005`

**Notes:**
- van der Aalst, Reijers, Song — JASSS 2005 / Computer Supported Cooperative Work.
- DOI: 10.1007/s10606-005-9005-9.

---

## `working_together_network`

**Formal object:** Working-together social network: edge weight = cases where two resources co-appear
**coverage_kind:** `direct`
**confidence:** `high`
**first_known:** `van_der_aalst_et_al_social_2005`
**first_peer_reviewed:** `van_der_aalst_et_al_social_2005`
**canonical:** `van_der_aalst_et_al_social_2005`

**Notes:**
- Same paper as handover_network (van der Aalst, Reijers, Song 2005).
- Two metrics from one paper: handover-of-work and working-together.

---

