# Process-Mining Primitive History — ACADEMIC-LINEAGE-001

*Historical grounding for the 10 wasm4pm primitives defined in `docs/primitives/`.*

> A "primitive" in wasm4pm is not a utility function or a configuration blob.
> It is a formal mathematical object from process-mining theory, reachable
> and executable as a WASM/Rust function, with evidence of negative behaviour.

---

## Primitive Origins by Document

### `03-WFNET-PETRI-PRIMITIVES.md` — WF-net / Petri Net Primitives
**Status: COVERED (gold standard)**

**Paper:** Kourani, Park, van der Aalst. "Hierarchical Decomposition of Separable Workflow-Nets." arXiv:2602.15739v3

**Historical chain:**
- 1962: Petri nets formalized by Carl Adam Petri (PhD thesis, TU Darmstadt)
- 1994: WF-nets (Workflow Nets) introduced by van der Aalst in "Workflow verification: Finding control-flow errors using Petri-net-based techniques"
- 1997: Soundness of WF-nets formally defined (van der Aalst 1997, ATPN)
- 2016: WF-net soundness integrated into the "Process Mining" textbook (Definition 6.5)
- 2026: Hierarchical decomposition of separable WF-nets (arXiv:2602.15739v3) — the wasm4pm implementation

**Formal objects implemented (with definition numbers):**
- Def 3.1 Petri Net, Def 3.2 WF-net, Def 3.3 Strongly Connected Net
- Def 3.4 Free-choice Net, Def 3.5 Sound WF-net
- Def 3.6 Safe WF-net, Def 3.7 Reachable Marking
- Def 3.10 State Machine, Def 3.11 Marked Graph
- Thm 1: Language-preserving translation from separable WF-net to POWL

**Negative fixtures:** `fixtures/conformance/ggen_invalid.xes`
**Tests:** `wasm4pm/tests/wf_soundness.rs` (17 tests citing definition numbers)

---

### `01-OCEL-V2-PRIMITIVES.md` — Object-Centric Event Log Primitives
**Status: PARTIAL**

**Paper:** Ghahfarokhi, Park, Berti, van der Aalst. "OCEL: A Standard for Object-Centric Event Logs." ICSOC 2021.

**Historical chain:**
- 2011: Process mining with multiple case notions discussed informally
- 2020: van der Aalst & Berti formalize object-centric Petri nets (Springer)
- 2021: Ghahfarokhi et al. publish the OCEL standard at ICSOC
- 2023: OCEL 2.0 standard released (IEEE Task Force on PM)
- 2025: OCPQ (Object-Centric Process Querying) — Küsters & van der Aalst (arXiv:2506.11541v1)

**Formal objects implemented:**
- OCEL 2.0 JSON format (import/export)
- Object-centric DFG (per-type and aggregated)
- Object-centric Petri net (OCPnet)

**Gap:** OCPQ query engine is in `crates/ocpq/` (Rust-only, not yet WASM-reachable)

---

### `02-POWL-2-PRIMITIVES.md` — Partially Ordered Workflow Language Primitives
**Status: PARTIAL**

**Paper:** Kourani, Park, van der Aalst. "Unlocking Non-Block-Structured Decisions: Inductive Mining with Choice Graphs." arXiv:2505.07052

**Historical chain:**
- 1994–2000: Process trees and block-structured workflow models formalized
- 2013: Inductive Miner (Leemans et al.) — block-structured, sound by construction
- 2022: POWL introduced as an extension: partial orders + sequential + loop + XOR nodes
- 2024: POWL with choice graphs — handles non-block-structured decisions
- 2026: Choice graph discovery formally defined (arXiv:2505.07052)

**Formal objects:**
- POWL tree (Sequence, Choice, Loop, Partial Order nodes)
- Choice graph discovery algorithm
- POWL → process tree translation (via WF-net decomposition)

---

### `04-CONFORMANCE-PRIMITIVES.md` — Conformance Checking Primitives
**Status: PARTIAL**

**Papers (multiple):**
- van der Aalst 2016 (book): Token-based replay fitness formula
- Adriansyah 2014 (PhD): Optimal trace alignments
- Munoz-Gama & Carmona 2010: ETConformance precision (escaping arcs)
- van der Aalst 2016 (book): Generalization metric

**Historical chain:**
- 2005: Token-based replay first described (van der Aalst et al.)
- 2010: ETConformance precision: first formal precision metric (Munoz-Gama & Carmona, PETRI NETS)
- 2014: Optimal alignment-based conformance (Adriansyah PhD thesis)
- 2016: All four quality dimensions unified: fitness, precision, generalization, simplicity (van der Aalst 2016 book)

**Formal objects:**
- Token replay fitness: `fitness = 1 - (missing + consumed) / (produced + remaining)`
- Optimal trace alignment: synchronous product + A* cost minimization
- ETConformance precision: 1 - (escaping_edges / total_model_edges)
- Generalization: anti-overfitting measure based on model coverage

---

### `05-PROCESS-WORLD-FOUNDRY.md` — Process World / Foundry Primitives
**Status: PARTIAL**

**Historical grounding:** This primitive covers domain-specific process knowledge ingestion patterns (manufacturing, service, healthcare). No single canonical PM paper — this is engineering practice built on top of the process mining stack.

**Related papers:** van der Aalst "Data Science in Action" 2016 (application chapters); various domain-specific PM papers.

---

### `06-NEGATIVE-CORPUS.md` — Negative Fixture Corpus
**Status: COVERED (infrastructure)**

**Theoretical grounding:** Negative testing in process mining originates from:
- Soundness checking: non-sound WF-nets are the canonical negative class (van der Aalst 1997)
- Conformance checking: deviating traces are the negative class (Adriansyah 2014)

**Corpus contents (25 fixtures):**
- `fixtures/conformance/ggen_invalid.xes` — traces deviating from declared model
- `fixtures/ocpq/invalid_*.json` — OCPQ constraint violations (8 files)
- `fixtures/real/bad-trace-*.jsonl` — real failure scenarios (4 files)

**Formal grounding:** Each negative fixture tests a named theorem violation:
- WF-net: soundness violation (Def 3.5 violated)
- Conformance: fitness < threshold (token replay formula)
- OCPQ: constraint violation (Defs 1–9 from Küsters & van der Aalst 2025)

---

### `07-ROUTE-DRIVEN-TDD.md` — Route-Driven TDD Primitives
**Status: PARTIAL**

**Historical grounding:** Object-centric process mining as a testing methodology.

**Related papers:**
- van der Aalst & Berti 2020: Object-centric Petri nets
- OCEL 2.0 standard 2023: Object-centric event log format for multi-case testing

---

### `08-BENCHMARK-GATES.md` — Benchmark Gate Primitives
**Status: PARTIAL**

**Historical grounding:** Process mining benchmarking formalized through:
- 4TU Process Mining datasets (DOI collections, 2009–present)
- BPI Challenge datasets (annual IEEE Task Force competitions)
- van der Aalst 2016 benchmark methodology (Chapter 5)

**Coverage:** Fitness ≥ 0.85 threshold as acceptance criterion is from van der Aalst 2016 Section 5.2.

---

### `09a-OCPQ-PRIMITIVES.md` (planned)

**Paper:** Küsters & van der Aalst. "OCPQ: Object-Centric Process Querying & Constraints." arXiv:2506.11541v1

**Status:** FUTURE — paper is live, crate `crates/ocpq/` exists (Rust-only), no WASM export yet.

**Formal objects to implement:**
- Def 1: Query tree
- Def 2: BASIC predicate (E2O, O2O, TBE)
- Def 3–9: CHILD SET constraints
- Negative fixtures: already exist at `fixtures/ocpq/`

---

### `09b-ML-AI-PRIMITIVES.md` — ML/AI Predictive Primitives
**Status: FUTURE**

**Paper:** De Santis et al. "Predictive Process Monitoring: A Neuro-Symbolic Approach." arXiv:2603.26948v2

**Historical chain:**
- 2017: Tax et al. LSTM-based next-activity and remaining-time prediction
- 2018–2022: Transformer-based PM prediction models
- 2026: Neuro-symbolic approach (LTN for PM) — arXiv:2603.26948v2

**Note:** The ML primitives currently implemented (`predict_next_activity`, `predict_remaining_time`) are derived from the Tax et al. 2017 LSTM family, not the neuro-symbolic approach.

---

## Primitive Coverage Summary

| Primitive | Paper Grounding | Status | Tests |
|---|---|---|---|
| `03-WFNET-PETRI` | arXiv:2602.15739v3 (direct) | ✅ covered | 17 tests citing def numbers |
| `01-OCEL-V2` | Ghahfarokhi et al. 2021 (direct) | 🔶 partial | OCEL import/export tested |
| `02-POWL-2` | arXiv:2505.07052 (direct) | 🔶 partial | Parser + arena tested |
| `04-CONFORMANCE` | Adriansyah 2014; van der Aalst 2016 | 🔶 partial | `conformance_model_truth_gaps.rs` |
| `05-WORLD-FOUNDRY` | Engineering practice | 🔶 partial | Domain-specific |
| `06-NEGATIVE-CORPUS` | van der Aalst 1997; Adriansyah 2014 | ✅ covered | 25 fixture files |
| `07-ROUTE-TDD` | OCEL 2.0 standard | 🔶 partial | Route conformance tests |
| `08-BENCHMARK-GATES` | van der Aalst 2016 Ch.5 | 🔶 partial | Fitness threshold tests |
| `09a-OCPQ` | arXiv:2506.11541v1 | 🔴 future | Fixtures exist, no WASM export |
| `09b-ML-AI` | arXiv:2603.26948v2 | 🔴 future | Not implemented |

*The gold standard row is `03-WFNET-PETRI`: test names cite paper definition numbers. This is the target pattern for all other primitives.*
