# Certified Breeds — Periodic Table of Reason
**Registry Date:** 2026-06-10
**Registry ID:** CertifiedRegistry_2026_06

---

## Admission Standard

A breed is **ADMITTED** when it satisfies all eight criteria:

1. **Schema** — a validated BreedInput/BreedOutput contract in `@wasm4pm/contracts`
2. **Tests** — passing unit tests covering all declared fields
3. **Negative tests** — at least one test that verifies rejection of malformed or out-of-contract input
4. **OCEL model** — an object-centric event log model at `ocel/models/l1/<breed>.ocpn.json` proving lawful execution history
5. **Receipt schema** — a signed BLAKE3 receipt emitted to `.wasm4pm/receipts/latest.json` with non-empty `input_hash` and `output_hash`
6. **Deterministic replay** — same input → bit-exact output across all runs (seed all RNG, sort all collections)
7. **Paper-grounded oracle** — a fixture at `tests/fixtures/papers/<breed>.json` asserting the published numeric value with provenance; the test must fail when the computation is tampered
8. **Adversary counter-test** — a per-breed counter-test that verifies the breed rejects fraudulent or out-of-distribution inputs (see `docs/breeds/anti-cheat-threat-model.md`)

Failing any one criterion means the breed is NOT ADMITTED regardless of how much logic exists.

---

## Status Vocabulary

| Status | Meaning |
|---|---|
| **ADMITTED** | All eight admission criteria satisfied. Paper fixture and adversary counter-test confirmed. Production-eligible. |
| **PARTIAL_ALIVE** | Rust/WASM implementation exists and runs. Missing one or more of: L1 OCEL model, signed receipt schema, paper-grounded oracle, adversary counter-test. Not production-eligible. |
| **UNSUPPORTED** | No implementation. Schema, tests, and receipts all absent. Placeholder only. |
| **DEPRECATED** | Previously implemented, now removed or superseded. |

---

## Implemented & ADMITTED Breeds (4 breeds)

These breeds have a fully verified Rust/WASM implementation, including paper-grounded oracle fixtures, adversary counter-tests, and deterministic replay at fitness = 1.0.

| # | Breed ID | Name | Category | Status | Details / Evidence |
|---|---|---|---|---|---|
| 1 | `ctl_check` | CTL Check | Model Checking | ADMITTED | v26.6.10: paper fixture + adversary counter-test + deterministic replay |
| 2 | `ilp` | ILP | Inductive Logic Programming | ADMITTED | v26.6.10: paper fixture + adversary counter-test + deterministic replay |
| 3 | `meta_reasoning` | Meta Reasoning | Cognitive Systems | ADMITTED | v26.6.10: paper fixture + adversary counter-test + deterministic replay |
| 4 | `naive_physics` | Naive Physics | Qualitative Reasoning | ADMITTED | v26.6.10: paper fixture + adversary counter-test + deterministic replay |

---

## PARTIAL_ALIVE Breeds (17 breeds)

These breeds have a running Rust/WASM implementation but have not yet satisfied all eight admission criteria.

| # | Breed ID | Name | Category | Status | Standing | Gap to ADMITTED |
|---|---|---|---|---|---|---|
| 1 | `abductive_ibe` | Abductive IBE | Abductive Inference | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 2 | `abductive_lp` | Abductive LP | Abductive Logic Programming | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 3 | `allen_temporal` | Allen Temporal | Temporal / Logic | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 4 | `analogy_sme` | Analogy SME | Analogical Reasoning | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 5 | `asp` | ASP | Answer Set Programming | PARTIAL_ALIVE | TRACEABLE | Paper fixture + adversary counter-test pending |
| 6 | `autoinstinct_learning` | Learning | R_autonomic | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 7 | `autoinstinct_neurosis` | Vision / Neurosis | R_autonomic | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 8 | `autoinstinct_semantics` | Semantics | R_autonomic | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 9 | `autoinstinct_vision` | Vision | R_autonomic | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 10 | `bayesian_network` | Bayesian Network | Uncertain Reasoning | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 11 | `belief_merging` | Belief Merging | Knowledge Representation | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 12 | `circumscription` | Circumscription | Non-monotonic Logic | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 13 | `clp` | CLP | Constraint Logic Programming | PARTIAL_ALIVE | TRACEABLE | Paper fixture + adversary counter-test pending |
| 14 | `partial_order_plan` | Partial Order Plan | Planning | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 15 | `script_sam` | Script SAM | Knowledge Representation | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 16 | `situation_calculus` | Situation Calculus | Temporal Reasoning | PARTIAL_ALIVE | DISPATCHABLE | Paper fixture + adversary counter-test pending |
| 17 | `abductive_ibe` | Abductive Ibe | Abductive Inference | PARTIAL_ALIVE | TRACEABLE | Paper fixture + adversary counter-test pending |

---

## UNSUPPORTED Breeds (8 breeds)

No Rust/WASM implementation exists for these breeds. They appear in the registry as placeholders.

| # | Breed ID | Name |
|---|---|---|
| 1 | `construction_grammar` | Construction Grammar |
| 2 | `contingent_plan` | Contingent Plan |
| 3 | `markov_logic` | Markov Logic |
| 4 | `morphological` | Morphological |
| 5 | `ocpm_route_discoverer` | OCPM Route Discoverer |
| 6 | `pomdp` | POMDP |
| 7 | `tableaux` | Tableaux |
| 8 | `triz` | TRIZ |

**Registry totals (registry.json):** 4 ADMITTED · 17 PARTIAL_ALIVE · 8 UNSUPPORTED · 29 total registry entries | 55 breeds enumerated in `registration.rs`

---

## Admission Roadmap

To advance any PARTIAL_ALIVE breed to ADMITTED, the following work items must be completed per breed:

1. Author an L1 OCEL model at `ocel/models/l1/<breed>.ocpn.json` capturing the lawful object lifecycle for a single breed execution.
2. Implement the receipt schema extension in `@wasm4pm/contracts` — `input_hash` and `output_hash` must be non-empty strings in every receipt.
3. Add at least one negative test that verifies the breed rejects a malformed contract payload.
4. Verify deterministic replay: run the breed twice with identical input and assert bit-exact output equality.
5. Author a paper-grounded fixture at `tests/fixtures/papers/<breed>.json` asserting the published numeric value with provenance citation; confirm the test fails when the computation is tampered.
6. Add a per-breed adversary counter-test per `docs/breeds/anti-cheat-threat-model.md` (also required for TS fixture parity at `packages/cognition/src/__tests__/fixtures/papers/<breed>.json`).
7. Update the registry entry to ADMITTED once all eight criteria pass in CI (`just ggen-gate`).

**Next review date:** 2026-07-01
