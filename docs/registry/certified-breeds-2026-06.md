# Certified Breeds — Periodic Table of Reason
**Registry Date:** 2026-06-10
**Registry ID:** CertifiedRegistry_2026_06

---

## Admission Standard

A breed is **ADMITTED** when it satisfies all six criteria:

1. **Schema** — a validated BreedInput/BreedOutput contract in `@wasm4pm/contracts`
2. **Tests** — passing unit tests covering all declared fields
3. **Negative tests** — at least one test that verifies rejection of malformed or out-of-contract input
4. **OCEL model** — an object-centric event log model proving lawful execution history
5. **Receipt schema** — a signed BLAKE3 receipt emitted to `.wasm4pm/receipts/latest.json` with non-empty `input_hash` and `output_hash`
6. **Deterministic replay** — same input → bit-exact output across all runs (seed all RNG, sort HashMap iteration)

Failing any one criterion means the breed is NOT ADMITTED regardless of how much logic exists.

---

## Status Vocabulary

| Status | Meaning |
|---|---|
| **ADMITTED** | All six admission criteria satisfied. Production-eligible. |
| **PARTIAL_ALIVE** | Rust/WASM implementation exists and runs. Missing one or more of: L1 OCEL model, signed receipt schema, negative tests. Not production-eligible. |
| **UNSUPPORTED** | No implementation. Schema, tests, and receipts all absent. Placeholder only. |
| **DEPRECATED** | Previously implemented, now removed or superseded. |

---

## Implemented & ADMITTED Breeds (39 breeds)

These 39 breeds have a fully verified Rust/WASM implementation, including L0 + L1 spans, OCPN models, and deterministic replay at fitness = 1.0.

| # | Breed ID | Name | Category | Status | Details / Evidence |
|---|---|---|---|---|---|
| 1 | `ltl_monitor` | LTL Monitor | Temporal / Logic | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 2 | `allen_temporal` | Allen Temporal | Temporal / Logic | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 3 | `fuzzy_logic` | Fuzzy Logic | Uncertain Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 4 | `bayesian_network` | Bayesian Network | Uncertain Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 5 | `csp_ac3` | CSP AC3 | Constraint Satisfaction | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 6 | `default_logic` | Default Logic | Non-monotonic Logic | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 7 | `htn_planning` | HTN Planning | Planning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 8 | `dempster_shafer` | Dempster Shafer | Uncertain Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 9 | `frames_inheritance` | Frames Inheritance | Knowledge Representation | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 10 | `ebl` | EBL | Machine Learning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 11 | `asp` | ASP | Answer Set Programming | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 12 | `description_logic` | Description Logic | Description Logic | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 13 | `abductive_lp` | Abductive LP | Abductive Logic Programming | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 14 | `abductive_ibe` | Abductive IBE | Abductive Inference | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 15 | `partial_order_plan` | Partial Order Plan | Planning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 16 | `event_calculus` | Event Calculus | Temporal Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 17 | `mdp` | MDP | Decision Theory | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 18 | `version_space` | Version Space | Machine Learning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 19 | `belief_merging` | Belief Merging | Knowledge Representation | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 20 | `qualitative_reason` | Qualitative Reason | Qualitative Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 21 | `script_sam` | Script SAM | Knowledge Representation | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 22 | `clp` | CLP | Constraint Logic Programming | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 23 | `situation_calculus` | Situation Calculus | Temporal Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 24 | `circumscription` | Circumscription | Non-monotonic Logic | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 25 | `analogy_sme` | Analogy SME | Analogical Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 26 | `act_r` | ACT-R | Cognitive Architecture | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 27 | `problog` | Problog | Probabilistic Logic | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 28 | `sat_cdcl` | SAT CDCL | Boolean Satisfiability | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 29 | `episodic_memory` | Episodic Memory | Cognitive / Memory | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 30 | `rl_symbolic` | RL Symbolic | Reinforcement Learning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 31 | `ctl_check` | CTL Check | Model Checking | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 32 | `ilp` | ILP | Inductive Logic Programming | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 33 | `naive_physics` | Naive Physics | Qualitative Reasoning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 34 | `tableaux` | Tableaux | Theorem Proving | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 35 | `construction_grammar` | Construction Grammar | Cognitive Linguistics | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 36 | `markov_logic` | Markov Logic | Probabilistic Logic | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 37 | `pomdp` | POMDP | Decision Theory | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 38 | `contingent_plan` | Contingent Plan | Planning | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 39 | `meta_reasoning` | Meta Reasoning | Cognitive Systems | ADMITTED | v26.6.10 (7a18553): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |

---

## Classic / Autoinstinct Reason Systems (13 breeds)

These 13 classic reasoning systems are currently listed as `PARTIAL_ALIVE` under version `v26.6.10`.

| # | Breed ID | Name | Category / Tier | Status | Gap to ADMITTED |
|---|---|---|---|---|---|
| 1 | `eliza` | ELIZA | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 2 | `cbr` | CBR | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 3 | `dendral` | DENDRAL | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 4 | `strips` | STRIPS | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 5 | `prolog` | Prolog | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 6 | `mycin` | MYCIN | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 7 | `gps` | GPS | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 8 | `soar` | SOAR | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 9 | `hearsay` | HEARSAY-II | R_historical | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 10 | `autoinstinct_neurosis` | Vision / Neurosis | R_autonomic | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 11 | `autoinstinct_semantics` | Semantics | R_autonomic | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 12 | `autoinstinct_vision` | Vision | R_autonomic | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |
| 13 | `autoinstinct_learning` | Learning | R_autonomic | PARTIAL_ALIVE | Suspended from ADMITTED status in v26.6.10; pending OCPN realignment |

**Registry totals:** 39 implemented (39 ADMITTED, 13 PARTIAL_ALIVE) | 52 total defined

---

## Admission Roadmap

To advance any PARTIAL_ALIVE breed to ADMITTED, the following work items must be completed per breed:

1. Author an L1 OCEL model (`docs/ocel/<breed>-model.json`) capturing the lawful object lifecycle for a single breed execution.
2. Implement the receipt schema extension in `@wasm4pm/contracts` — `input_hash` and `output_hash` must be non-empty strings in every receipt.
3. Add at least one negative test that verifies the breed rejects a malformed contract payload.
4. Verify deterministic replay: run the breed twice with identical input and assert bit-exact output equality.
5. Update this registry entry to ADMITTED once all six criteria pass in CI.

**Next review date:** 2026-07-01
