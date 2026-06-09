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
