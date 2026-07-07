# Aurora — a closed autonomic loop over a synthetic hospital

Aurora is the end-to-end case study that closes wasm4pm's autonomic (MAPE-K)
loop: history is mined, verdicts are deliberated, a response is planned,
the plan is executed with cryptographic receipts, and the execution's own
event log becomes the next cycle's history.

## 1. The triad doctrine

- **PDDL is the FUTURE** — a durative-actions, numeric-fluents PDDL domain/problem
  is planned natively in Rust (`crates/wasm4pm-planner`).
- **POWL v2 is the PRESENT** — the temporal plan is converted to a POWL v2 partial
  order and executed on the proof-carrying engine (`wasm4pm/src/powl_execution.rs`).
- **OCEL 2.0 is the PAST** — execution emits an OCEL 2.0 log that is re-mined,
  closing the loop.

## 2. The synthetic hospital dataset

`aurora_log()` in `crates/wasm4pm-planner/tests/aurora_loop.rs` builds a
deterministic log (no RNG; structured variation), mirrored in XES by
`examples/17-aurora-hospital.ts`. Trace variants: A1/A2 (sterile lab path with
`vitals_check` ∥ `lab_collect` in both orders), B (fast track), C (sepsis:
prefix `[triage, sepsis_alert]` always ends `icu_transfer`), B-contaminated,
and a late `rapid_test` variant. Days 1–14 use 12-minute event gaps; days
15–28 use 4-minute gaps. Five planted phenomena:

1. **Never-together** — `sterile_prep` never co-occurs with `contaminated_flag`.
2. **Concept drift** — flu season: late traces replace the `lab_*` block with `rapid_test`.
3. **Outcome** — the sepsis prefix deterministically leads to `icu_transfer`.
4. **Speedup** — per-trace event gaps shrink over time (12 → 4 minutes).
5. **Structured model** — the planted concurrency must yield a real (non-flower) process tree.

## 3. The four MAPE-K phases and measured evidence

Entry points: Rust test `aurora_closed_autonomic_loop` in
`crates/wasm4pm-planner/tests/aurora_loop.rs`; TypeScript sweep in
`examples/17-aurora-hospital.ts`; plan conversion `plan_to_powl_v2` and
`max_parallelism` in `crates/wasm4pm-planner/src/schedule.rs`; engine
`execute_powl_string` in `wasm4pm/src/powl_execution.rs`.

**Phase 1 — PAST (mine the history).** Verified assertions, each comparing a
computed value to a planted phenomenon:
- `compute_log_skeleton` surfaces the concrete never-together pair
  (`contaminated_flag`, `sterile_prep`).
- Drift: `total_variation_distance` (`wasm4pm/src/prediction_drift.rs`, a real
  L1/2 distance over union keys) between early/late activity frequencies must
  exceed 0.15, plus a hard vocabulary check (`lab_analyze` in early window only).
- `predict_outcome_from_log` on prefix `[triage, sepsis_alert]` must return
  `outcome == "icu_transfer"` with `probability > 0.7`.
- `analyze_process_speedup_from_log` must report `trend == "speedup"`.
- Inductive miner output must not be a flower model.

**Phase 2 — ANALYZE (breeds deliberate).** `ltl_monitor` checks
`G (sepsis_alert -> F antibiotics)` over mined states and must return
`conforms == "true"`; `mycin` runs a CF chain over culture facts and must
produce a non-empty inference trace; `meta_reasoning` arbitrates the verdicts.
Determinism gate: two `dispatch_breed("ltl_monitor")` runs must serialize to
byte-identical JSON.

**Phase 3 — FUTURE (PDDL plans the response).** The `aurora-response` domain
(durative `perform-task`, `available-nurses` fluent) with two pending tasks
(`transfer_icu`, `restock_rapid_tests`) and 2 nurses is grounded and solved
by `find_temporal_plan`. Asserted: exactly 2 plan steps and
`max_parallelism(&plan) >= 2` — `max_parallelism` is a genuine sweep-line
interval-overlap counter (ends sort before starts at equal time).

**Phase 4 — PRESENT (POWL v2 executes).** `plan_to_powl_v2` converts the plan
to a `PartialOrder(plan)` string (step i precedes step j iff `end_i <=
start_j`; overlapping steps stay unordered/parallel). `execute_powl_string`
runs it; asserted `conformance == "conforms"`.

**Measured verification.** `cargo test -p wasm4pm-planner --test aurora_loop`:
`test aurora_closed_autonomic_loop ... ok. 1 passed; 0 failed` (0.01s);
`triad_loop`'s `plan_converts_to_powl_v2_and_executes_to_ocel ... ok`.
`cargo test -p wasm4pm --test powl_engine`: 4 passed, 0 failed (sequence
conformance, XOR fires one branch, determinism, parallel closed loop). A probe
executing two different POWL models produced two distinct 64-hex chain hashes
(`7d6c036d…` vs `8938b573…`), confirming the hash is computed, not constant.
`npx tsx examples/17-aurora-hospital.ts` printed all four phase lines:
`PAST: 60/60 algorithms mined the history`, `ANALYZE: 55/55 breeds deliberated
with receipts`, `PRESENT: plan executed, chain d6c411b1614d2030…`, and
`CLOSURE: emitted OCEL re-mined — past → present → future → past ✓`. The
example has no silent skips: failures are collected and asserted empty,
missing fixtures are recorded as failures, receipt count is cross-asserted
against `BREED_IDS.length`, breed `output_hash` length must be exactly 64,
and `main().catch` exits 1.

## 4. Loop closure and receipts

- **BLAKE3 chain hash.** `execute_powl_string` seals each run with a
  `receipt.chain_hash` produced by a BLAKE3 hasher finalize
  (`wasm4pm/src/powl_execution.rs:239`); the run id itself is a BLAKE3 hash of
  the model string and iteration bound.
- **Deterministic replay.** Two `execute_powl_string` runs of the same plan
  must produce identical `receipt.chain_hash` values (asserted in
  `aurora_loop.rs`).
- **Closure.** The emitted OCEL must contain `op_fired` and `run_sealed`
  events, every plan step's sanitized id must appear among the fired OCEL
  activities, and (in the example) the emitted OCEL is re-loaded and re-mined
  with `ocel_dfg` — the PRESENT's output is the next cycle's PAST. The
  example additionally asserts `overflow === false` and
  `chain_hash.length === 64`, with its observed chain `d6c411b1614d2030…`.

Known soft spots (documented, not hidden): the `meta_reasoning` check only
asserts a non-empty explanation; the mycin CF value (0.7 × min-premise = 0.63)
is fed to `meta_reasoning` as a string but not itself asserted.

## 5. How to run it

```bash
# Rust closed loop (planner + breeds + POWL engine)
cargo test -p wasm4pm-planner --test aurora_loop

# POWL engine receipts and determinism
cargo test -p wasm4pm --test powl_engine

# TypeScript full sweep (60 algorithms + 55 breeds + loop closure)
# requires wasm4pm/pkg (pnpm build) and installed workspace deps
npx tsx examples/17-aurora-hospital.ts
```
