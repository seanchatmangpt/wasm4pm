# 00 — WASM4PM Primitive Inventory (Authoritative Map)

**Agent:** A1 (Inventory, doc-only)
**Date:** 2026-05-30
**Branch:** `finish-wip-primitives`
**Doctrine:** A primitive is only *EXISTS* if the paper object is implemented AND a positive
case passes AND a negative case refuses AND it is reachable (Rust/WASM/CLI) AND a determinism/
receipt gate holds AND the receipt names the proof (six-leg ALIVE rule, plan §"Completion
contract"). *PARTIAL* = some legs present, surface or negative missing. *MISSING* = no real
implementation. Verdicts here are **inventory status**, not the kernel ALIVE/PARTIAL/BLOCKED/
FAKE-LIVE verdict (that lives in `docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md`).

> Every file path in this table was confirmed on disk during this audit (not trusted from the
> agent ledger). Where a sibling agent doc supersedes a row, it is cited.

---

## Legend

| Status | Meaning |
|--------|---------|
| **EXISTS** | Paper object implemented; positive + negative proof present; reachable. |
| **PARTIAL** | Implementation present but a leg is missing (negative fixture, CLI surface, or formal completeness). |
| **MISSING** | No real implementation (stub, doc-only, or unreachable). |

"Reachability" column uses: **R** = Rust kernel, **W** = `#[wasm_bindgen]` export, **C** = `wpm` CLI verb.

---

## 1. Event-data layer — OCEL

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **OCEL v1 (flat object-centric log)** | EXISTS | `wasm4pm/src/ocel_io.rs`, `wasm4pm/src/ocel_flatten.rs`, `wasm4pm/src/ocel_tests.rs` | `load_ocel2_from_json`, `export_ocel2_to_json`, `validate_ocel` (R,W) | `wasm4pm/tests/ocel_real_data_tests.rs`, `ocel_process_evidence_tests.rs`, `ocel_object_centric_audit.rs` | OCEL standard (flat E/O, E2O) | Feeds flattening → DFG; foundry projection; OCPQ evaluation input |
| **OCEL v2 (O2O relations, qualifiers, cardinality, time-stable attrs)** | EXISTS | `crates/ocel-core/src/{lib.rs,intake.rs,validate.rs,flatten.rs}`, `wasm4pm/src/ocel_v2.rs` (`pub mod ocel_v2` lib.rs:367) | OCEL-v2 validate/intake exposed via `crates/ocel-core` + WASM bridge (R,W) | `wasm4pm/tests/ocel_v2.rs` (8 fns), `ocel_many_to_many_tests.rs`, `ocel_lifecycle_wasm_export_tests.rs`; `crates/ocel-core/src/intake.rs` (inline `#[test]`) | OCED meta-model `L=(E,O,eval,oaval)`; event has ≥1 qualified object ref; O2O via `objects` qualifiers; time-stable `type`/`objects` (plan §"Paper grounding") | OCPQ predicates (`E2O`,`O2O`); foundry `fixtures/world/ocel-v2.json`; flatten/project gates | Detail: `01-OCEL-V2-PRIMITIVES.md` |
| **OCEL flattening (object-type projection → trace log)** | EXISTS | `wasm4pm/src/ocel_flatten.rs`, `crates/ocel-core/src/flatten.rs` | flatten path (R,W) | `ocel_dfg_discovery_tests.rs` | OCEL→event-log projection per object type | DFG/discovery on flattened logs; G4 flatten/project equivalence target |
| **Object-centric DFG (OC-DFG, per-type)** | PARTIAL | `wasm4pm/src/ocel_flatten.rs` + discovery on flattened views | per-type DFG via flatten + discover (R,W) | `ocel_dfg_discovery_tests.rs` | OC-DFG (DFG per object type) | Object-centric summaries; consumer `summarize_ocel_objects` (GAP-PMAX-004) — *summary surfaces consolidation still open* |
| **Object-centric Petri net (OC-Petri)** | PARTIAL | `wasm4pm/src/oc_conformance.rs` | oc-conformance path (R,W) | `ocel_object_centric_audit.rs` | Object-centric Petri net / OC conformance | OC-Declare / OC conformance reporting |

---

## 2. Object-Centric Process Querying — OCPQ

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **OCPQ runtime (binding boxes, query trees, predicates, constraints)** | EXISTS | `crates/ocpq/src/lib.rs` | OCPQ eval bridged to WASM (R,W; CLI verb deferred — see ledger A3/A9) | `crates/ocpq/tests/ocpq_paper.rs` (16 `#[test]`), `wasm4pm/tests/ocpq_tests.rs` (5 fns) | Kuesters & van der Aalst OCPQ: `BASIC` predicates `E2O(v,v',q)`, `O2O(v,v',q)`, `TBE(v,v',tmin,tmax)`; binding boxes; query trees; `CHILD SET(u,nmin,nmax)`; `constr → satisfied/violated` | Constraint checking over OCEL v2; foundry `fixtures/world/ocpq-*.json`; negative `fixtures/ocpq/invalid_*.json` | Detail: `09-OCPQ-PRIMITIVES.md`. **C4 reconciliation note:** encode Fig.6 (confirmed-order-paid-within-4w, `CBS(A,1,1)`, `TBE(e1,e2,0,4w)`) faithfully; third-reminder is a separate informal example. |
| **OCPQ negative fixtures (refusal proof)** | EXISTS | `fixtures/ocpq/{invalid_o2o.json,invalid_monotonicity.json,ggen_invalid_*.json}` | (consumed by eval) | `crates/ocpq/tests/ocpq_paper.rs` | `constr` violation semantics | Anti-FAKE-LIVE negative leg for OCPQ |

---

## 3. Model layer — POWL-2, WF-net/Petri, process trees

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **POWL-2 model + parser** | EXISTS | `wasm4pm/src/powl_parser.rs`, `powl_models.rs`, `powl_api.rs`, `powl_arena.rs`, `powl/` | POWL parse/repr (R,W,C via `wpm powl`) | `wasm4pm/tests/adversarial_powl_tests.rs`, `powl_cross_validation.rs` (12 fns) | POWL 2.0 (partial orders + choice graphs) | 15 routes `routes/*.powl.json`; route-driven TDD; foundry `fixtures/world/powl.json` | Detail: `02-POWL-2-PRIMITIVES.md` |
| **WF-net → POWL-2 (Separable, conflict-hiding decomposition)** | EXISTS | `wasm4pm/src/wf_to_powl.rs` (`pub mod wf_to_powl` lib.rs:96) | `wf_net_to_powl`, `wf_net_to_powl_spec`, `wf_net_to_powl_native`, `powl_language`, `wf_net_language` (R,W) | `wasm4pm/tests/wf_to_powl.rs` (25 fns) | Separable WF-nets paper (arXiv:2602.15739v3) §4, Algorithm 3 ConvertNetToPOWL | DAG `POWL-2 ↔ WF-net`; round-trip equivalence (G4 target) | Detail: `02-POWL-2-PRIMITIVES.md` |
| **POWL → WF-net / Petri (forward direction)** | PARTIAL | `wasm4pm/src/powl_to_wf.rs`, `powl_petri_net.rs` | powl→wf path (R,W) | `powl_cross_validation.rs` | POWL→WF-net synthesis (reverse of Algorithm 3) | **C1 reconciliation (CRITICAL):** forward `powl_to_wf_net` + round-trip language-preservation tests both directions on separable fixtures — partially present; verify completeness against C1 |
| **POWL → process tree** | EXISTS | `wasm4pm/src/powl_to_process_tree.rs`, `powl_process_tree.rs`, `process_tree.rs` | `powl_to_process_tree` (R,W) | `powl_cross_validation.rs` | POWL→process-tree projection | Tree projection in DAG; foundry `fixtures/world/process-tree.json`; G4 equivalence |
| **WF-net / Petri net + formal soundness** | EXISTS | `wasm4pm/src/soundness.rs` (`pub mod soundness` lib.rs:94), `pnml_io.rs`, `petri_net_playout.rs` | `check_soundness`, `is_sound_and_safe`, `analyze_petri_net`, `reachability_graph`, `is_free_choice`, `is_state_machine`, `is_marked_graph`, `is_workflow_net`, `check_wf_net_soundness` (R,W) | `wasm4pm/tests/wf_soundness.rs` (28 fns) | Separable WF-nets paper §3: reachability/liveness/deadlock, free-choice, marked-graph/state-machine duality | Soundness gate for routes; negative nets `fixtures/negative/n07-dead-transition.wf-net.json`, `n08-unsafe-net.wf-net.json` | Detail: `03-WFNET-PETRI-PRIMITIVES.md` |
| **PNML import/export round-trip** | PARTIAL | `wasm4pm/src/pnml_io.rs` | pnml io (R,W) | (covered indirectly) | PNML standard | **C5 reconciliation (MINOR):** add PNML round-trip test on sound/unsafe fixtures + doc — not yet a dedicated test file |

---

## 4. Discovery algorithms (15 registered, `packages/kernel/src/registry.ts`)

| # | Algorithm ID | Status | Key file | Paper grounding | Output |
|---|--------------|--------|----------|-----------------|--------|
| 1 | `dfg` | EXISTS | `wasm4pm/src/discovery.rs` | Directly-Follows Graph | DFG |
| 2 | `process_skeleton` | EXISTS | `wasm4pm/src/discovery.rs` | Skeleton/relation abstraction | DFG |
| 3 | `simd_streaming_dfg` | EXISTS | `wasm4pm/src/simd_streaming_dfg.rs`, `incremental_dfg.rs` | SIMD streaming DFG | DFG |
| 4 | `alpha_plus_plus` | EXISTS | `wasm4pm/src/discovery.rs` | Alpha++ (van der Aalst) | Petri net |
| 5 | `heuristic_miner` | EXISTS | `wasm4pm/src/discovery.rs`, `more_discovery.rs` | Heuristic Miner (dependency/freq) | DFG |
| 6 | `inductive_miner` | EXISTS | `wasm4pm/src/discovery.rs` | Inductive Miner | Process tree |
| 7 | `hill_climbing` | EXISTS | `wasm4pm/src/more_discovery.rs`, `fast_discovery.rs` | Local-search metaheuristic | Petri net |
| 8 | `declare` | EXISTS | `wasm4pm/src/declare_conformance.rs` | DECLARE constraint mining | Declare |
| 9 | `simulated_annealing` | EXISTS | `wasm4pm/src/more_discovery.rs` | Simulated annealing | Petri net |
| 10 | `a_star` | EXISTS | `wasm4pm/src/more_discovery.rs` | A* search discovery | Petri net |
| 11 | `aco` | EXISTS | `wasm4pm/src/genetic_discovery.rs`, `more_discovery.rs` | Ant Colony Optimization | Petri net |
| 12 | `pso` | EXISTS | `wasm4pm/src/genetic_discovery.rs` | Particle Swarm Optimization | Petri net |
| 13 | `genetic_algorithm` | EXISTS | `wasm4pm/src/genetic_discovery.rs` | Genetic Miner (evolutionary) | Petri net |
| 14 | `optimized_dfg` | EXISTS | `wasm4pm/src/performance_dfg.rs` | Frequency/performance-optimized DFG | DFG |
| 15 | `ilp` | EXISTS | `wasm4pm/src/ilp_discovery.rs` | ILP-based region miner | Petri net |

All 15 are R+W and reachable through `wpm run --algorithm <id>` (C). Determinism guards:
`wasm4pm/src/discovery_determinism_guards.rs` (G1 same-input→same-BLAKE3 target). Stochastic algos
(genetic/PSO/ACO/SA/A*) seed `StdRng` for determinism (see `determinism-oracle-compliance.md`).

---

## 5. Conformance — two-tier doctrine

> **Doctrine (`mcpp-conformance.md`):** explore/diagnose ≥0.8; **admit = 1.0 else AndonPull**.
> Two distinct surfaces: the **diagnostic report** (`wpm conformance`/`quality`, soft) and the
> **route-admission gate** (`wpm trace conform`, exact-1.0).

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **Token-based replay fitness** | EXISTS | `wasm4pm/src/conformance.rs`, `simd_token_replay.rs` | token replay (R,W,C) | `wasm4pm/tests/ground_truth_conformance_tests.rs`, `conformance_real_data_tests.rs` | Token replay `fitness = 1 − (missing+consumed)/(produced+remaining)` | G3 conformance gate; route admission |
| **Alignment-based fitness** | EXISTS | `wasm4pm/src/alignments.rs`, `alignment_fitness.rs`, `align_etconformance.rs` | alignments (R,W) | `conformance_edge_cases.rs` | Optimal alignment (A* cost) | Structured conformance report (GAP-PMAX-002) |
| **Precision (escaping edges / ETC)** | EXISTS | `wasm4pm/src/etconformance_precision.rs` | precision (R,W) | `conformance_real_data_tests.rs` | ETConformance precision | Quality 4-dim assessment |
| **Generalization / Simplicity** | PARTIAL | `wasm4pm/src/conformance_reporting.rs` | report path (R,W) | `conformance_model_truth_gaps.rs` | 4-dim quality (van der Aalst) | `wpm quality`; invariants I-1..I-5 (G4) |
| **DECLARE / OC-Declare conformance** | EXISTS | `wasm4pm/src/declare_conformance.rs`, `oc_conformance.rs` | declare/oc conformance (R,W) | `declare_conformance_integration_test.rs` | DECLARE LTL templates; OC-Declare | Constraint conformance; OC layer |
| **Exact-1.0 route-admission gate** | EXISTS | `apps/wasm4pm/src/commands/trace.ts:1025,1038–1065` | (CLI gate) C | `apps/wasm4pm/src/__tests__/mcpp-admission-gate.test.ts` (20+ cases) | `mcpp-conformance.md`: `Conformance=1.0 ∧ Precision=1.0 ∧ ReceiptCoverage=1.0 …` else `AndonPull(RouteConformanceGap)`, exit 6 | Route-driven TDD; benchmark gate G3 | **Do NOT change** (plan §"What is real"). Detail: `04-CONFORMANCE-PRIMITIVES.md` |
| **Structured conformance report (GAP-PMAX-002)** | PARTIAL | `wasm4pm/src/conformance_reporting.rs` | report struct (R,W) | `conformance_model_truth_gaps.rs` | Deterministic struct `{fitness,precision,F1,alignment_cost,deviations[],…,verdict,receipt_hash}` | Downstream agentic consumers (PMAx pressure test) — *struct completeness vs GAP-PMAX-002 spec open* |
| **`describe_log` / filter / summary surfaces (GAP-PMAX-001/003/004)** | PARTIAL/MISSING | scattered across streaming/temporal/DFG paths | partial (R,W) | — | Privacy-preserving log abstraction; typed filters; deterministic summaries | Consumer reachability — *consolidation open; tracked as reconciliation GAPs* |

---

## 6. Streaming, prediction, drift, simulation

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **Streaming DFG / pipeline** | EXISTS | `wasm4pm/src/streaming_pipeline.rs`, `streaming_wasm.rs`, `simd_streaming_dfg.rs`, `incremental_dfg.rs`, `streaming/` | streaming (R,W) | (streaming integration) | Streaming process discovery | Online DFG; edge/fog profiles |
| **Streaming conformance** | EXISTS | `wasm4pm/src/streaming_conformance.rs` | streaming conformance (R,W) | — | Online token replay | Streaming admission |
| **Prediction — next activity** | EXISTS | `wasm4pm/src/prediction_next_activity.rs`, `prediction.rs` | predict (R,W,C `wpm predict`) | `powl_and_prediction_real_data_tests.rs` | n-gram/beam next-activity | Predictive monitoring |
| **Prediction — remaining time** | EXISTS | `wasm4pm/src/prediction_remaining_time.rs` | predict (R,W,C) | `powl_and_prediction_real_data_tests.rs` | Weibull/hazard regression | Remaining-time SLAs |
| **Prediction — outcome / features / resource / RF** | EXISTS | `wasm4pm/src/{prediction_outcome.rs,prediction_features.rs,prediction_resource.rs,prediction_rf.rs,prediction_additions.rs}` | predict (R,W,C) | `powl_and_prediction_real_data_tests.rs` | Outcome classifier; prefix features; M/M/1 queue; random forest | Multi-perspective prediction |
| **Drift detection (EWMA / Jaccard window)** | EXISTS | `wasm4pm/src/prediction_drift.rs`, `drift_manager.rs` | drift (R,W,C `wpm drift-watch`) | — | EWMA + Jaccard concept-drift | Real-time drift monitoring. **TS-1** (`String::len()` timestamp proxy) — see `09b-ML-AI-PRIMITIVES.md`, ledger: already fixed |
| **Simulation (Monte Carlo / playout)** | EXISTS | `wasm4pm/src/montecarlo.rs`, `playout.rs`, `petri_net_playout.rs` | simulate (R,W,C `wpm simulate`) | — | Monte Carlo trace generation; process-tree/Petri playout | Foundry positive-trace generation; what-if analysis |

---

## 7. ML / AI — miniml-core, RL, SPC, self-healing

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **miniml-core (classify/cluster/forecast/anomaly/regress/PCA)** | EXISTS | `crates/miniml-core/src/`, `wasm4pm/src/ml/`, `ml_algorithms.rs` | `ml_*` (R,W,C `wpm ml`) | (per-package) | Micro-ML (k-NN, k-means, regression, info-theoretic anomaly, PCA) | `wpm ml <task>`; AutoML envelope | Detail: `09b-ML-AI-PRIMITIVES.md` |
| **RL orchestrator (5 agents, LinUCB)** | EXISTS | `wasm4pm/src/rl_orchestrator.rs`, `reinforcement.rs`, `rl_stability_monitor.rs`, `rl_dimensionality_analysis.rs`, `rl_state_serialization.rs` | RL bridge (R,W) | `wasm4pm/tests/rl_*` (orchestrator/action/state/stability) | Bellman Q-learning; LinUCB contextual bandit | Autonomic loop. **FM-1** (`next_state==state` self-referential Bellman) — ledger A10: already fixed |
| **SPC (Western Electric rules)** | PARTIAL | `wasm4pm/src/spc.rs`, `spc_history.rs` | **not yet wasm-exported** (R only) | — | Western Electric Rules 1–4; process capability | Autonomic anomaly signal. **Reconciliation A10:** export SPC to WASM (anti-FAKE-LIVE reachability) |
| **Self-healing / circuit breaker** | PARTIAL | `wasm4pm/src/self_healing.rs` | **not yet wasm-exported** (R only) | — | Circuit-breaker FSM (Closed/Open/HalfOpen) | Autonomic protection. **CB-1** (caller-driven step counter) — ledger: already fixed. **Reconciliation A10:** export circuit to WASM |
| **LTN / Compliance-aware NeSy (optional)** | MISSING | — | — | — | Compliance-aware NeSy (LTN): FOL/LTL constraint injection over prefix classifier (plan §"Paper grounding") | **Future primitive** — document as planned, not built (reconciliation delta #5) |
| **AutoML envelope** | PARTIAL | `wasm4pm/src/automl_envelope.rs` | automl (R,W) | — | Feature-quality + algorithm selection | Feature scaling caveat (event_density unbounded) — see `09b` |

---

## 8. Route catalog, route-driven TDD, benchmark gates

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **Route catalog (15 POWL-2 routes)** | EXISTS | `routes/*.powl.json` (15 confirmed on disk) | (consumed by trace conform) C | `apps/wasm4pm/src/__tests__/real-fixtures.test.ts` | POWL-2 routes with `object_types` (created_by/terminated_by/schema/cardinality) | Route admission; AAT V2 cross-language ingest |
| **Route-driven TDD harness** | EXISTS | `wasm4pm::testing` (`PowlTestHarness`, `ExpectedConformance`, `ConformanceVerdict`, `classify_conformance`, 24 `AndonPull` variants); proc-macro `crates/wasm4pm-macros/src/lib.rs` (`powl_test`, `powl_activity`) | (Rust harness) R | `wasm4pm/tests/powl_macro_tests.rs`, `powl_macro_a9_tests.rs` (5 fns) | Exact-1.0 / AndonPull route legality | Self-testing routes. **C7 reconciliation (MINOR):** `powl_test!` must exercise all four harness types by name incl. negative path |
| **Benchmark gates G1–G5** | PARTIAL | `apps/wasm4pm/src/commands/benchmark.ts:1026+` (`wpm benchmark gate`) | (CLI) C | (CLI integration) | G1 DETERMINISM (same input→same BLAKE3); G2 RECEIPT-VERIFY (BLAKE3 chain recompute); G3 CONFORMANCE (exact-1.0/AndonPull); **G4 (as built = METRIC-INTERDEP. I-1..I-5)**; G5 REPORT-COMPLETE | CI admission gate; anti-FAKE-LIVE | Detail: `08-BENCHMARK-GATES.md`. **C3 reconciliation (MAJOR):** demanded G4 = projection/round-trip **EQUIVALENCE** (POWL↔WF-net, POWL→tree, OCEL flatten/project). As-built G4 drifted to metric-interdependency — re-scope; keep all 5 gates under demanded names. |
| **BLAKE3 receipt chain + `--verify-receipt-hash`** | EXISTS | receipt machinery + `benchmark.ts` G2; `@wasm4pm/contracts` receipt | receipt (R,W,C) | (G2) | BLAKE3 content addressing; receipt = proof of execution | Proof layer (kernel differentiator over codegen); foundry receipt fixtures (**C2** target) |

---

## 9. Process-world foundry + negative corpus

| Primitive | Status | Key files | WASM export | Test files | Paper grounding | Downstream use |
|-----------|--------|-----------|-------------|------------|-----------------|----------------|
| **Process-world foundry (Order-to-Cash)** | EXISTS | `fixtures/world/*` (single sound/safe/separable WF-net over 7 objects / 9 events → every lawful projection): `ocel-v2.json`, `powl.json`, `wf-net.json`, `process-tree.json`, `order.xes`, `order.csv`, `positive-traces.json`, `ocpq-*.json`, `object-types-cardinality.json` | (projections consumed by primitives) | (foundry round-trips) | Separable WF-net as single source of truth; every projection derived | Positive proof for OCEL v2 / POWL / WF-net / tree / OCPQ / receipts | Detail: `05-PROCESS-WORLD-FOUNDRY.md`. **C2 reconciliation (MAJOR):** add **negative traces** (refused, fitness<1.0→AndonPull) + **receipt fixtures** (hash-verify for G2) as foundry emissions. |
| **Negative / sabotage corpus** | EXISTS | `fixtures/negative/manifest.json` + 14 invalid fixtures (n01–n14) covering 11 required categories: missing event (n01), out-of-order (n02), duplicate terminal (n03), receipt-before-gate (n04), O2O dangling (n05), flattening loss (n06), dead transition (n07), unsafe net (n08), non-conforming POWL route (n09), cardinality-max (n10), lifecycle-not-terminated (n11), E2O empty (n12), duplicate object id (n13), undeclared event type (n14) | (consumed by rejecting primitives) | per-category in soundness/conformance/OCEL/OCPQ tests | Each invalid fixture → expected refusal + rejecting primitive + minimal counterexample | Negative proof leg of ALIVE rule | Detail: `06-NEGATIVE-CORPUS.md` |

---

## 10. Open reconciliation items (cross-reference for synthesis)

These are the gaps this inventory surfaces against the six-leg ALIVE rule. They are recorded so the
synthesizer (`WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md`) can compute the kernel floor verdict.

| ID | Item | Affected primitive | Inventory status impact |
|----|------|-------------------|-------------------------|
| C1 | Forward `powl_to_wf_net` + bidirectional round-trip language-preservation tests | POWL ↔ WF-net | PARTIAL until both directions tested on separable fixtures |
| C2 | Foundry negative traces + receipt fixtures | Foundry / G2 | EXISTS-but-incomplete: positive projections present, negative+receipt emission open |
| C3 | G4 re-scope to projection/round-trip EQUIVALENCE | Benchmark gates | G4 currently METRIC-INTERDEP (named drift) |
| C4 | OCPQ Fig.6 faithful encoding (`CBS(A,1,1)`, `TBE(0,4w)`) | OCPQ | EXISTS; test fidelity to Fig.6 vs Fig.2 to confirm |
| C5 | PNML import/export round-trip test on sound/unsafe nets | Petri / PNML | PARTIAL until dedicated round-trip test |
| C6 | Cyclic choice-graph fixture + round-trip | POWL-2 | choice-graph-with-cycles reduced to plain choice graph |
| C7 | `powl_test!` exercises all four harness types incl. negative | Route-driven TDD | EXISTS; assert four-type coverage |
| A10 | Export SPC + circuit breaker to WASM; document LTN as future | SPC / self-healing / LTN | SPC + circuit PARTIAL (Rust-only ⇒ unreachable ⇒ FAKE-LIVE risk); LTN MISSING-by-design |
| PMAX-001..005 | `describe_log`, filters, summary surfaces, structured report, reachable WASM/CLI exposure | Consumer-contract | Several conformance/summary surfaces PARTIAL/MISSING |

---

## Summary counts (inventory status, not kernel verdict)

- **EXISTS:** OCEL v1, OCEL v2, OCEL flatten, OCPQ runtime + negatives, POWL-2 parser, WF→POWL,
  POWL→tree, WF-net soundness, all 15 discovery algos, token replay, alignments, precision,
  DECLARE/OC-Declare, exact-1.0 admission gate, streaming DFG + conformance, all prediction
  perspectives, drift, simulation, miniml-core, RL orchestrator, route catalog (15), route-TDD
  harness, BLAKE3 receipts, foundry projections, negative corpus (14).
- **PARTIAL:** OC-DFG/OC-Petri summaries, POWL→WF-net (C1), PNML round-trip (C5),
  generalization/simplicity report, structured conformance report (PMAX-002), benchmark gates
  (G4 re-scope C3), AutoML envelope, SPC, self-healing/circuit, `describe_log`/filters/summaries
  (PMAX-001/003/004), foundry negative+receipt emission (C2).
- **MISSING:** LTN / Compliance-aware NeSy (by design — documented as future primitive).

> The kernel is **not ALIVE merely because EXISTS rows dominate**. Any primitive that is
> Rust-only (SPC, circuit), refusal-skipped, or non-executable-gated keeps the kernel floor below
> ALIVE per the anti-cheat rule. Final adjudication: `docs/receipts/WASM4PM_PRIMITIVE_KERNEL_RECEIPT.md`.
