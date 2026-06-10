# Audit History (consolidated 2026-06-09)

All point-in-time audit reports (`_iteration*`, `_cycle*`, `_SPAN_SCHEMA*`, OTEL gap reports, Jaeger patterns) were consolidated here and deleted. Full text in git history. Status below verified ON DISK 2026-06-09.

## Verified LIVE — do not re-implement
- StateCoverage + state_to_bin — `rl_orchestrator.rs:522+`, OTEL every 100 cycles
- ActionHistory / get_action_stats — `rl_orchestrator.rs:450+`
- LinUCBAgent::weight_norms() — `ml/linucb.rs:284`
- `rl.convergence_diagnostics` span (every 10 cycles, td_error etc.) — `rl_orchestrator.rs:1445`
- `spc.rule_violation_classified` spans, all 4 Western Electric rules — `spc.rs:186,245,295,354,380`
- FM-1 fix (`effective_done = done || state == next_state`) — `rl_orchestrator.rs:1361`
- CB-1 circuit timeout FSM (real wall-clock `now_ms()`) — `self_healing.rs:406-419`
- ML G1 algorithm selection (`apps/wasm4pm/src/algorithm-selector.ts`), G2 feature-quality, G3 cross-validation — implemented AND wired into ml-runner
- 8 RL test files exist in `wasm4pm/tests/` (rl_systems_audit, rl_edge_case_audit, state_invariant_audit, rl_learning_stability_tests, state_coverage_tests, rl_action_tracking[_tests], state_exploration_audit)
- Registry parity: all 60 registered algorithms have real Rust backing
- All 8 van der Aalst agents real; swarm convergence real; FM-5-compliant cognition integration test exists (`cognition-wasm.integration.test.ts`)

## Verified OPEN — real debt
- `circuit.decision_impact_on_cycle` span: designed, never coded (HIGH — causality proof gap; only remaining missing span)
- RlStabilityMonitor (`rl_stability_monitor.rs`): implemented + 12 passing tests, NEVER wired into RlOrchestrator (~30 min fix)
- Unseeded fastrand (determinism, Rank-1 violation): `playout.rs:246,261,270` (DFG mode only; tree mode seeded), `action_dispatch.rs:358`, `self_healing.rs:805`
- G4 event_density unbounded: `automl_envelope.rs:166` (biases kNN/classifier distance)
- `--autoSelect` only wired for classify/cluster: `ml-runner.ts:167-195`
- streaming_dfg FxHashMap iteration unsorted: `streaming/streaming_dfg.rs:61`
- watch.ts cognition contract violation (`decision`/`hash`/`findings` field names): `commands/cognition/watch.ts:11-17,88-103`
- swarm `index.ts:5` claims `createSwarmMcpServer` export that doesn't exist (runtime failure for importers)
- 17/60 algorithms have ZERO integration tests: alignments, bpmn_import, causal_graph, complexity_metrics, compute_ewma, ocel_encode, ocel_oc_declare, ocel_ocla, ocel_petri_net, pnml_import, powl_to_process_tree, predict_next_activity, predict_outcome, predict_remaining_time, smart_engine, streaming_log, yawl_export
- Stratified k-fold duplicated: TS `packages/ml/src/cross-validation.ts` vs Rust `crates/miniml-core/src/cross_validation.rs`
- `receipt_prd_tests.rs` in src/ instead of tests/; stale "stub" comments in `ilp_discovery.rs:58`, `pattern_dispatch.rs:557`

## Law
Audit records decay in BOTH directions (features claimed done that aren't; features claimed missing that exist). Verify on disk (grep the struct/test file) before citing any audit doc or memory note about implementation status.

---

## wasm4pm-compat Usage — TPS/DfLSS Audit (2026-06-09)

**Verdict: CLEAN.** All 4 Cargo declarations resolve to v26.6.8 from crates.io (checksum-verified in Cargo.lock). Zero path dependencies; 37 live Rust source files actively consume the crate. No version drift across consumers.

### Countermeasures applied

| TPS lens | Gap | Fix |
|---|---|---|
| Muda (overprocessing) | `wasm4pm/Cargo.toml` re-pinned version redundantly alongside workspace root | Replaced with `workspace = true` — single version authority |
| Jidoka / poka-yoke | "Never add a path dep" enforced only by CLAUDE.md comment | Verified `deny.toml` [sources] gate; tightened if needed |

### Known decay risk (report only)

ggen-oracle design docs cite exact line numbers in the external wasm4pm-compat crate source (e.g., `conformance.rs:62`). These decay on upstream releases with no automated detection. No fix applied — document here as a known risk.

---

## Project-Wide TPS/DfLSS Audit (2026-06-09)

### Applied countermeasures

| TPS lens | Gap | Fix |
|---|---|---|
| Muda — version authority | 4 internal Rust crates pinned at 26.6.5 vs workspace 26.6.9 | Converted to `workspace = true` |
| Muda — workspace hygiene | miniml-core re-declared serde/serde_json/wasm-bindgen inline | Converted to `workspace = true` |
| Muda — dead dep | `lazy_static` unused in wasm4pm-cognition | Removed |
| Muda — version scheme | playground/lab at 26.6.5; examples at 1.0.0 | Bumped all to 26.6.9 CalVer |
| Muda — workspace protocol | playground used `file:` deps (7 entries) | Converted to `workspace:*` |
| Jidoka / poka-yoke | verify-versions.sh ran release-only, never on PR | Added as PR-time CI gate in test.yml |
| Jidoka / poka-yoke | FM-5 prohibition enforced only by dev-time hook | Added CI grep gate in test.yml |

### Known debt (report-only, no fix this pass)

- **17/60 algorithms** have zero integration tests (alignments, bpmn_import, etc.)
- **OTEL 100% coverage** claimed mandatory — no CI enforcement; requires design work
- **BLAKE3 receipt chain** claimed mandatory — no CI verification of receipt emission
- **Determinism gate** (bit-exact output) — not enforced in CI
- **devDependency hoisting** — typescript/vitest/@types/node duplicated across 13+ packages with version skew (^5.3/^5.7/^6.0); deferred
- **bincode + number_prefix** unmaintained advisories (dev-deps only) — low risk, monitor
- `watch.ts` cognition contract uses non-existent `decision`/`hash` fields; swarm exports non-existent `createSwarmMcpServer`
- npm `package-lock.json` lockfiles — Chesterton check result determines disposition (see Fix-TS phase)

---

## Swarm Removal + Autoinstinct Wiring (2026-06-09)

### Swarm removed
@wasm4pm/swarm (packages/swarm/) deleted. Reason: only surface emitting fake outputs (synthetic fitness fallbacks, hardcoded compare baselines 0.80/0.84, mocked-LLM demo mode). 40+ reference sites cleaned. PSO algorithm (genetic_discovery.rs) retained — it is an algorithmic primitive, not the coordinator. npm deprecation: run `npm deprecate @wasm4pm/swarm "Discontinued — cognition+autoinstinct supersede"`.

### Autoinstinct wired (9 → 13 breeds)
Four 1977-substrate domain modules (vision/semantics/neurosis/learning, 582 lines, previously real-but-unreachable) now wired as CognitionBreed trait implementations. All reachable via `cognition_run({"breed":"autoinstinct_neurosis",...})`.

### Breed contract table (post-change)

| Breed | Year | Input | Output |
|---|---|---|---|
| autoinstinct_vision | 1977 | facts: block scene descriptions | candidates: observed objects; selected: first clear object |
| autoinstinct_semantics | 1977 | intent: NL sentence | candidates: Schank CD primitive acts; selected: SemanticFrame |
| autoinstinct_neurosis | 1977 | facts: beliefs; candidates: stimuli | selected: affect state (fear/anger/mistrust) |
| autoinstinct_learning | 1977 | goals: goal list; facts: initial state | candidates: plan steps; selected: step count |

All breeds emit non-empty inference_trace (Rank-2 postcondition).
