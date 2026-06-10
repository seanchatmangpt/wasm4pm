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
| 1 | MYCIN | Rule-based medical diagnosis (Shortliffe, 1976) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 2 | STRIPS | State-space planning (Fikes & Nilsson, 1971) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 3 | SOAR | Unified cognitive architecture (Laird et al., 1987) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 4 | HEARSAY-II | Blackboard architecture (Erman et al., 1980) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 5 | Prolog | Logic programming / SLD resolution (Colmerauer, 1972) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 6 | CBR | Case-based reasoning (Schank, 1982; Kolodner, 1993) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 7 | GPS | General Problem Solver / means-ends analysis (Newell & Simon, 1957) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 8 | DENDRAL | Meta-DENDRAL structural inference (Feigenbaum et al., 1969) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 9 | ELIZA | Pattern-matching dialogue (Weizenbaum, 1966) | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |

**Tier summary:** 0 ADMITTED / 9 PARTIAL_ALIVE / 0 UNSUPPORTED

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
| 1 | Vision | `autoinstinct_vision` | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 2 | Semantics | `autoinstinct_semantics` | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 3 | Neurosis | `autoinstinct_neurosis` | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |
| 4 | Learning | `autoinstinct_learning` | PARTIAL_ALIVE | Missing L1 OCEL model, signed receipts |

**Tier summary:** 0 ADMITTED / 4 PARTIAL_ALIVE / 0 UNSUPPORTED

---

## CertifiedRegistry_2026_06 — Implemented Breeds (13 total)

These 13 breeds have a live Rust/WASM implementation. None are ADMITTED as of 2026-06-10. All are PARTIAL_ALIVE pending L1 OCEL models and signed receipts.

| # | Breed | Tier | Variant / Module | Status |
|---|---|---|---|---|
| 1 | MYCIN | R_historical | `mycin` | PARTIAL_ALIVE |
| 2 | STRIPS | R_historical | `strips` | PARTIAL_ALIVE |
| 3 | SOAR | R_historical | `soar` | PARTIAL_ALIVE |
| 4 | HEARSAY-II | R_historical | `hearsay_ii` | PARTIAL_ALIVE |
| 5 | Prolog | R_historical | `prolog` | PARTIAL_ALIVE |
| 6 | CBR | R_historical | `cbr` | PARTIAL_ALIVE |
| 7 | GPS | R_historical | `gps` | PARTIAL_ALIVE |
| 8 | DENDRAL | R_historical | `dendral` | PARTIAL_ALIVE |
| 9 | ELIZA | R_historical | `eliza` | PARTIAL_ALIVE |
| 10 | Vision | R_autonomic | `autoinstinct_vision` | PARTIAL_ALIVE |
| 11 | Semantics | R_autonomic | `autoinstinct_semantics` | PARTIAL_ALIVE |
| 12 | Neurosis | R_autonomic | `autoinstinct_neurosis` | PARTIAL_ALIVE |
| 13 | Learning | R_autonomic | `autoinstinct_learning` | PARTIAL_ALIVE |

**Registry totals:** 13 implemented (0 ADMITTED, 13 PARTIAL_ALIVE) | 9 UNSUPPORTED | 22 total defined

---

## Admission Roadmap

To advance any PARTIAL_ALIVE breed to ADMITTED, the following work items must be completed per breed:

1. Author an L1 OCEL model (`docs/ocel/<breed>-model.json`) capturing the lawful object lifecycle for a single breed execution.
2. Implement the receipt schema extension in `@wasm4pm/contracts` — `input_hash` and `output_hash` must be non-empty strings in every receipt.
3. Add at least one negative test that verifies the breed rejects a malformed contract payload.
4. Verify deterministic replay: run the breed twice with identical input and assert bit-exact output equality.
5. Update this registry entry to ADMITTED once all six criteria pass in CI.

**Next review date:** 2026-07-01
