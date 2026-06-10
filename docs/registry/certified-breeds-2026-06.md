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

## Tier R_historical — Foundational AI Reasoning Systems (9 breeds)

These breeds encode the classical AI reasoning paradigms that defined the field from 1965–1995.

| # | Breed | Canonical Reference | Status | Gap to ADMITTED |
|---|---|---|---|---|
| 1 | MYCIN | Rule-based medical diagnosis (Shortliffe, 1976) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 2 | STRIPS | State-space planning (Fikes & Nilsson, 1971) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 3 | SOAR | Unified cognitive architecture (Laird et al., 1987) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 4 | HEARSAY-II | Blackboard architecture (Erman et al., 1980) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 5 | Prolog | Logic programming / SLD resolution (Colmerauer, 1972) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 6 | CBR | Case-based reasoning (Schank, 1982; Kolodner, 1993) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 7 | GPS | General Problem Solver / means-ends analysis (Newell & Simon, 1957) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 8 | DENDRAL | Meta-DENDRAL structural inference (Feigenbaum et al., 1969) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 9 | ELIZA | Pattern-matching dialogue (Weizenbaum, 1966) | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |

**Tier summary:** 9 ADMITTED / 0 PARTIAL_ALIVE / 0 UNSUPPORTED

---

## Tier R_generalized — Generalised Probabilistic and Structural Reasoning (9 breeds)

These breeds cover the mathematical and structural frameworks for uncertainty, constraint, and analogy.

| # | Breed | Canonical Reference | Status | Gap to ADMITTED |
|---|---|---|---|---|
| 1 | Bayesian | Bayesian inference / belief propagation (Bayes, 1763; Pearl, 1988) | UNSUPPORTED | No implementation |
| 2 | Fuzzy | Fuzzy logic and approximate reasoning (Zadeh, 1965) | UNSUPPORTED | No implementation |
| 3 | Dempster-Shafer | Evidence theory (Dempster, 1967; Shafer, 1976) | UNSUPPORTED | No implementation |
| 4 | Abductive | Abduction / inference to the best explanation (Peirce, 1878) | UNSUPPORTED | No implementation |
| 5 | Inductive | Inductive logic programming (Plotkin, 1970; Muggleton, 1991) | UNSUPPORTED | No implementation |
| 6 | Temporal | Temporal reasoning / interval algebra (Allen, 1983) | UNSUPPORTED | No implementation |
| 7 | Ontological | Ontology-driven classification (Smith & Welty, 2001) | UNSUPPORTED | No implementation |
| 8 | Constraint | Constraint satisfaction / propagation (Mackworth, 1977) | UNSUPPORTED | No implementation |
| 9 | Analogical | Structure-mapping / analogical transfer (Gentner, 1983) | UNSUPPORTED | No implementation |

**Tier summary:** 0 ADMITTED / 0 PARTIAL_ALIVE / 9 UNSUPPORTED

---

## Tier R_autonomic — Autoinstinct Breeds (4 breeds)

These breeds are the self-governing, perception-driven layer implemented as `autoinstinct_*` variants in `crates/wasm4pm-cognition/`.

| # | Breed | Autoinstinct Variant | Status | Gap to ADMITTED |
|---|---|---|---|---|
| 1 | Vision | `autoinstinct_vision` | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 2 | Semantics | `autoinstinct_semantics` | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 3 | Neurosis | `autoinstinct_neurosis` | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |
| 4 | Learning | `autoinstinct_learning` | ADMITTED | bc998553 (2026-06-10): L1 OCPN model + native DFA replay (fitness=1.0) + Ed25519 signed receipts |

**Tier summary:** 4 ADMITTED / 0 PARTIAL_ALIVE / 0 UNSUPPORTED

---

## CertifiedRegistry_2026_06 — Implemented Breeds (13 total)

These 13 breeds have a live Rust/WASM implementation. All 13 are ADMITTED as of 2026-06-10 (bc998553): L1 OCPN models, native DFA replay at fitness=1.0, and Ed25519 signed receipts.

| # | Breed | Tier | Variant / Module | Status |
|---|---|---|---|---|
| 1 | MYCIN | R_historical | `mycin` | ADMITTED |
| 2 | STRIPS | R_historical | `strips` | ADMITTED |
| 3 | SOAR | R_historical | `soar` | ADMITTED |
| 4 | HEARSAY-II | R_historical | `hearsay_ii` | ADMITTED |
| 5 | Prolog | R_historical | `prolog` | ADMITTED |
| 6 | CBR | R_historical | `cbr` | ADMITTED |
| 7 | GPS | R_historical | `gps` | ADMITTED |
| 8 | DENDRAL | R_historical | `dendral` | ADMITTED |
| 9 | ELIZA | R_historical | `eliza` | ADMITTED |
| 10 | Vision | R_autonomic | `autoinstinct_vision` | ADMITTED |
| 11 | Semantics | R_autonomic | `autoinstinct_semantics` | ADMITTED |
| 12 | Neurosis | R_autonomic | `autoinstinct_neurosis` | ADMITTED |
| 13 | Learning | R_autonomic | `autoinstinct_learning` | ADMITTED |

**Registry totals:** 13 implemented (13 ADMITTED, 0 PARTIAL_ALIVE) | 9 UNSUPPORTED | 22 total defined

---

## Admission Roadmap

To advance any PARTIAL_ALIVE breed to ADMITTED, the following work items must be completed per breed:

1. Author an L1 OCEL model (`docs/ocel/<breed>-model.json`) capturing the lawful object lifecycle for a single breed execution.
2. Implement the receipt schema extension in `@wasm4pm/contracts` — `input_hash` and `output_hash` must be non-empty strings in every receipt.
3. Add at least one negative test that verifies the breed rejects a malformed contract payload.
4. Verify deterministic replay: run the breed twice with identical input and assert bit-exact output equality.
5. Update this registry entry to ADMITTED once all six criteria pass in CI.

**Next review date:** 2026-07-01
