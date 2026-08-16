# WASM4PM Autonomic Framework: MAPE-K + Viability Gate Design

**Status:** Draft — pending user review
**Date:** 2026-08-16

## Why this document exists

A codebase audit (2026-08-16) confirmed that wasm4pm already has every piece
of a complete autonomic framework — Monitor, Analyze, Plan, Execute,
Knowledge, and a second-order viability layer — but they are structurally
disconnected:

| Phase | File | Status found |
|---|---|---|
| Monitor + Analyze | `wasm4pm/src/prediction_drift.rs`, `wasm4pm/src/anomaly.rs` | **Real, wired** — called from the CLI (`mining.rs`), wasm-bindgen exports, Python bindings, MCP server, on real `EventLog`/OCEL data. |
| Plan | `wasm4pm/src/policy_persistence.rs`, `crates/wasm4pm-cognition/.../autosystems/contract.rs::run_contract` | **Dead-ended** — zero production callers, only their own test files. |
| Execute | `wasm4pm/src/action_dispatch.rs::dispatch_action` | **Dead-ended** — zero production callers; WASM-compatible (no I/O) so even called it does nothing real. |
| Knowledge | `wasm4pm/src/autonomic_audit_trail.rs` | **Dead-ended** — Merkle-chained audit log, only instantiated in its own test file. |
| Second-order (viability) | `wasm4pm/src/advanced/wasm4auto.rs` (1659 lines) | **Dead-ended** — computes a robust controlled-invariant viability kernel; its `AdaptationIntent`/`ReconstitutionIntent`/`AutonomicReceipt` output types have zero consumers anywhere in the repo. |

"Complete" therefore means **wiring**, not rewriting: this design reuses all
five existing files and adds the connective tissue (traits, a driver, and a
small number of additive changes, each named explicitly) that closes the
loop.

No local reference papers exist for this domain (a corpus search of
`~/Documents/Papers`, ~300 PDFs + a 97-paper arXiv dump, returned zero hits
across cybernetics, viability theory, MAPE-K, self-adaptive systems, control
theory for software, requisite variety, and model adequacy). Citations below
are to the named literature by title/year, not to local files.

## Process that produced this design

This spec was produced via the brainstorming skill's architectural path,
scoped explicitly by the user as: (1) both first-order and second-order
layers must be genuinely wired together, (2) the framework must regulate
both wasm4pm itself and externally-mined processes via separable
interfaces, (3) real actuation via a pluggable `Actuator` trait with one
shipped in-process implementation, (4) a provable — not merely asserted —
safety envelope gating every action through `wasm4auto`'s viability kernel,
(5) explicit alignment to named academic reference architectures rather than
ad hoc terminology, and per the user's own request, (6) an adversarial
multi-agent review panel before finalizing.

The panel — six independent subagents individually embodying W. Ross Ashby
(Law of Requisite Variety), Stafford Beer (Viable System Model), Jean-Pierre
Aubin (viability theory), Jeffrey Kephart & David Chess (the original 2003
MAPE-K reference architecture paper), Joseph Hellerstein (control theory for
computing systems), and a Rust-systems-engineer skeptic — reviewed a first
draft and returned 8 FATAL-flaw and 9 SERIOUS-concern findings. Every one of
those is resolved (fixed in the design, or explicitly scoped out with a
stated reason) in the "Concerns Addressed" table below and the design that
follows it. Two representative catches, to show this wasn't rubber-stamped:
Ashby's panel found the draft's "regulator variety is matched to each Plant"
language was an unearned quantitative claim with no variety ever computed —
the revision drops the claim and states the actual safety property (viability
gating) plainly; the Rust-skeptic panel found `Planner` had no `P: Plant`
type bound despite the design claiming per-plant action restriction was
"enforced at the type level" — false as written — the revision adds the
bound, making it actually true and compiler-checked.

---

## Concerns Addressed

| Reviewer | Finding | Verdict | Resolution |
|---|---|---|---|
| Ashby | `admissible_actions()` called a "requisite-variety bound" with no variety computed | FATAL | Citation reworded (§2): action sets are a documented engineering choice, gated by viability, not a variety-matching proof. No quantitative variety claim made anywhere. |
| Ashby | "Variety matched separately to each Plant" overclaim | SERIOUS | Same fix — dropped the "matched" language; kept the type-level actuation restriction as what it is: a safety boundary. |
| Aubin | Kernel fidelity to real (continuous) plant dynamics never established; fail-closed catches lookup-miss, not model error | FATAL | §3 adds an explicit **Model Fidelity Statement**: `wasm4auto.rs`'s kernel is declared a *conservative, coarse-grid* abstraction, not a proof of real-plant safety; a runtime **invariant monitor** (new, small) independently checks projected state dominance each tick and widens Refuse on discretization uncertainty. Scoped honestly, not hidden. |
| Beer | No algedonic (hierarchy-bypassing) channel | FATAL | §3b adds a genuine preemptive path: `EmergencyMonitor` can short-circuit straight to a minimal-check hard-stop actuation, bypassing Analyze/Plan. |
| Beer | No VSM recursion; two `Plant`s are siblings, not nested | FATAL | Reframed: dropped "recursive structure" claim entirely; `MinedProcessPlant`'s `Alert` output now feeds `SelfPlant`'s `Analyzer` as an extra disturbance input (§2b), giving real (if shallow) coordination instead of a false recursion claim. |
| Beer | Audit-log citation misapplied Beer's System 3\* to co-located audit logging | SERIOUS | Citation rewritten to credit the audit trail only as a Knowledge substrate (Kephart & Chess), not System 3\*; System 3\*-style bypass is now the new `EmergencyMonitor`, correctly cited under Beer. |
| Kephart & Chess | Knowledge is write-only, not shared/bidirectional | SERIOUS | `AutonomicAuditTrail` gains a real read path: `Analyzer`/`Planner` now take `&AutonomicAuditTrail` and query recent history, making it consulted, not just appended to. |
| Kephart & Chess | Monitor/Analyze reused CLI-shaped functions with unstated state/cadence assumptions | SERIOUS | §1b states ownership explicitly: drift/anomaly state is now owned per-tick by `SelfPlant`/`MinedProcessPlant` snapshots, with a documented window-vs-tick-cadence contract. |
| Kephart & Chess | Oscillation/hysteresis unshown; kernel/policy staleness unaddressed | SERIOUS | §4 adds explicit dwell-time enforcement via `ConvergenceMetrics` and a kernel-refresh trigger tied to `PolicyCheckpoint` age. |
| Hellerstein | No sampling rate stated | FATAL | §5 states tick cadence explicitly (host-driven, bounded, documented relationship to `SelfPlant` settling time). |
| Hellerstein | No stability/convergence argument | FATAL | Reframed honestly: this is declared a **safety-gated system**, not a stability-proven controller; a bounded-hunting argument (not full stability proof) is given in §4b, scoped explicitly. |
| Hellerstein | Plan→Refuse→replan can loop forever (no liveness bound, no refusal feedback into policy) | FATAL | §4b adds a mandatory penalty coupling refusals into `ConvergenceMetrics`, plus a hard consecutive-refusal circuit breaker that escalates via the new algedonic channel. |
| Rust-skeptic | "Enforced at type level" claim false — `Planner` had no `P: Plant` bound | FATAL | `Planner<P: Plant>` now carries the bound; action-set restriction is a real, checked-at-compile-time property. |
| Rust-skeptic | BLAKE3 receipt persistence path unaddressed (core crate is I/O-forbidden) | SERIOUS | §5 states explicitly: `tick()` returns `TickReceipt`; the **host** (Node/JS caller, outside WASM) is responsible for the `.wasm4pm/receipts/latest.json` write. Named, not implied. |
| Rust-skeptic | "Reused unmodified" claim hid real edits to `DispatchOutcome`/`action_dispatch.rs` | SERIOUS | §1 corrected: `action_dispatch.rs` gets one additive change (a `Refused` variant + `apply_to`), named explicitly as a modification, not "unmodified." |
| Rust-skeptic | `ViabilityGate<'static>` kernel never refreshed | SERIOUS | Lifetime dropped; gate now holds an owned, versioned kernel handle refreshed on the staleness trigger. |
| Rust-skeptic | No `Result`, no error path, undefined types | SERIOUS | All trait methods now return `Result<_, AutonomicError>`; core types given full field lists (§1c). |
| Rust-skeptic | OTEL coverage only on refuse path | MINOR | §5 lists all five per-phase span names explicitly. |

## 1. Component Map (Reused Files → Traits)

| Phase | Trait/Struct | Maps onto | Status |
|---|---|---|---|
| Knowledge | `AutonomicAuditTrail` | `wasm4pm/src/autonomic_audit_trail.rs` | Unmodified; gains new read methods (`recent(n)`, `last_refusal()`) already expressible against its existing Merkle-log storage — no schema change. |
| Monitor | `DriftMonitor`, `AnomalyMonitor` | `wasm4pm/src/prediction_drift.rs`, `wasm4pm/src/anomaly.rs` | Unmodified internals; called with explicit per-`Plant`-owned state (§1b). |
| Analyze | `Analyzer<P: Plant>` | thin wrapper | New. |
| Plan | `Planner<P: Plant>` | `wasm4pm/src/policy_persistence.rs`, `crates/wasm4pm-cognition/.../autosystems/contract.rs::run_contract` | New; `P`-bound (fixes the type-level-safety FATAL). |
| Viability Gate | `ViabilityGate` | `wasm4pm/src/advanced/wasm4auto.rs` | Wrapped; kernel handle owned+versioned, not `'static`-borrowed. |
| Emergency | `EmergencyMonitor` (new) | reads `SelfPlant` snapshot only | New, minimal — see §3b. |
| Execute | `Actuator<P>` + `InProcessConfigActuator` | `wasm4pm/src/action_dispatch.rs::dispatch_action` | **Modified, not unmodified**: `DispatchOutcome` gains a `Refused(ReconstitutionIntent)` variant and an `apply_to(&mut SelfPlant)` method. |

```rust
pub trait Monitor<P: Plant>    { fn observe(&self, plant: &P) -> Result<Observation, AutonomicError>; }
pub trait Analyzer<P: Plant>   { fn analyze(&self, obs: &Observation, audit: &AutonomicAuditTrail) -> Result<AnalysisSummary, AutonomicError>; }
pub trait Planner<P: Plant>    { fn plan(&self, a: &AnalysisSummary, ckpt: &PolicyCheckpoint, audit: &AutonomicAuditTrail) -> Result<RlAction, AutonomicError>; }
pub trait Actuator<P: Plant>   { fn execute(&self, plant: &mut P, action: &RlAction, ctx: &ExecutionContext) -> Result<DispatchOutcome, AutonomicError>; }
```

Adding `P: Plant` to `Planner` is what actually makes the per-plant action
restriction a compiler-checked property: an `AutonomicLoop<MinedProcessPlant,
M, A>` requires `A: Actuator<MinedProcessPlant>`, and no such impl is
provided — so the compile fails, not "probably won't be called."

## 1b. State ownership and tick-cadence contract

`prediction_drift.rs`/`anomaly.rs` are CLI-shaped, stateless-call functions.
To avoid silently resetting or unboundedly accumulating detection windows,
drift/anomaly state is owned as fields on the calling `SelfPlant`/
`MinedProcessPlant` (`drift_window: VecDeque<Sample>`, capped, evicted on
push) and passed **by reference** into the reused functions each tick — the
reused functions stay pure/stateless; state lifecycle is the new code's job,
stated here explicitly rather than left implicit.

## 1c. Core types

```rust
pub struct Observation { pub state: StateSnapshot, pub disturbance_estimate: DisturbanceEstimate, pub ts_tick: u64 }
pub struct AnalysisSummary { pub trend: TrendClass, pub anomaly_score: f32, pub drift_score: f32 }
pub enum RlActionKind { Scale, Retry, Fallback, Restart, Alert, RecommendPolicy, HardStop }
pub struct RlAction { pub kind: RlActionKind, pub params: ActionParams }
pub enum DispatchOutcome { Scaled{ memory_mb: u32, timeout_ms: u32, batch_size: u32 }, RetryScheduled{ attempt: u32, delay_ms: u32 }, FellBack{ algorithm: MiningAlgorithm }, RestartInitiated{ state_cleared: bool }, Refused(ReconstitutionIntent), NoOp }
pub struct ExecutionContext { pub obs: Observation, pub tick_id: u64 }
pub enum AutonomicError { MonitorFailed(String), PlanInfeasible(String), DispatchFailed(String), KernelStale }
```

## 2. The Plant Abstraction

Ashby's Law of Requisite Variety (*An Introduction to Cybernetics*, 1956)
motivates *why* wasm4pm splits self-regulation from process-observation into
two `Plant` implementations with different, type-restricted action
repertoires — but this design makes **no quantitative variety claim**.
`admissible_actions()` is a fixed, engineer-chosen action repertoire, not a
computed variety bound; its safety property comes entirely from the
viability gate (§3), not from Ashby's inequality. `MinedProcessPlant`'s
action set (`Alert`, `RecommendPolicy`) is a strict, type-enforced subset
because wasm4pm has direct actuation only over itself.

```rust
pub trait Plant {
    type StateSnapshot;
    type Disturbance;
    fn snapshot(&self) -> Self::StateSnapshot;
    fn admissible_actions(&self) -> &'static [RlActionKind];
}
pub struct SelfPlant { pub batch_size: usize, pub timeout_ms: u64, pub retry_count: u8, pub algorithm: MiningAlgorithm, pub drift_window: VecDeque<Sample> }
pub struct MinedProcessPlant<'a> { pub event_log: &'a EventLog, pub last_conformance: ConformanceScore, pub drift_window: VecDeque<Sample> }
```

## 2b. Coordination between Plants

Beer's Viable System Model (*Brain of the Firm*, 1972) requires that
regulatory units sharing a resource envelope actually coordinate, not run as
parallel strangers. This design does **not** claim VSM recursion (the two
`Plant`s are siblings, not nested sub-systems). Instead: `MinedProcessPlant`'s
`Alert` output, when emitted, is written to `AutonomicAuditTrail` and
consumed by `SelfPlant`'s `Analyzer` on the next tick as an additional
disturbance input — a real, if shallow, System-2-style coordination signal
between the two loops, rather than two independently-gated instances with no
cross-influence.

## 3. Viability Gate — Model Fidelity Statement + Blocking Precondition

Aubin's viability theory (*Viability Theory*, 1991) guarantees no admissible
trajectory from inside the kernel exits the constraint set — **conditional
on the kernel's transition model being a sound over-approximation of the
real plant's dynamics.** `wasm4auto.rs`'s kernel, computed by monotone
fixed-point elimination over a bounded grid (`max_states`), is declared here
explicitly as a **conservative, discretized abstraction** of `RuntimeState`,
not a verified model of the continuous real plant. To close that gap — a
naive fail-closed policy only catches a lookup miss, not a wrong model — the
gate gains an independent runtime check:

```rust
pub struct ViabilityGate { kernel: VersionedKernel, invariant: StateInvariantMonitor }
pub enum GateDecision { Admit(RlAction), Refuse(ReconstitutionIntent) }
impl ViabilityGate {
    pub fn check(&self, state: &StateSnapshot, proposed: RlAction) -> Result<GateDecision, AutonomicError> {
        if !self.invariant.projection_is_faithful(state) { return Ok(GateDecision::Refuse(self.kernel.conservative_intent())); }
        if self.kernel.contains(state, &proposed) { Ok(GateDecision::Admit(proposed)) } else { Ok(GateDecision::Refuse(self.kernel.reconstitution_intent(state))) }
    }
}
```

`StateInvariantMonitor` checks a cheap, named sufficient condition (e.g.
observed `memory_mb` growth rate within the grid cell's assumed bound) — it
is not a full soundness proof, and the design states that limitation rather
than hiding it: this closes the *detectable* aliasing cases, not all of
them. `VersionedKernel` replaces a `'static` borrow with an owned, versioned
handle refreshed on the staleness trigger in §4.

## 3b. Algedonic channel

A minimal `EmergencyMonitor` reads only `SelfPlant`'s cheapest-to-sample
fields (`memory_mb`, `queue_depth`) and, on a hard-coded catastrophic
threshold, bypasses Analyze/Plan entirely, calling `Actuator::execute` with a
fixed `HardStop` action gated only by kernel membership (not the full
pipeline). This runs synchronously before the normal tick if the host caller
invokes it more frequently than full ticks, or inline at the top of `tick()`
otherwise — giving a genuine latency-class distinction from routine drift
handling.

## 4. Oscillation, Refusal Feedback, and Kernel Staleness

`ConvergenceMetrics` (existing, `policy_persistence.rs`) gains a stated
consumption contract: `Planner::plan` MUST apply a minimum dwell time since
the last non-`NoOp` action for the same `RlActionKind`, read from
`ConvergenceMetrics`. On `Refuse`, `checkpoint.penalize` applies an explicit
penalty to the refused action's weight. `VersionedKernel` is refreshed when
`PolicyCheckpoint`'s age exceeds a configured horizon.

## 4b. Bounded hunting, not proven stability

Aubin's kernel and Hellerstein's control theory (*Feedback Control of
Computing Systems*, Hellerstein, Diao, Parekh & Tilbury, 2004) answer
different questions — kernel membership proves *no unsafe state is
entered*; it says nothing about *convergence*. This design does not claim a
stability proof (loop gain, pole placement) and states that explicitly.
What it does provide, concretely: a **circuit breaker** — `N` (configurable)
consecutive `Refuse` decisions for the same `RlActionKind` triggers the
algedonic path (§3b) with a `HardStop`/no-op-and-alert fallback, giving a
liveness bound (the system cannot Plan→Refuse loop indefinitely without
escalating) even without a convergence proof. Tick cadence is host-driven and
documented against `SelfPlant.timeout_ms` as the reference settling time; no
claim of stability margin is made beyond this bound.

## 5. The Driver: `tick()`

```rust
pub struct AutonomicLoop<P: Plant, M: Monitor<P>, A: Actuator<P>> {
    monitor: M, analyzer: Box<dyn Analyzer<P>>, planner: Box<dyn Planner<P>>,
    gate: ViabilityGate, actuator: A, audit: AutonomicAuditTrail,
    checkpoint: PolicyCheckpoint, emergency: EmergencyMonitor, _plant: PhantomData<P>,
}
impl<P: Plant, M: Monitor<P>, A: Actuator<P>> AutonomicLoop<P, M, A> {
    #[tracing::instrument(name = "autonomic.tick", skip_all)]
    pub fn tick(&mut self, plant: &mut P) -> Result<TickReceipt, AutonomicError> {
        if let Some(hard) = self.emergency.check(plant) {
            return self.execute_and_receipt(plant, hard, "autonomic.emergency");
        }
        let obs = span!("autonomic.monitor", self.monitor.observe(plant)?);
        let analysis = span!("autonomic.analyze", self.analyzer.analyze(&obs, &self.audit)?);
        let proposed = span!("autonomic.plan", self.planner.plan(&analysis, &self.checkpoint, &self.audit)?);
        match span!("autonomic.gate", self.gate.check(&obs.state, proposed)?) {
            GateDecision::Admit(action) => self.execute_and_receipt(plant, action, "autonomic.execute"),
            GateDecision::Refuse(intent) => { self.checkpoint.penalize(&intent); self.receipt_only(DispatchOutcome::Refused(intent)) }
        }
    }
}
```

Tick cadence is host-driven (JS/Node caller invokes `tick()` on a stated
interval, documented against `SelfPlant.timeout_ms`); `TickReceipt` (BLAKE3
`input_hash`/`output_hash`/`audit_head`) is computed inside WASM and
**persisted to `.wasm4pm/receipts/latest.json` by the host caller**, not the
core crate — the core crate stays filesystem-I/O-forbidden per the repo's
own rules. `canonical_bytes()` uses a fixed field order, documented on each
type, so the hash is reproducible.

## 6. Citations Tied to Decisions

- **Kephart & Chess, "The Vision of Autonomic Computing," IEEE Computer, 2003** — Knowledge as a genuinely *consulted* store: `Analyzer`/`Planner` read `AutonomicAuditTrail`, not just append to it.
- **Ashby, *An Introduction to Cybernetics*, 1956** — motivates the two-`Plant`, type-restricted-action-set split as an engineering choice; no variety inequality is computed or claimed.
- **Beer, *Brain of the Firm*, 1972** — the `EmergencyMonitor` bypass (§3b) is the algedonic channel; `MinedProcessPlant→SelfPlant` disturbance feed (§2b) is the (non-recursive, single-level) coordination link.
- **Aubin, *Viability Theory*, 1991** — kernel-as-precondition, with an explicit, stated model-fidelity limitation (§3) rather than an unqualified safety claim.
- **Hellerstein, Diao, Parekh & Tilbury, *Feedback Control of Computing Systems*, 2004** — cited for the bounded-hunting circuit breaker (§4b) as the honest, scoped-down substitute for a full stability proof, which this design does not attempt.

## 7. Rust Implementation Discipline

Per the repo's existing conventions (`action_dispatch.rs`, `wasm4auto.rs`)
and the user's request for advanced idiom, not just correctness:

- **Newtypes over raw ids** — `StateId`/`ActionId`/`DisturbanceId` (already
  `u32` newtypes in `wasm4auto.rs`) extend to `TickId(u64)`, not bare
  integers, so a `TickId` can never be passed where an `ActionId` is
  expected.
- **Static dispatch by default** — `Monitor<P>`/`Actuator<P>` are
  monomorphized generic parameters on `AutonomicLoop<P, M, A>` (zero-cost);
  `Analyzer`/`Planner` are `Box<dyn _>` only because multiple concrete
  strategies may need to be swapped at runtime per `Plant` instance — every
  other trait stays statically dispatched.
- **No panics on the hot path** — every trait method returns
  `Result<_, AutonomicError>`; `AutonomicError` is a closed `#[non_exhaustive]`
  enum so downstream matches must handle unknown-future-variant gracefully
  without a wildcard swallowing real errors silently.
- **`#[must_use]`** on `GateDecision`, `DispatchOutcome`, and `TickReceipt` —
  a computed-but-ignored gate decision or receipt is exactly the dead-end bug
  this whole design exists to close; the compiler should refuse to let it
  happen again.
- **No `unwrap`/`expect` on external or model input** — `VersionedKernel`
  refresh, `StateInvariantMonitor` projection, and `PolicyCheckpoint` load
  all return `Result`; only literals and values already proven non-`None` on
  a prior line get an `expect` with a message stating the invariant.

## 8. Out of Scope (YAGNI)

- Full continuous-state stability/Lyapunov proof for the Plan→Refuse cycle — replaced by the bounded circuit-breaker liveness guarantee (§4b), a deliberate scope limit, not an oversight.
- Formal interval/set-valued soundness proof for the viability kernel's discretization — `StateInvariantMonitor` is a partial, named mitigation, not a full proof; full soundness is future work.
- Host-process and network actuation — `Actuator` extension points only; `InProcessConfigActuator` is the only shipped implementation.
- Multi-tenant/distributed audit trail.
- Async/threaded execution — stays synchronous, WASM-compatible.
- Deep VSM recursion (nested sub-loops) — the shallow single-level coordination in §2b is the shipped substitute.

## 9. Phases of Implementation

1. **Type/error scaffolding** — `AutonomicError`, full struct/enum bodies (§1c), `Result`-returning trait signatures.
2. **`action_dispatch.rs` additive change** — `DispatchOutcome::Refused`, `apply_to`, with tests confirming existing call sites unaffected.
3. **Plant + state ownership** — `SelfPlant`/`MinedProcessPlant` with owned drift/anomaly windows (§1b), `Monitor`/`Analyzer<P>` wired to reused functions.
4. **Viability gate hardening** — `VersionedKernel`, `StateInvariantMonitor`, kernel refresh trigger.
5. **Planner + dwell-time/refusal-penalty coupling, circuit breaker** — closes the liveness gap.
6. **`EmergencyMonitor` algedonic path + `MinedProcessPlant→SelfPlant` coordination feed.**
7. **`tick()` driver, OTEL spans on all five phases, host-side receipt persistence wiring, end-to-end replay verification (`AutonomicAuditTrail::verify_gate_invariant`).**

## See Also

- `wasm4pm/src/advanced/wasm4auto.rs` — the existing second-order viability layer this design wires in.
- `wasm4pm/src/action_dispatch.rs`, `wasm4pm/src/prediction_drift.rs`, `wasm4pm/src/anomaly.rs`, `wasm4pm/src/policy_persistence.rs`, `wasm4pm/src/autonomic_audit_trail.rs` — the four other reused files.
- `.claude/rules/_core/absolute.md` — BLAKE3 receipt chain, OTEL coverage, and Andon-stop rules this design must respect.
