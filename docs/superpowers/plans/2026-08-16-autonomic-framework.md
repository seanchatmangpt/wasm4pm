# Autonomic Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire wasm4pm's five existing, currently-disconnected autonomic pieces (Monitor/Analyze, Plan, Execute, Knowledge, second-order viability gate) into one real MAPE-K + viability-gated loop, for both wasm4pm-self and externally-mined-process plants.

**Architecture:** A new `wasm4pm/src/autonomic/` module defines thin `Plant`/`Monitor`/`Analyzer`/`Planner`/`Actuator` traits and a `ViabilityGate` wrapper, each backed by an *existing* file (reused, not rewritten) except for two small, explicitly-additive changes to `action_dispatch.rs` and `autonomic_audit_trail.rs`. A driver struct (`AutonomicLoop::tick()`) sequences Monitor→Analyze→Plan→viability-gate→Execute→Knowledge, gated fail-closed.

**Tech Stack:** Rust (stable, no async/threads/filesystem I/O in the core crate), `wasm-bindgen`-compatible, `serde` for types, `tracing` for OTEL spans, BLAKE3 for receipts (via existing `blake3` crate dependency already used by `AuditEvent`/`PolicyCheckpoint`).

**Spec:** `docs/superpowers/specs/2026-08-16-autonomic-framework-design.md`

## Correction to the spec's audit (discovered during planning — read this before Task 3)

The spec's "Plan is dead-ended" framing is **incomplete**. A deeper grep found
two additional, real, production-wired decision-making implementations the
original audit missed:

- **`wasm4pm/src/rl_orchestrator.rs`** — `RlOrchestrator` holds 5 pluggable RL
  agents (QLearning/SARSA/DoubleQLearning/ExpectedSARSA/REINFORCE) plus a
  LinUCB bandit for agent selection, computes SPC-driven reward, and exposes
  `select_action(&self, state: &RlState) -> RlAction` and `run_cycle(...)`.
  It lives behind a `thread_local` (`RL_ORCHESTRATOR` in `lib.rs`) reset by
  several `#[wasm_bindgen]` exports.
- **`wasm4pm/src/autoprocess.rs`** — `AutoProcessAgent`, a nanosecond-budget
  Perception→Decision→Protection→Optimization loop with its own Q-table,
  used in production benches (`wasm4pm/benches/autoprocess_latency.rs` etc.)
  and `lib.rs`.

Neither of these calls `action_dispatch.rs::dispatch_action`,
`autonomic_audit_trail.rs`, or `advanced/wasm4auto.rs` — so the spec's core
finding (Execute/Knowledge/viability-gate are disconnected from
Plan-and-earlier) **still holds**. What's corrected: `Planner` in this plan
**delegates to `RlOrchestrator::select_action`** (the richer, general-purpose
backend) rather than reimplementing policy selection from scratch — this is
more YAGNI-compliant than the spec's illustrative sketch, which didn't know
`RlOrchestrator` existed. `AutoProcessAgent` is a specialized perf kernel,
not the general orchestration entry point, and is out of scope here (noted
again in Task 4).

## Global Constraints

- The `wasm4pm` core crate stays WASM-compatible: no `async`, no threads, no filesystem/network I/O in any type or function added by this plan.
- Every `AutonomicLoop::tick()` call must be able to produce a BLAKE3-hashed receipt (`TickReceipt`) with real `input_hash`/`output_hash`; the core crate computes the hash, the host (JS/Node caller) persists it to `.wasm4pm/receipts/latest.json` — this plan's code never touches the filesystem.
- Every new `pub fn`/`pub struct` gets a doc comment. Every trait method returns `Result<_, AutonomicError>` — no panics, no `unwrap()`/`expect()` on anything derived from runtime state (only on values already proven `Some`/`Ok` earlier in the same function, with a message stating the invariant).
- Tests are Chicago-style: real `EventLog`/`RlState`/`RlOrchestrator` objects and state-based assertions. No `mock`/`Mock`/`patch`/`monkeypatch`-equivalents — this repo has no such tooling in Rust anyway (no `mockall`), and this plan does not introduce any.
- Every existing file this plan modifies gets an **additive-only** diff: new variants, new methods. No existing method signature changes, no existing variant removed, no existing test's assumptions broken.
- `AuditEventType` gains one new variant (`ReconstitutionTriggered`); `DispatchOutcome` gains one new variant (`Refused`). Both are `#[non_exhaustive]`-free (matching existing style) — Task 1 and Task 5 update the two `match` sites each enum already has (their own file's `Display`/`description` impl) so the crate compiles with `-D warnings` on exhaustiveness.

---

## File Structure

New files (all under `wasm4pm/src/autonomic/`, one responsibility each):

| File | Responsibility |
|---|---|
| `wasm4pm/src/autonomic/mod.rs` | Module declaration, re-exports, `AutonomicError` |
| `wasm4pm/src/autonomic/types.rs` | `Observation`, `AnalysisSummary`, `ExecutionContext` (autonomic-specific, distinct from `action_dispatch::ExecutionContext`), `TickReceipt` |
| `wasm4pm/src/autonomic/plant.rs` | `Plant` trait, `SelfPlant`, `MinedProcessPlant`, `MiningAlgorithm`, `ConformanceScore` |
| `wasm4pm/src/autonomic/monitor.rs` | `Monitor<P>` trait, `DriftMonitor`, `AnomalyMonitor` (wrap `prediction_drift.rs`/`anomaly.rs`) |
| `wasm4pm/src/autonomic/analyzer.rs` | `Analyzer<P>` trait, `DriftAnalyzer` |
| `wasm4pm/src/autonomic/planner.rs` | `Planner<P>` trait, `OrchestratorPlanner` (wraps `RlOrchestrator`), dwell-time + refusal-penalty logic |
| `wasm4pm/src/autonomic/gate.rs` | `ViabilityGate`, `GateDecision`, `VersionedKernel` (wraps `advanced::wasm4auto`) |
| `wasm4pm/src/autonomic/emergency.rs` | `EmergencyMonitor` (algedonic bypass) |
| `wasm4pm/src/autonomic/actuator.rs` | `Actuator<P>` trait, `InProcessConfigActuator` (wraps `action_dispatch::dispatch_action`) |
| `wasm4pm/src/autonomic/loop_driver.rs` | `AutonomicLoop<P, M, A>`, `tick()` |

Modified files (additive only):

| File | Change |
|---|---|
| `wasm4pm/src/action_dispatch.rs` | Add `DispatchOutcome::Refused(ReconstitutionIntent)` variant + `apply_to(&mut SelfPlant)` method; update `description()`'s match. |
| `wasm4pm/src/autonomic_audit_trail.rs` | Add `AuditEventType::ReconstitutionTriggered(String)` variant; add `recent(&self, n: usize) -> &[AuditEvent]` and `last_refusal(&self) -> Option<&AuditEvent>` read methods. |
| `wasm4pm/src/lib.rs` | Add `pub mod autonomic;` |

New test files (integration, Chicago-style, real objects):

| File | Covers |
|---|---|
| `wasm4pm/tests/autonomic_plant_tests.rs` | `SelfPlant`/`MinedProcessPlant` construction and `admissible_actions()` |
| `wasm4pm/tests/autonomic_monitor_analyzer_tests.rs` | `DriftMonitor`/`AnomalyMonitor`/`DriftAnalyzer` against real `EventLog` fixtures |
| `wasm4pm/tests/autonomic_planner_tests.rs` | `OrchestratorPlanner` dwell-time + refusal-penalty against a real `RlOrchestrator` |
| `wasm4pm/tests/autonomic_gate_tests.rs` | `ViabilityGate::check` against a real `ViabilityKernel` |
| `wasm4pm/tests/autonomic_actuator_tests.rs` | `InProcessConfigActuator` mutating a real `SelfPlant` |
| `wasm4pm/tests/autonomic_loop_integration_tests.rs` | Full `tick()` end-to-end: Admit path and Refuse path, `AutonomicAuditTrail` replay |

---

### Task 1: Core types, `AutonomicError`, and additive audit-trail changes

**Files:**
- Create: `wasm4pm/src/autonomic/mod.rs`
- Create: `wasm4pm/src/autonomic/types.rs`
- Modify: `wasm4pm/src/autonomic_audit_trail.rs`
- Modify: `wasm4pm/src/lib.rs` (add `pub mod autonomic;` near the other `pub mod` declarations, alphabetically after `wasm4pm/src/lib.rs`'s existing `pub mod autoprocess;` block)
- Test: `wasm4pm/tests/autonomic_audit_trail_extensions_tests.rs`

**Interfaces:**
- Produces: `AutonomicError` (enum), `Observation`, `AnalysisSummary`, `TickReceipt` (structs) — all `pub`, all in `wasm4pm::autonomic`.
- Produces: `AutonomicAuditTrail::recent(&self, n: usize) -> &[AuditEvent]`, `AutonomicAuditTrail::last_refusal(&self) -> Option<&AuditEvent>`.

- [ ] **Step 1: Write the failing test for the audit-trail read methods**

```rust
// wasm4pm/tests/autonomic_audit_trail_extensions_tests.rs
use wasm4pm::autonomic_audit_trail::{AuditEventType, AuditPhase, AutonomicAuditTrail};

#[test]
fn recent_returns_last_n_events_in_order() {
    let mut trail = AutonomicAuditTrail::new();
    for i in 0..5u64 {
        trail.record_event(
            AuditEventType::AgentSelected(format!("agent-{i}")),
            "test".to_string(),
            AuditPhase::Decision,
            i,
        );
    }
    let recent = trail.recent(2);
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].cycle_count, 3);
    assert_eq!(recent[1].cycle_count, 4);
}

#[test]
fn recent_with_n_larger_than_len_returns_all() {
    let mut trail = AutonomicAuditTrail::new();
    trail.record_event(
        AuditEventType::AgentSelected("only".to_string()),
        "test".to_string(),
        AuditPhase::Decision,
        0,
    );
    assert_eq!(trail.recent(10).len(), 1);
}

#[test]
fn last_refusal_finds_most_recent_reconstitution_event() {
    let mut trail = AutonomicAuditTrail::new();
    trail.record_event(
        AuditEventType::AgentSelected("a".to_string()),
        "test".to_string(),
        AuditPhase::Decision,
        0,
    );
    trail.record_event(
        AuditEventType::ReconstitutionTriggered("kernel_miss".to_string()),
        "gate refused".to_string(),
        AuditPhase::Action,
        1,
    );
    let refusal = trail.last_refusal().expect("a refusal was recorded");
    assert_eq!(refusal.cycle_count, 1);
    assert!(matches!(
        refusal.event_type,
        AuditEventType::ReconstitutionTriggered(_)
    ));
}

#[test]
fn last_refusal_returns_none_when_no_refusal_recorded() {
    let mut trail = AutonomicAuditTrail::new();
    trail.record_event(
        AuditEventType::AgentSelected("a".to_string()),
        "test".to_string(),
        AuditPhase::Decision,
        0,
    );
    assert!(trail.last_refusal().is_none());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_audit_trail_extensions_tests 2>&1 | tail -30`
Expected: compile error — `AuditEventType::ReconstitutionTriggered` and `recent`/`last_refusal` don't exist yet.

- [ ] **Step 3: Add the new variant and read methods (additive)**

In `wasm4pm/src/autonomic_audit_trail.rs`, add a variant to `AuditEventType` (after `EscalationTriggered`):

```rust
    /// A viability-gate refusal — the proposed action would exit the
    /// admitted viability kernel. Payload is a human-readable reason
    /// (e.g. the `ReconstitutionIntent`'s `contract_id`).
    ReconstitutionTriggered(String),
```

Update `impl fmt::Display for AuditEventType` (add a match arm before the closing brace):

```rust
            AuditEventType::ReconstitutionTriggered(reason) => {
                write!(f, "reconstitution_triggered({})", reason)
            }
```

Update `export_timeline`'s `phase_marker` match is keyed on `AuditPhase`, not `AuditEventType`, so it needs no change. Add the two read methods to `impl AutonomicAuditTrail` (after `get_checksum`):

```rust
    /// Return the last `n` recorded events, oldest-first, or all events if
    /// fewer than `n` have been recorded.
    #[must_use]
    pub fn recent(&self, n: usize) -> &[AuditEvent] {
        let start = self.events.len().saturating_sub(n);
        &self.events[start..]
    }

    /// Return the most recent `ReconstitutionTriggered` event, if any.
    #[must_use]
    pub fn last_refusal(&self) -> Option<&AuditEvent> {
        self.events
            .iter()
            .rev()
            .find(|e| matches!(e.event_type, AuditEventType::ReconstitutionTriggered(_)))
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_audit_trail_extensions_tests 2>&1 | tail -30`
Expected: 4 passed.

- [ ] **Step 5: Create the `autonomic` module scaffolding**

```rust
// wasm4pm/src/autonomic/mod.rs
//! Autonomic framework: wires Monitor/Analyze/Plan/Execute/Knowledge and the
//! second-order viability gate into one loop, for both wasm4pm-self
//! (`SelfPlant`) and externally-mined-process (`MinedProcessPlant`) targets.
//!
//! See `docs/superpowers/specs/2026-08-16-autonomic-framework-design.md`
//! for the full design and its adversarial review.

pub mod actuator;
pub mod analyzer;
pub mod emergency;
pub mod gate;
pub mod loop_driver;
pub mod monitor;
pub mod plant;
pub mod planner;
pub mod types;

pub use actuator::{Actuator, InProcessConfigActuator};
pub use analyzer::{Analyzer, DriftAnalyzer};
pub use emergency::EmergencyMonitor;
pub use gate::{GateDecision, VersionedKernel, ViabilityGate};
pub use loop_driver::AutonomicLoop;
pub use monitor::{AnomalyMonitor, DriftMonitor, Monitor};
pub use plant::{ConformanceScore, MinedProcessPlant, MiningAlgorithm, Plant, SelfPlant};
pub use planner::{OrchestratorPlanner, Planner};
pub use types::{AnalysisSummary, ExecutionContext, Observation, TickReceipt};

use thiserror::Error;

/// Errors from any phase of the autonomic loop. No phase panics; every
/// failure is a named, matchable variant.
#[derive(Debug, Error, Clone, PartialEq)]
pub enum AutonomicError {
    #[error("MONITOR_FAILED:{0}")]
    MonitorFailed(String),
    #[error("PLAN_INFEASIBLE:{0}")]
    PlanInfeasible(String),
    #[error("DISPATCH_FAILED:{0}")]
    DispatchFailed(String),
    #[error("KERNEL_STALE")]
    KernelStale,
    #[error("SECOND_ORDER_ASSESSMENT_FAILED:{0}")]
    SecondOrderAssessmentFailed(String),
}
```

- [ ] **Step 6: Write core types**

```rust
// wasm4pm/src/autonomic/types.rs
//! Types shared across autonomic-loop phases.

use serde::{Deserialize, Serialize};

/// A single monitored sample: activity name + tick index, used by both
/// `SelfPlant` and `MinedProcessPlant` drift/anomaly windows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sample {
    pub activity: String,
    pub tick: u64,
}

/// What `Monitor::observe` produces: a state snapshot plus a coarse
/// disturbance estimate, timestamped by tick (not wall-clock — the core
/// crate stays deterministic and WASM-compatible).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Observation {
    pub drift_score: f64,
    pub anomaly_score: f64,
    pub tick_id: u64,
}

/// What `Analyzer::analyze` produces: a classification of the observation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisSummary {
    pub trend: &'static str, // "rising" | "falling" | "stable" (from prediction_drift::classify_trend)
    pub anomaly_score: f64,
    pub drift_score: f64,
}

/// Per-tick execution context passed to `Actuator::execute`. Distinct from
/// `action_dispatch::ExecutionContext` (which is the pre-existing,
/// health-level-based context `dispatch_action` already consumes) — this
/// type carries the autonomic-loop-specific `tick_id` and `Observation`
/// that `InProcessConfigActuator` uses to build the pre-existing type.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub observation: Observation,
    pub tick_id: u64,
}

/// BLAKE3-hashed receipt for one `tick()` call. The core crate computes the
/// hash; the host (JS/Node caller) is responsible for persisting it to
/// `.wasm4pm/receipts/latest.json` — the core crate never touches the
/// filesystem.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TickReceipt {
    pub tick_id: u64,
    pub input_hash: String,
    pub output_hash: String,
    pub audit_head: String, // AutonomicAuditTrail::get_checksum() after this tick
}

impl TickReceipt {
    /// Compute a `TickReceipt` from canonical JSON of the input observation
    /// and output outcome, plus the audit trail's checksum after recording.
    #[must_use]
    pub fn new(tick_id: u64, input_json: &str, output_json: &str, audit_head: String) -> Self {
        Self {
            tick_id,
            input_hash: blake3::hash(input_json.as_bytes()).to_hex().to_string(),
            output_hash: blake3::hash(output_json.as_bytes()).to_hex().to_string(),
            audit_head,
        }
    }
}
```

- [ ] **Step 7: Add the module declaration to lib.rs**

In `wasm4pm/src/lib.rs`, find the `pub mod autoprocess;` declaration and add immediately after it:

```rust
pub mod autonomic;
```

- [ ] **Step 8: Compile-check (module stubs reference not-yet-created sibling modules)**

Run: `cargo check -p wasm4pm --all-features 2>&1 | tail -60`
Expected: errors that `autonomic::actuator`, `autonomic::analyzer`, etc. don't exist yet — this is expected; Tasks 2-8 create them. Confirm the *only* errors are "file not found" for the sibling modules, not syntax errors in `mod.rs`/`types.rs`.

- [ ] **Step 9: Commit**

```bash
git add wasm4pm/src/autonomic_audit_trail.rs wasm4pm/src/autonomic/mod.rs wasm4pm/src/autonomic/types.rs wasm4pm/src/lib.rs wasm4pm/tests/autonomic_audit_trail_extensions_tests.rs
git commit -m "feat(autonomic): add AutonomicError, core types, audit-trail read methods

Additive: AuditEventType::ReconstitutionTriggered, AutonomicAuditTrail::recent()/last_refusal(). New wasm4pm::autonomic module scaffolding (sibling modules stubbed in Tasks 2-8)."
```

---

### Task 2: `Plant` trait, `SelfPlant`, `MinedProcessPlant`

**Files:**
- Create: `wasm4pm/src/autonomic/plant.rs`
- Test: `wasm4pm/tests/autonomic_plant_tests.rs`

**Interfaces:**
- Consumes: `crate::RlAction` (existing, `wasm4pm/src/lib.rs:2459`), `crate::models::EventLog` (existing).
- Produces: `Plant` trait, `SelfPlant`, `MinedProcessPlant<'a>`, `MiningAlgorithm`, `ConformanceScore` — all `pub`, consumed by Tasks 3, 4, 5, 6, 8.

- [ ] **Step 1: Write the failing test**

```rust
// wasm4pm/tests/autonomic_plant_tests.rs
use wasm4pm::autonomic::{ConformanceScore, MinedProcessPlant, MiningAlgorithm, Plant, SelfPlant};
use wasm4pm::models::EventLog;
use wasm4pm::RlAction;

#[test]
fn self_plant_default_has_sane_runtime_defaults() {
    let plant = SelfPlant::new();
    assert_eq!(plant.batch_size, 1000);
    assert_eq!(plant.algorithm, MiningAlgorithm::Heuristic);
    assert!(plant.drift_window.is_empty());
}

#[test]
fn self_plant_admissible_actions_includes_scale_and_restart() {
    let plant = SelfPlant::new();
    let actions = plant.admissible_actions();
    assert!(actions.contains(&RlAction::Scale));
    assert!(actions.contains(&RlAction::Restart));
}

#[test]
fn mined_process_plant_admissible_actions_excludes_scale_and_restart() {
    let log = EventLog::default();
    let plant = MinedProcessPlant::new(&log, ConformanceScore(1.0));
    let actions = plant.admissible_actions();
    assert!(!actions.contains(&RlAction::Scale));
    assert!(!actions.contains(&RlAction::Restart));
    // MinedProcessPlant can only Continue (advisory: alert/no-op) — never
    // mutate the external process it observes.
    assert_eq!(actions, &[RlAction::Continue]);
}

#[test]
fn conformance_score_clamps_to_unit_interval() {
    assert_eq!(ConformanceScore::clamped(1.5).0, 1.0);
    assert_eq!(ConformanceScore::clamped(-0.5).0, 0.0);
    assert_eq!(ConformanceScore::clamped(0.7).0, 0.7);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_plant_tests 2>&1 | tail -30`
Expected: compile error — `wasm4pm::autonomic::plant` items don't exist (mod.rs already declares `pub mod plant;` from Task 1, but the file is empty/missing).

- [ ] **Step 3: Implement `plant.rs`**

```rust
// wasm4pm/src/autonomic/plant.rs
//! The `Plant` abstraction: what the autonomic loop regulates.
//!
//! Two implementations, matching wasm4pm's two disturbance sources — its
//! own runtime resource pressure (`SelfPlant`) and drift/anomaly in an
//! externally-mined process (`MinedProcessPlant`). `admissible_actions()`
//! is a fixed, engineer-chosen action repertoire per plant — not a computed
//! variety bound (see spec §2 for why this claim is deliberately narrow).

use super::types::Sample;
use crate::models::EventLog;
use crate::RlAction;
use std::collections::VecDeque;

/// Which discovery algorithm `SelfPlant` is currently configured to run.
/// Mirrors the `--algo` choices `crates/wasm4pm-cli/src/commands/mining.rs`
/// already supports.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MiningAlgorithm {
    #[default]
    Heuristic,
    Ilp,
    Inductive,
}

/// A conformance score in `[0.0, 1.0]`. Newtype so a raw `f64` can't be
/// passed where a `ConformanceScore` is expected without an explicit
/// construction/clamp step.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ConformanceScore(pub f64);

impl ConformanceScore {
    /// Construct a `ConformanceScore`, clamping to `[0.0, 1.0]`.
    #[must_use]
    pub fn clamped(value: f64) -> Self {
        Self(value.clamp(0.0, 1.0))
    }
}

/// What the autonomic loop regulates. `SelfPlant` and `MinedProcessPlant`
/// have deliberately different, type-restricted `admissible_actions()` —
/// wasm4pm has direct actuation only over itself.
pub trait Plant {
    /// A human-readable name for OTEL spans and audit-trail details.
    fn name(&self) -> &'static str;
    /// The fixed set of `RlAction`s this plant may be actuated with.
    fn admissible_actions(&self) -> &'static [RlAction];
}

/// wasm4pm's own runtime, as an actuation target: batch size, timeout,
/// retry count, and active mining algorithm can all be changed in-process.
#[derive(Debug, Clone)]
pub struct SelfPlant {
    pub batch_size: usize,
    pub timeout_ms: u64,
    pub retry_count: u8,
    pub algorithm: MiningAlgorithm,
    pub memory_mb: u32,
    pub queue_depth: u32,
    pub drift_window: VecDeque<Sample>,
}

impl SelfPlant {
    /// Sane runtime defaults, matching `action_dispatch::ExecutionContext::default()`.
    #[must_use]
    pub fn new() -> Self {
        Self {
            batch_size: 1000,
            timeout_ms: 30_000,
            retry_count: 0,
            algorithm: MiningAlgorithm::default(),
            memory_mb: 512,
            queue_depth: 0,
            drift_window: VecDeque::new(),
        }
    }
}

impl Default for SelfPlant {
    fn default() -> Self {
        Self::new()
    }
}

impl Plant for SelfPlant {
    fn name(&self) -> &'static str {
        "self"
    }
    fn admissible_actions(&self) -> &'static [RlAction] {
        &[
            RlAction::Continue,
            RlAction::Scale,
            RlAction::Retry,
            RlAction::Fallback,
            RlAction::Restart,
        ]
    }
}

/// An externally-mined process, observed (never actuated in-process) via
/// its `EventLog` and last-computed conformance score.
#[derive(Debug, Clone)]
pub struct MinedProcessPlant<'a> {
    pub event_log: &'a EventLog,
    pub last_conformance: ConformanceScore,
    pub drift_window: VecDeque<Sample>,
}

impl<'a> MinedProcessPlant<'a> {
    #[must_use]
    pub fn new(event_log: &'a EventLog, last_conformance: ConformanceScore) -> Self {
        Self {
            event_log,
            last_conformance,
            drift_window: VecDeque::new(),
        }
    }
}

impl Plant for MinedProcessPlant<'_> {
    fn name(&self) -> &'static str {
        "mined_process"
    }
    fn admissible_actions(&self) -> &'static [RlAction] {
        // Advisory only: wasm4pm has no direct actuator over an external
        // process. Continue is a genuine no-op the loop can always emit;
        // real Alert/RecommendPolicy actuation is out of scope (spec §8).
        &[RlAction::Continue]
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_plant_tests 2>&1 | tail -30`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add wasm4pm/src/autonomic/plant.rs wasm4pm/tests/autonomic_plant_tests.rs
git commit -m "feat(autonomic): Plant trait, SelfPlant, MinedProcessPlant"
```

---

### Task 3: `Monitor<P>` wrapping `prediction_drift.rs`/`anomaly.rs`; `Analyzer<P>`

**Files:**
- Create: `wasm4pm/src/autonomic/monitor.rs`
- Create: `wasm4pm/src/autonomic/analyzer.rs`
- Test: `wasm4pm/tests/autonomic_monitor_analyzer_tests.rs`

**Interfaces:**
- Consumes: `crate::prediction_drift::{detect_drift_native, classify_trend}` (existing, real), `crate::models::EventLog` (existing), `super::plant::{Plant, SelfPlant, MinedProcessPlant}` (Task 2), `super::types::{Observation, AnalysisSummary}` (Task 1), `super::AutonomicError` (Task 1).
- Produces: `Monitor<P: Plant>` trait, `DriftMonitor`, `AnomalyMonitor`, `Analyzer<P: Plant>` trait, `DriftAnalyzer` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```rust
// wasm4pm/tests/autonomic_monitor_analyzer_tests.rs
use wasm4pm::autonomic::{Analyzer, DriftAnalyzer, DriftMonitor, Monitor, SelfPlant};
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

fn trace_of(activities: &[&str]) -> Trace {
    let events = activities
        .iter()
        .map(|a| {
            let mut ev = Event::new();
            ev.attributes.insert(
                "concept:name".to_string(),
                AttributeValue::String(a.to_string()),
            );
            ev
        })
        .collect();
    Trace {
        attributes: Default::default(),
        events,
    }
}

fn stable_log() -> EventLog {
    // Same A->B->C pattern repeated: no drift.
    EventLog {
        attributes: Default::default(),
        traces: (0..20).map(|_| trace_of(&["A", "B", "C"])).collect(),
    }
}

#[test]
fn drift_monitor_observes_zero_drift_on_stable_log() {
    let monitor = DriftMonitor::new("concept:name".to_string(), 5);
    let plant = SelfPlant::new();
    let log = stable_log();
    let obs = monitor.observe(&plant, &log, 0).expect("observe succeeds");
    assert_eq!(obs.drift_score, 0.0);
    assert_eq!(obs.tick_id, 0);
}

#[test]
fn drift_analyzer_classifies_stable_trend_on_zero_drift() {
    let monitor = DriftMonitor::new("concept:name".to_string(), 5);
    let plant = SelfPlant::new();
    let log = stable_log();
    let obs = monitor.observe(&plant, &log, 0).expect("observe succeeds");

    let analyzer = DriftAnalyzer;
    let audit = wasm4pm::autonomic_audit_trail::AutonomicAuditTrail::new();
    let summary = analyzer.analyze(&obs, &audit).expect("analyze succeeds");
    assert_eq!(summary.trend, "stable");
    assert_eq!(summary.drift_score, 0.0);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_monitor_analyzer_tests 2>&1 | tail -30`
Expected: compile error, `monitor`/`analyzer` items missing.

- [ ] **Step 3: Implement `monitor.rs`**

```rust
// wasm4pm/src/autonomic/monitor.rs
//! `Monitor<P>` wraps the already-real, already-wired `prediction_drift.rs`
//! (and, in a later increment, `anomaly.rs`) as an autonomic-loop phase.
//! State ownership: `prediction_drift::detect_drift_native` is a pure,
//! stateless function over a full `EventLog`; the *window* it slides over
//! is the caller's job, so `DriftMonitor` takes the `EventLog` and a fixed
//! `window_size` per call rather than owning a running window itself —
//! callers (Task 8's `AutonomicLoop`) own the plant-scoped `drift_window`
//! sample buffer for anything that needs cross-tick accumulation.

use super::plant::Plant;
use super::types::Observation;
use super::AutonomicError;
use crate::models::EventLog;
use crate::prediction_drift::detect_drift_native;

/// Produces an `Observation` for a given `Plant` and tick.
pub trait Monitor<P: Plant> {
    fn observe(&self, plant: &P, log: &EventLog, tick_id: u64) -> Result<Observation, AutonomicError>;
}

/// Wraps `prediction_drift::detect_drift_native`. `window_size` is the
/// sliding-window size passed straight through; `activity_key` is the
/// event-log attribute key (almost always `"concept:name"`).
pub struct DriftMonitor {
    activity_key: String,
    window_size: usize,
}

impl DriftMonitor {
    #[must_use]
    pub fn new(activity_key: String, window_size: usize) -> Self {
        Self {
            activity_key,
            window_size,
        }
    }
}

impl<P: Plant> Monitor<P> for DriftMonitor {
    fn observe(&self, _plant: &P, log: &EventLog, tick_id: u64) -> Result<Observation, AutonomicError> {
        if self.window_size == 0 {
            return Err(AutonomicError::MonitorFailed(
                "window_size must be > 0".to_string(),
            ));
        }
        let report = detect_drift_native(log, &self.activity_key, self.window_size);
        // Real, useful heuristic (Jaccard/TV-distance drift) — see
        // prediction_drift.rs's own module doc for what this is and isn't
        // a reproduction of. drift_score is the fraction of window-pairs
        // flagged, in [0.0, 1.0].
        let total_windows = log.traces.len().saturating_sub(self.window_size).max(1);
        let drift_score = report.drifts_detected as f64 / total_windows as f64;
        Ok(Observation {
            drift_score: drift_score.min(1.0),
            anomaly_score: 0.0, // AnomalyMonitor (below) fills this in when composed
            tick_id,
        })
    }
}

/// Wraps `anomaly::score_log_anomalies` (wasm-bindgen export; works
/// natively too since `JsValue` has a non-wasm32 implementation and the
/// crate already exercises this from the native CLI). Requires the log to
/// already be registered via `crate::state::get_or_init_state()`'s handle
/// registry — the same pattern `mining.rs`'s CLI commands use.
pub struct AnomalyMonitor {
    log_handle: String,
    activity_key: String,
}

impl AnomalyMonitor {
    #[must_use]
    pub fn new(log_handle: String, activity_key: String) -> Self {
        Self {
            log_handle,
            activity_key,
        }
    }
}

impl<P: Plant> Monitor<P> for AnomalyMonitor {
    fn observe(&self, _plant: &P, _log: &EventLog, tick_id: u64) -> Result<Observation, AutonomicError> {
        use crate::anomaly::score_log_anomalies;
        let result = score_log_anomalies(&self.log_handle, &self.activity_key)
            .map_err(|e| AutonomicError::MonitorFailed(format!("{e:?}")))?;
        let anomaly_score = js_sys::Reflect::get(&result, &"mean_anomaly_score".into())
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        Ok(Observation {
            drift_score: 0.0,
            anomaly_score,
            tick_id,
        })
    }
}
```

- [ ] **Step 4: Implement `analyzer.rs`**

```rust
// wasm4pm/src/autonomic/analyzer.rs
//! `Analyzer<P>` classifies an `Observation` into an `AnalysisSummary`,
//! consulting recent `AutonomicAuditTrail` history (Kephart & Chess:
//! Knowledge must be genuinely read, not just written).

use super::plant::Plant;
use super::types::{AnalysisSummary, Observation};
use super::AutonomicError;
use crate::autonomic_audit_trail::AutonomicAuditTrail;
use crate::prediction_drift::classify_trend;

pub trait Analyzer<P: Plant> {
    fn analyze(
        &self,
        obs: &Observation,
        audit: &AutonomicAuditTrail,
    ) -> Result<AnalysisSummary, AutonomicError>;
}

/// Classifies drift trend by comparing this observation's drift_score
/// against the drift_scores of the last 5 recorded audit events whose
/// details parse as a drift_score (see `record` convention in Task 8) —
/// falling back to a single-point classification if no history exists yet.
pub struct DriftAnalyzer;

impl<P: Plant> Analyzer<P> for DriftAnalyzer {
    fn analyze(
        &self,
        obs: &Observation,
        audit: &AutonomicAuditTrail,
    ) -> Result<AnalysisSummary, AutonomicError> {
        let mut series: Vec<f64> = audit
            .recent(5)
            .iter()
            .filter_map(|e| e.details.strip_prefix("drift_score="))
            .filter_map(|s| s.parse::<f64>().ok())
            .collect();
        series.push(obs.drift_score);
        let trend = classify_trend(&series);
        Ok(AnalysisSummary {
            trend,
            anomaly_score: obs.anomaly_score,
            drift_score: obs.drift_score,
        })
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_monitor_analyzer_tests 2>&1 | tail -30`
Expected: 2 passed. (`AnomalyMonitor` has no direct test here — it requires a registered state handle; it is exercised end-to-end in Task 8's integration test instead, which already needs a live `StoredObject` registration for the loop test.)

- [ ] **Step 6: Commit**

```bash
git add wasm4pm/src/autonomic/monitor.rs wasm4pm/src/autonomic/analyzer.rs wasm4pm/tests/autonomic_monitor_analyzer_tests.rs
git commit -m "feat(autonomic): Monitor<P>/Analyzer<P> wrapping prediction_drift.rs and anomaly.rs"
```

---

### Task 4: `action_dispatch.rs` additive change (`Refused` variant + `apply_to`)

**Files:**
- Modify: `wasm4pm/src/action_dispatch.rs`
- Test: `wasm4pm/tests/action_dispatch_refused_tests.rs`

**Interfaces:**
- Consumes: `crate::advanced::wasm4auto::ReconstitutionIntent` (existing).
- Produces: `DispatchOutcome::Refused(ReconstitutionIntent)`, `DispatchOutcome::apply_to(&self, plant: &mut SelfPlant)` — consumed by Task 6 (`InProcessConfigActuator`).

- [ ] **Step 1: Write the failing test**

```rust
// wasm4pm/tests/action_dispatch_refused_tests.rs
use wasm4pm::action_dispatch::DispatchOutcome;
use wasm4pm::advanced::wasm4auto::{AdaptationAuthority, RegulatorDeficit, ReconstitutionIntent};
use wasm4pm::autonomic::SelfPlant;

fn sample_intent() -> ReconstitutionIntent {
    ReconstitutionIntent::for_test("kernel-refused-tick-1", RegulatorDeficit::ModelInadequate)
}

#[test]
fn refused_outcome_leaves_plant_unchanged() {
    let mut plant = SelfPlant::new();
    let before = plant.batch_size;
    let outcome = DispatchOutcome::Refused(sample_intent());
    outcome.apply_to(&mut plant);
    assert_eq!(plant.batch_size, before, "a refusal must not mutate plant state");
}

#[test]
fn scaled_outcome_updates_plant_fields() {
    let mut plant = SelfPlant::new();
    let outcome = DispatchOutcome::Scaled {
        memory_mb: 1024,
        timeout_ms: 60_000,
        batch_size: 2000,
    };
    outcome.apply_to(&mut plant);
    assert_eq!(plant.memory_mb, 1024);
    assert_eq!(plant.timeout_ms, 60_000);
    assert_eq!(plant.batch_size, 2000);
}

#[test]
fn refused_description_names_the_outcome() {
    let outcome = DispatchOutcome::Refused(sample_intent());
    assert_eq!(outcome.description(), "Viability gate refused proposed action");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test action_dispatch_refused_tests 2>&1 | tail -30`
Expected: compile error — `DispatchOutcome::Refused`, `apply_to`, and `ReconstitutionIntent::for_test` don't exist.

- [ ] **Step 3: Check `ReconstitutionIntent`'s current constructor**

`ReconstitutionIntent::new` (in `wasm4pm/src/advanced/wasm4auto.rs`) is currently a private (non-`pub`) associated function taking `(contract_id: &str, reason: RegulatorDeficit)`. Add a `#[cfg(any(test, feature = "test-support"))] pub` test-only constructor right next to it (do not change the existing private `new` — this is additive):

```rust
    /// Test-only public constructor (real `ReconstitutionIntent` values are
    /// otherwise only produced internally by `ultrastable_decision`).
    #[cfg(any(test, feature = "test-support"))]
    #[must_use]
    pub fn for_test(contract_id: &str, reason: RegulatorDeficit) -> Self {
        Self::new(contract_id, reason)
    }
```

Add `test-support = []` to `[features]` in `wasm4pm/Cargo.toml` if a similar test-only feature flag doesn't already exist (check first: `grep -n "test-support" wasm4pm/Cargo.toml`). Wire `[dev-dependencies]`-only usage: since `wasm4pm/tests/*.rs` integration tests compile the crate as an external dependent, they need the feature enabled — add `wasm4pm = { path = "..", features = ["test-support"] }` is not applicable for a crate's own integration tests (Cargo enables the crate's own `[features]` for its own `tests/` by default when run via `cargo test -p wasm4pm`), so no `Cargo.toml` dev-dependency change is needed — just confirm with the build in Step 5.

- [ ] **Step 4: Add `Refused` variant and `apply_to`**

In `wasm4pm/src/action_dispatch.rs`, add to the top-level imports:

```rust
use crate::advanced::wasm4auto::ReconstitutionIntent;
use crate::autonomic::SelfPlant;
```

Add a variant to `DispatchOutcome` (after `RestartInitiated`, before `NotImplemented`):

```rust
    /// The viability gate refused the proposed action — it would exit the
    /// admitted viability kernel. No plant mutation occurs.
    Refused(ReconstitutionIntent),
```

Update `description()`'s match (add before `NotImplemented`'s arm):

```rust
            DispatchOutcome::Refused(_) => "Viability gate refused proposed action",
```

Add `apply_to` in `impl DispatchOutcome` (after `description`):

```rust
    /// Apply this outcome to a `SelfPlant`, mutating its in-process fields.
    /// `Refused`/`NoOp`/`NotImplemented` leave the plant unchanged by
    /// design — a refusal must never sneak a partial mutation through.
    pub fn apply_to(&self, plant: &mut SelfPlant) {
        match self {
            DispatchOutcome::Scaled {
                memory_mb,
                timeout_ms,
                batch_size,
            } => {
                plant.memory_mb = *memory_mb;
                plant.timeout_ms = u64::from(*timeout_ms);
                plant.batch_size = *batch_size as usize;
            }
            DispatchOutcome::RetryInitiated { attempt, .. } => {
                plant.retry_count = (*attempt).min(u32::from(u8::MAX)) as u8;
            }
            DispatchOutcome::RestartInitiated { .. } => {
                *plant = SelfPlant::new();
            }
            DispatchOutcome::FallbackInitiated { .. }
            | DispatchOutcome::NoOp
            | DispatchOutcome::Refused(_)
            | DispatchOutcome::NotImplemented => {}
        }
    }
```

Note: `FallbackInitiated { algorithm: String }` is intentionally not applied to `plant.algorithm: MiningAlgorithm` here — the existing `action_fallback` implementation returns a free-form `String` algorithm name, and `MiningAlgorithm` is a closed 3-variant enum; mapping one to the other is a real design decision belonging to a later increment (call it out, don't guess). Add a doc comment above the match noting this explicitly.

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test action_dispatch_refused_tests 2>&1 | tail -30`
Expected: 3 passed.

- [ ] **Step 6: Run the full existing `action_dispatch` test suites to confirm no regression**

Run: `cargo test -p wasm4pm --test action_dispatch_tests --test action_integration_tests 2>&1 | tail -40`
Expected: all pre-existing tests still pass (this task's diff is additive-only).

- [ ] **Step 7: Commit**

```bash
git add wasm4pm/src/action_dispatch.rs wasm4pm/src/advanced/wasm4auto.rs wasm4pm/Cargo.toml wasm4pm/tests/action_dispatch_refused_tests.rs
git commit -m "feat(action_dispatch): additive DispatchOutcome::Refused + apply_to(&mut SelfPlant)

Additive only: existing variants/tests unchanged. FallbackInitiated's
String->MiningAlgorithm mapping deliberately left as a no-op with a
doc comment — real design decision, not guessed."
```

---

### Task 5: `ViabilityGate` wrapping `advanced::wasm4auto`

**Files:**
- Create: `wasm4pm/src/autonomic/gate.rs`
- Test: `wasm4pm/tests/autonomic_gate_tests.rs`

**Interfaces:**
- Consumes: `crate::advanced::wasm4auto::{ViabilityKernel, ViabilityEnvelope, MeasuredState, RegulationContract, SecondOrderAssessment, ultrastable_decision, AutonomicVerdict, AutonomicDecision, ReconstitutionIntent, StateId, ActionId}` (all existing, real).
- Produces: `ViabilityGate`, `GateDecision`, `VersionedKernel` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```rust
// wasm4pm/tests/autonomic_gate_tests.rs
use std::collections::{BTreeMap, BTreeSet};
use wasm4pm::advanced::wasm4auto::{ActionId, StateId, ViabilityKernel};
use wasm4pm::autonomic::{GateDecision, VersionedKernel, ViabilityGate};

fn kernel_containing(states: &[(StateId, ActionId)]) -> ViabilityKernel {
    ViabilityKernel {
        states: states.iter().map(|(s, _)| *s).collect(),
        robust_policy: states.iter().cloned().collect(),
        iterations: 1,
    }
}

#[test]
fn admits_action_matching_the_kernels_robust_policy() {
    let kernel = kernel_containing(&[(0, 1)]);
    let gate = ViabilityGate::new(VersionedKernel::new(kernel, 0));
    let decision = gate.check(0, 1).expect("check succeeds");
    assert_eq!(decision, GateDecision::Admit(1));
}

#[test]
fn refuses_action_not_matching_the_kernels_robust_policy() {
    let kernel = kernel_containing(&[(0, 1)]);
    let gate = ViabilityGate::new(VersionedKernel::new(kernel, 0));
    let decision = gate.check(0, 2).expect("check succeeds");
    assert!(matches!(decision, GateDecision::Refuse(_)));
}

#[test]
fn refuses_state_outside_the_kernel() {
    let kernel = kernel_containing(&[(0, 1)]);
    let gate = ViabilityGate::new(VersionedKernel::new(kernel, 0));
    let decision = gate.check(99, 1).expect("check succeeds");
    assert!(matches!(decision, GateDecision::Refuse(_)));
}

#[test]
fn versioned_kernel_reports_staleness_by_epoch() {
    let kernel = kernel_containing(&[(0, 1)]);
    let versioned = VersionedKernel::new(kernel, 5);
    assert!(!versioned.is_stale(10, 10)); // horizon 10, age 5 -> fresh
    assert!(versioned.is_stale(20, 10)); // age 15 -> stale
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_gate_tests 2>&1 | tail -30`
Expected: compile error, `gate` module items missing.

- [ ] **Step 3: Implement `gate.rs`**

```rust
// wasm4pm/src/autonomic/gate.rs
//! `ViabilityGate` wraps `advanced::wasm4auto::ViabilityKernel` as a real
//! blocking precondition on `Actuator::execute` — the kernel's `states`
//! set and `robust_policy` map (state -> the one action the kernel
//! guarantees stays viable) decide admit/refuse. See spec §3: this is
//! declared a conservative, discretized abstraction, not a proof about the
//! continuous real plant — refusal on either state-not-in-kernel or
//! action-not-matching-robust-policy is the honest, narrow guarantee this
//! gate actually provides.

use crate::advanced::wasm4auto::{ActionId, RegulatorDeficit, ReconstitutionIntent, StateId, ViabilityKernel};

/// A `ViabilityKernel` tagged with the tick epoch it was computed at, so
/// staleness can be checked without a `'static` borrow (the kernel is
/// owned, not borrowed — it can be replaced wholesale on refresh).
#[derive(Debug, Clone)]
pub struct VersionedKernel {
    kernel: ViabilityKernel,
    computed_at_epoch: u64,
}

impl VersionedKernel {
    #[must_use]
    pub fn new(kernel: ViabilityKernel, computed_at_epoch: u64) -> Self {
        Self {
            kernel,
            computed_at_epoch,
        }
    }

    /// True if `current_epoch - computed_at_epoch > horizon`.
    #[must_use]
    pub fn is_stale(&self, current_epoch: u64, horizon: u64) -> bool {
        current_epoch.saturating_sub(self.computed_at_epoch) > horizon
    }

    #[must_use]
    pub fn kernel(&self) -> &ViabilityKernel {
        &self.kernel
    }
}

/// Outcome of `ViabilityGate::check`.
#[derive(Debug, Clone, PartialEq)]
pub enum GateDecision {
    Admit(ActionId),
    Refuse(ReconstitutionIntent),
}

/// Blocking precondition on actuation. `check` never mutates anything —
/// it is a pure function of `(state, proposed_action)` and the current
/// kernel.
pub struct ViabilityGate {
    kernel: VersionedKernel,
}

impl ViabilityGate {
    #[must_use]
    pub fn new(kernel: VersionedKernel) -> Self {
        Self { kernel }
    }

    /// Admit `proposed` iff `state` is in the kernel AND `proposed` is the
    /// kernel's own robust policy action for that state. Any other
    /// combination — state outside the kernel, or a different action than
    /// the kernel's robust choice — is a refusal, with a
    /// `ReconstitutionIntent` naming the reason.
    pub fn check(
        &self,
        state: StateId,
        proposed: ActionId,
    ) -> Result<GateDecision, super::AutonomicError> {
        let kernel = self.kernel.kernel();
        if !kernel.contains(state) {
            return Ok(GateDecision::Refuse(self.refuse(
                state,
                RegulatorDeficit::ModelInadequate,
            )));
        }
        match kernel.robust_policy.get(&state) {
            Some(&admitted) if admitted == proposed => Ok(GateDecision::Admit(proposed)),
            _ => Ok(GateDecision::Refuse(self.refuse(
                state,
                RegulatorDeficit::InsufficientVariety,
            ))),
        }
    }

    fn refuse(&self, state: StateId, reason: RegulatorDeficit) -> ReconstitutionIntent {
        #[cfg(any(test, feature = "test-support"))]
        {
            ReconstitutionIntent::for_test(&format!("gate-refuse-state-{state}"), reason)
        }
        #[cfg(not(any(test, feature = "test-support")))]
        {
            // Production path: construct via the crate-internal `new`
            // (same crate, `pub(crate)` visibility is sufficient — see
            // Task 5 Step 4 note on visibility).
            ReconstitutionIntent::new_for_gate(&format!("gate-refuse-state-{state}"), reason)
        }
    }
}
```

- [ ] **Step 4: Widen `ReconstitutionIntent::new`'s visibility for production use**

The existing `ReconstitutionIntent::new` in `wasm4pm/src/advanced/wasm4auto.rs` is private (no visibility modifier = module-private). `gate.rs` is a *different* module, so it cannot call it even within the same crate. Add a `pub(crate)` wrapper right next to the existing private `new` (do not change `new`'s own visibility — additive only):

```rust
    /// Crate-internal constructor for callers outside this module (e.g.
    /// `autonomic::gate::ViabilityGate`) that need to construct a real
    /// `ReconstitutionIntent` outside of `ultrastable_decision`'s own
    /// internal call sites.
    pub(crate) fn new_for_gate(contract_id: &str, reason: RegulatorDeficit) -> Self {
        Self::new(contract_id, reason)
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_gate_tests --features test-support 2>&1 | tail -30`
Expected: 4 passed.

- [ ] **Step 6: Run the existing `wasm4auto` test suite to confirm no regression**

Run: `cargo test -p wasm4pm --lib advanced::wasm4auto 2>&1 | tail -40`
Expected: all pre-existing `wasm4auto` unit tests still pass.

- [ ] **Step 7: Commit**

```bash
git add wasm4pm/src/autonomic/gate.rs wasm4pm/src/advanced/wasm4auto.rs wasm4pm/tests/autonomic_gate_tests.rs
git commit -m "feat(autonomic): ViabilityGate wrapping advanced::wasm4auto::ViabilityKernel

ReconstitutionIntent gains a pub(crate) constructor (new_for_gate) for
callers outside wasm4auto.rs — existing private new() unchanged."
```

---

### Task 6: `Actuator<P>` and `InProcessConfigActuator`

**Files:**
- Create: `wasm4pm/src/autonomic/actuator.rs`
- Test: `wasm4pm/tests/autonomic_actuator_tests.rs`

**Interfaces:**
- Consumes: `crate::action_dispatch::{dispatch_action, ExecutionContext as DispatchExecutionContext, DispatchOutcome}` (existing + Task 4's `Refused`/`apply_to`), `crate::RlAction` (existing), `super::plant::{Plant, SelfPlant}` (Task 2), `super::types::ExecutionContext` (Task 1).
- Produces: `Actuator<P: Plant>` trait, `InProcessConfigActuator` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```rust
// wasm4pm/tests/autonomic_actuator_tests.rs
use wasm4pm::autonomic::{Actuator, InProcessConfigActuator, Observation, SelfPlant};
use wasm4pm::RlAction;

#[test]
fn in_process_actuator_scale_updates_plant_batch_size() {
    let actuator = InProcessConfigActuator;
    let mut plant = SelfPlant::new();
    let obs = Observation {
        drift_score: 0.0,
        anomaly_score: 0.0,
        tick_id: 1,
    };
    let ctx = wasm4pm::autonomic::ExecutionContext {
        observation: obs,
        tick_id: 1,
    };
    let outcome = actuator
        .execute(&mut plant, &RlAction::Scale, &ctx)
        .expect("execute succeeds");
    assert!(matches!(outcome, wasm4pm::action_dispatch::DispatchOutcome::Scaled { .. }));
}

#[test]
fn in_process_actuator_continue_is_a_noop() {
    let actuator = InProcessConfigActuator;
    let mut plant = SelfPlant::new();
    let before = plant.batch_size;
    let obs = Observation {
        drift_score: 0.0,
        anomaly_score: 0.0,
        tick_id: 1,
    };
    let ctx = wasm4pm::autonomic::ExecutionContext {
        observation: obs,
        tick_id: 1,
    };
    let outcome = actuator
        .execute(&mut plant, &RlAction::Continue, &ctx)
        .expect("execute succeeds");
    assert_eq!(outcome, wasm4pm::action_dispatch::DispatchOutcome::NoOp);
    assert_eq!(plant.batch_size, before);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_actuator_tests 2>&1 | tail -30`
Expected: compile error, `actuator` module items missing.

- [ ] **Step 3: Implement `actuator.rs`**

```rust
// wasm4pm/src/autonomic/actuator.rs
//! `Actuator<P>` is the Execute phase. `InProcessConfigActuator` is the
//! one real, shipped implementation (spec §8: host-process/network
//! actuation are documented extension points, not built here) — it
//! delegates to the pre-existing, unmodified `action_dispatch::dispatch_action`
//! and applies the result to a `SelfPlant` via Task 4's `apply_to`.

use super::plant::{Plant, SelfPlant};
use super::types::ExecutionContext;
use super::AutonomicError;
use crate::action_dispatch::{
    dispatch_action, DispatchOutcome, ExecutionContext as DispatchExecutionContext,
};
use crate::RlAction;

pub trait Actuator<P: Plant> {
    fn execute(
        &self,
        plant: &mut P,
        action: &RlAction,
        ctx: &ExecutionContext,
    ) -> Result<DispatchOutcome, AutonomicError>;
}

/// WASM-compatible: no async, no threads, no filesystem/network I/O —
/// mutates only in-memory `SelfPlant` fields via `DispatchOutcome::apply_to`.
pub struct InProcessConfigActuator;

impl Actuator<SelfPlant> for InProcessConfigActuator {
    fn execute(
        &self,
        plant: &mut SelfPlant,
        action: &RlAction,
        _ctx: &ExecutionContext,
    ) -> Result<DispatchOutcome, AutonomicError> {
        let dispatch_ctx = DispatchExecutionContext {
            health_level: 0,
            current_memory_mb: plant.memory_mb,
            current_timeout_ms: plant.timeout_ms as u32,
            current_batch_size: plant.batch_size as u32,
            retry_count: u32::from(plant.retry_count),
            max_retries: 3,
            base_backoff_ms: 1000,
            circuit_breaker_open: false,
        };
        let outcome = dispatch_action(action, &dispatch_ctx)
            .map_err(|e| AutonomicError::DispatchFailed(e.to_string()))?;
        outcome.apply_to(plant);
        Ok(outcome)
    }
}
```

Note: `MinedProcessPlant` deliberately gets **no** `Actuator` implementation — matching spec §8's YAGNI boundary and Task 2's `admissible_actions()` restricting it to `RlAction::Continue` only.

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_actuator_tests 2>&1 | tail -30`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add wasm4pm/src/autonomic/actuator.rs wasm4pm/tests/autonomic_actuator_tests.rs
git commit -m "feat(autonomic): Actuator<P> + InProcessConfigActuator wrapping dispatch_action"
```

---

### Task 7: `Planner<P>` wrapping `RlOrchestrator`; `EmergencyMonitor`

**Files:**
- Create: `wasm4pm/src/autonomic/planner.rs`
- Create: `wasm4pm/src/autonomic/emergency.rs`
- Test: `wasm4pm/tests/autonomic_planner_tests.rs`
- Test: `wasm4pm/tests/autonomic_emergency_tests.rs`

**Interfaces:**
- Consumes: `crate::rl_orchestrator::RlOrchestrator` (existing, real — `select_action(&RlState) -> RlAction`), `crate::RlState` (existing), `super::types::AnalysisSummary` (Task 1/3), `super::plant::{Plant, SelfPlant}` (Task 2).
- Produces: `Planner<P: Plant>` trait, `OrchestratorPlanner`, `EmergencyMonitor` — consumed by Task 8.

- [ ] **Step 1: Write the failing test for `Planner`**

```rust
// wasm4pm/tests/autonomic_planner_tests.rs
use wasm4pm::autonomic::{AnalysisSummary, OrchestratorPlanner, Planner, SelfPlant};
use wasm4pm::rl_orchestrator::RlOrchestrator;
use wasm4pm::RlAction;

#[test]
fn planner_selects_continue_on_stable_low_scores() {
    let orch = RlOrchestrator::new();
    let planner = OrchestratorPlanner::new(4); // 4-tick minimum dwell
    let plant = SelfPlant::new();
    let summary = AnalysisSummary {
        trend: "stable",
        anomaly_score: 0.0,
        drift_score: 0.0,
    };
    let action = planner
        .plan(&plant, &summary, &orch, 0)
        .expect("plan succeeds");
    // A freshly-initialized Q-table with all-zero state has no learned
    // preference; RlOrchestrator::select_action still returns a
    // deterministic RlAction (exercising the real, existing selection
    // path) — assert only that planning succeeds and returns an action
    // admissible for SelfPlant, not a specific action (that would pin an
    // implementation detail of the untrained agent).
    use wasm4pm::autonomic::Plant;
    assert!(plant.admissible_actions().contains(&action));
}

#[test]
fn planner_enforces_minimum_dwell_time_after_a_non_continue_action() {
    let orch = RlOrchestrator::new();
    let planner = OrchestratorPlanner::new(4);
    let plant = SelfPlant::new();
    let summary = AnalysisSummary {
        trend: "stable",
        anomaly_score: 0.0,
        drift_score: 0.0,
    };
    planner.record_dispatch(RlAction::Scale, 0);
    // Within the dwell window (tick 1, dwell=4 -> until tick 4), the
    // planner must not propose another Scale.
    let action = planner
        .plan(&plant, &summary, &orch, 1)
        .expect("plan succeeds");
    assert_ne!(action, RlAction::Scale);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_planner_tests 2>&1 | tail -30`
Expected: compile error, `planner` module items missing.

- [ ] **Step 3: Check `RlState::from_features`'s exact signature before writing `planner.rs`**

Run: `sed -n '2313,2335p' wasm4pm/src/lib.rs` and confirm the field order matches `from_features(&features: &[f32; 8], health_level: u8, rework_ratio: f32)`.

- [ ] **Step 4: Implement `planner.rs`**

```rust
// wasm4pm/src/autonomic/planner.rs
//! `Planner<P>` is the Plan phase. `OrchestratorPlanner` delegates to the
//! already-real, already-tested `RlOrchestrator::select_action` (see the
//! plan's "Correction to the spec's audit" note — `RlOrchestrator` is a
//! genuine, wired backend, not a from-scratch reimplementation).
//!
//! Adds two things `RlOrchestrator` doesn't have on its own: a minimum
//! dwell time between repeated non-`Continue` actions (closes the
//! Plan->Refuse->replan liveness gap noted in the spec's Hellerstein
//! review) and a refusal-penalty hook the viability gate calls into.

use super::plant::{Plant, SelfPlant};
use super::types::AnalysisSummary;
use super::AutonomicError;
use crate::rl_orchestrator::RlOrchestrator;
use crate::{RlAction, RlState};
use std::cell::RefCell;
use std::collections::HashMap;

pub trait Planner<P: Plant> {
    fn plan(
        &self,
        plant: &P,
        summary: &AnalysisSummary,
        orchestrator: &RlOrchestrator,
        tick_id: u64,
    ) -> Result<RlAction, AutonomicError>;
}

/// Tracks the last tick each `RlAction` was dispatched at, to enforce a
/// minimum dwell time before the same action can be proposed again.
pub struct OrchestratorPlanner {
    min_dwell_ticks: u64,
    last_dispatched: RefCell<HashMap<RlAction, u64>>,
}

impl OrchestratorPlanner {
    #[must_use]
    pub fn new(min_dwell_ticks: u64) -> Self {
        Self {
            min_dwell_ticks,
            last_dispatched: RefCell::new(HashMap::new()),
        }
    }

    /// Record that `action` was dispatched at `tick_id` — called by
    /// `AutonomicLoop::tick()` after a successful `Actuator::execute`, and
    /// (with a synthetic penalty tick) after a gate refusal.
    pub fn record_dispatch(&self, action: RlAction, tick_id: u64) {
        self.last_dispatched.borrow_mut().insert(action, tick_id);
    }

    fn within_dwell(&self, action: RlAction, tick_id: u64) -> bool {
        match self.last_dispatched.borrow().get(&action) {
            Some(&last) => tick_id.saturating_sub(last) < self.min_dwell_ticks,
            None => false,
        }
    }
}

impl Planner<SelfPlant> for OrchestratorPlanner {
    fn plan(
        &self,
        plant: &SelfPlant,
        summary: &AnalysisSummary,
        orchestrator: &RlOrchestrator,
        tick_id: u64,
    ) -> Result<RlAction, AutonomicError> {
        let features: [f32; 8] = [
            summary.drift_score as f32,
            summary.anomaly_score as f32,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
        ];
        let health_level = if summary.anomaly_score > 0.8 { 3 } else { 0 };
        let state = RlState::from_features(&features, health_level, 0.0);
        let mut candidate = orchestrator.select_action(&state);

        if self.within_dwell(candidate, tick_id) {
            candidate = RlAction::Continue; // dwell violated: fall back to the always-safe no-op
        }
        if !plant.admissible_actions().contains(&candidate) {
            return Err(AutonomicError::PlanInfeasible(format!(
                "{:?} not admissible for plant {}",
                candidate,
                plant.name()
            )));
        }
        Ok(candidate)
    }
}
```

- [ ] **Step 5: Run the `Planner` test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_planner_tests 2>&1 | tail -30`
Expected: 2 passed.

- [ ] **Step 6: Write the failing test for `EmergencyMonitor`**

```rust
// wasm4pm/tests/autonomic_emergency_tests.rs
use wasm4pm::autonomic::{EmergencyMonitor, SelfPlant};
use wasm4pm::RlAction;

#[test]
fn emergency_monitor_triggers_hard_stop_on_catastrophic_memory() {
    let monitor = EmergencyMonitor::new(4096, 10_000);
    let mut plant = SelfPlant::new();
    plant.memory_mb = 8000;
    assert_eq!(monitor.check(&plant), Some(RlAction::Restart));
}

#[test]
fn emergency_monitor_stays_quiet_under_threshold() {
    let monitor = EmergencyMonitor::new(4096, 10_000);
    let plant = SelfPlant::new(); // memory_mb: 512, well under 4096
    assert_eq!(monitor.check(&plant), None);
}

#[test]
fn emergency_monitor_triggers_on_catastrophic_queue_depth() {
    let monitor = EmergencyMonitor::new(4096, 10_000);
    let mut plant = SelfPlant::new();
    plant.queue_depth = 20_000;
    assert_eq!(monitor.check(&plant), Some(RlAction::Restart));
}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_emergency_tests 2>&1 | tail -30`
Expected: compile error, `EmergencyMonitor` missing.

- [ ] **Step 8: Implement `emergency.rs`**

```rust
// wasm4pm/src/autonomic/emergency.rs
//! `EmergencyMonitor` is the algedonic (hierarchy-bypassing) channel —
//! see spec §3b, addressing Beer's Viable System Model review finding.
//! Reads only `SelfPlant`'s cheapest-to-sample fields and, on a
//! hard-coded catastrophic threshold, signals a bypass straight to
//! `RlAction::Restart` — skipping Analyze/Plan/gate entirely.
//!
//! `RlAction::Restart` is used as the "hard stop" action: it is the
//! existing action closest in spirit to a full reset (see
//! `action_dispatch::action_restart`'s doc comment — "resets SPC history
//! ring buffer and circuit breaker state"), rather than inventing a new
//! `RlAction` variant not present in the existing 5-variant enum.

use super::plant::SelfPlant;
use crate::RlAction;

pub struct EmergencyMonitor {
    memory_mb_threshold: u32,
    queue_depth_threshold: u32,
}

impl EmergencyMonitor {
    #[must_use]
    pub fn new(memory_mb_threshold: u32, queue_depth_threshold: u32) -> Self {
        Self {
            memory_mb_threshold,
            queue_depth_threshold,
        }
    }

    /// Returns `Some(RlAction::Restart)` on a catastrophic threshold
    /// breach, `None` otherwise. Never returns any other action — the
    /// algedonic path has exactly one response, by design (spec §3b: "a
    /// fixed HardStop action").
    #[must_use]
    pub fn check(&self, plant: &SelfPlant) -> Option<RlAction> {
        if plant.memory_mb >= self.memory_mb_threshold
            || plant.queue_depth >= self.queue_depth_threshold
        {
            Some(RlAction::Restart)
        } else {
            None
        }
    }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_emergency_tests 2>&1 | tail -30`
Expected: 3 passed.

- [ ] **Step 10: Commit**

```bash
git add wasm4pm/src/autonomic/planner.rs wasm4pm/src/autonomic/emergency.rs wasm4pm/tests/autonomic_planner_tests.rs wasm4pm/tests/autonomic_emergency_tests.rs
git commit -m "feat(autonomic): Planner<P> wrapping RlOrchestrator (dwell-time enforced), EmergencyMonitor algedonic channel"
```

---

### Task 8: `AutonomicLoop` driver, OTEL spans, integration test

**Files:**
- Create: `wasm4pm/src/autonomic/loop_driver.rs`
- Test: `wasm4pm/tests/autonomic_loop_integration_tests.rs`

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: `AutonomicLoop<P, M, A>`, `AutonomicLoop::tick()` — the framework's public entry point.

- [ ] **Step 1: Write the failing integration test — Admit path**

```rust
// wasm4pm/tests/autonomic_loop_integration_tests.rs
use wasm4pm::autonomic::{
    AutonomicLoop, DriftMonitor, EmergencyMonitor, InProcessConfigActuator, OrchestratorPlanner,
    SelfPlant, VersionedKernel, ViabilityGate,
};
use wasm4pm::advanced::wasm4auto::ViabilityKernel;
use wasm4pm::autonomic_audit_trail::AutonomicAuditTrail;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::rl_orchestrator::RlOrchestrator;

fn trace_of(activities: &[&str]) -> Trace {
    let events = activities
        .iter()
        .map(|a| {
            let mut ev = Event::new();
            ev.attributes.insert(
                "concept:name".to_string(),
                AttributeValue::String(a.to_string()),
            );
            ev
        })
        .collect();
    Trace {
        attributes: Default::default(),
        events,
    }
}

fn stable_log() -> EventLog {
    EventLog {
        attributes: Default::default(),
        traces: (0..20).map(|_| trace_of(&["A", "B", "C"])).collect(),
    }
}

/// A kernel that admits every state with `RlAction::Continue` as the
/// robust policy — the Admit-path fixture.
fn permissive_kernel() -> ViabilityKernel {
    let states: std::collections::BTreeSet<u32> = (0..u32::MAX / 2).step_by(1).take(1).collect();
    // Kernel membership is checked against the *encoded* state id the
    // loop computes internally (0 for a freshly-constructed SelfPlant +
    // stable/zero AnalysisSummary) — see loop_driver.rs's `encode_state`.
    let mut robust_policy = std::collections::BTreeMap::new();
    robust_policy.insert(0u32, 0u32); // action id 0 == RlAction::Continue
    ViabilityKernel {
        states: states.into_iter().chain(std::iter::once(0)).collect(),
        robust_policy,
        iterations: 1,
    }
}

fn build_loop() -> AutonomicLoop<SelfPlant, DriftMonitor, InProcessConfigActuator> {
    let monitor = DriftMonitor::new("concept:name".to_string(), 5);
    let planner = OrchestratorPlanner::new(4);
    let gate = ViabilityGate::new(VersionedKernel::new(permissive_kernel(), 0));
    let actuator = InProcessConfigActuator;
    let emergency = EmergencyMonitor::new(4096, 10_000);
    AutonomicLoop::new(monitor, planner, gate, actuator, emergency)
}

#[test]
fn tick_admits_continue_on_stable_log_and_records_a_receipt() {
    let mut loop_ = build_loop();
    let mut plant = SelfPlant::new();
    let orchestrator = RlOrchestrator::new();
    let log = stable_log();

    let receipt = loop_
        .tick(&mut plant, &log, &orchestrator, 0)
        .expect("tick succeeds");

    assert_eq!(receipt.tick_id, 0);
    assert!(!receipt.input_hash.is_empty());
    assert!(!receipt.output_hash.is_empty());
    assert_eq!(loop_.audit().get_events().len(), 1);
}

#[test]
fn tick_refuses_when_state_not_in_kernel_and_records_reconstitution() {
    let mut loop_ = build_loop();
    // Poison the gate: swap in a kernel with zero admitted states.
    let empty_kernel = ViabilityKernel {
        states: Default::default(),
        robust_policy: Default::default(),
        iterations: 0,
    };
    loop_.replace_kernel(VersionedKernel::new(empty_kernel, 0));

    let mut plant = SelfPlant::new();
    let orchestrator = RlOrchestrator::new();
    let log = stable_log();

    let receipt = loop_
        .tick(&mut plant, &log, &orchestrator, 0)
        .expect("tick succeeds even on refusal (fail-closed, not fail-panic)");

    assert_eq!(receipt.tick_id, 0);
    let refusal = loop_
        .audit()
        .last_refusal()
        .expect("a ReconstitutionTriggered event was recorded");
    assert!(matches!(
        refusal.event_type,
        wasm4pm::autonomic_audit_trail::AuditEventType::ReconstitutionTriggered(_)
    ));
}

#[test]
fn tick_bypasses_normal_pipeline_on_emergency() {
    let mut loop_ = build_loop();
    let mut plant = SelfPlant::new();
    plant.memory_mb = 8000; // above EmergencyMonitor's 4096 threshold
    let orchestrator = RlOrchestrator::new();
    let log = stable_log();

    let receipt = loop_
        .tick(&mut plant, &log, &orchestrator, 0)
        .expect("emergency tick succeeds");
    assert_eq!(receipt.tick_id, 0);
    // Restart resets the plant to defaults.
    assert_eq!(plant.memory_mb, 512);
}

#[test]
fn audit_trail_chain_verifies_after_several_ticks() {
    let mut loop_ = build_loop();
    let mut plant = SelfPlant::new();
    let orchestrator = RlOrchestrator::new();
    let log = stable_log();

    for tick_id in 0..3 {
        loop_
            .tick(&mut plant, &log, &orchestrator, tick_id)
            .expect("tick succeeds");
    }
    assert!(loop_.audit().verify_chain());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p wasm4pm --test autonomic_loop_integration_tests 2>&1 | tail -40`
Expected: compile error, `AutonomicLoop` missing.

- [ ] **Step 3: Implement `loop_driver.rs`**

```rust
// wasm4pm/src/autonomic/loop_driver.rs
//! `AutonomicLoop::tick()` is the framework's single entry point,
//! sequencing Monitor->Analyze->Plan->[viability gate]->Execute->Knowledge,
//! with an `EmergencyMonitor` bypass checked first. See spec §5.
//!
//! Tick cadence is host-driven: the JS/Node caller invokes `tick()` on a
//! stated interval; this driver makes no timing decisions of its own
//! (core crate stays synchronous, WASM-compatible, no timers).

use super::actuator::Actuator;
use super::analyzer::{Analyzer, DriftAnalyzer};
use super::emergency::EmergencyMonitor;
use super::gate::{GateDecision, VersionedKernel, ViabilityGate};
use super::monitor::Monitor;
use super::plant::{Plant, SelfPlant};
use super::planner::{OrchestratorPlanner, Planner};
use super::types::{ExecutionContext, Observation, TickReceipt};
use super::AutonomicError;
use crate::autonomic_audit_trail::{AuditEventType, AuditPhase, AutonomicAuditTrail};
use crate::models::EventLog;
use crate::rl_orchestrator::RlOrchestrator;
use crate::RlAction;

/// Encode a `SelfPlant` + `AnalysisSummary` into a `StateId` for the
/// viability kernel. Deliberately coarse (spec §3's Model Fidelity
/// Statement): buckets drift_score and anomaly_score into 4 bins each,
/// ignoring finer plant state. `0` for the all-quiescent case, matching
/// the integration test's `permissive_kernel` fixture.
fn encode_state(drift_score: f64, anomaly_score: f64) -> u32 {
    let drift_bin = (drift_score * 4.0).min(3.0) as u32;
    let anomaly_bin = (anomaly_score * 4.0).min(3.0) as u32;
    drift_bin * 4 + anomaly_bin
}

/// Encode an `RlAction` into an `ActionId` for the viability kernel —
/// matches `RlAction`'s existing discriminant values (`Continue = 0`,
/// `Scale = 1`, ...).
fn encode_action(action: RlAction) -> u32 {
    action as u32
}

pub struct AutonomicLoop<P: Plant, M: Monitor<P>, A: Actuator<P>> {
    monitor: M,
    analyzer: DriftAnalyzer,
    planner: OrchestratorPlanner,
    gate: ViabilityGate,
    actuator: A,
    emergency: EmergencyMonitor,
    audit: AutonomicAuditTrail,
    cycle_count: u64,
    _plant: std::marker::PhantomData<P>,
}

impl<M: Monitor<SelfPlant>, A: Actuator<SelfPlant>> AutonomicLoop<SelfPlant, M, A> {
    #[must_use]
    pub fn new(
        monitor: M,
        planner: OrchestratorPlanner,
        gate: ViabilityGate,
        actuator: A,
        emergency: EmergencyMonitor,
    ) -> Self {
        Self {
            monitor,
            analyzer: DriftAnalyzer,
            planner,
            gate,
            actuator,
            emergency,
            audit: AutonomicAuditTrail::new(),
            cycle_count: 0,
            _plant: std::marker::PhantomData,
        }
    }

    #[must_use]
    pub fn audit(&self) -> &AutonomicAuditTrail {
        &self.audit
    }

    /// Replace the gate's kernel wholesale (used on the staleness
    /// refresh trigger, and by tests to exercise the Refuse path).
    pub fn replace_kernel(&mut self, kernel: VersionedKernel) {
        self.gate = ViabilityGate::new(kernel);
    }

    #[tracing::instrument(name = "autonomic.tick", skip(self, plant, log, orchestrator))]
    pub fn tick(
        &mut self,
        plant: &mut SelfPlant,
        log: &EventLog,
        orchestrator: &RlOrchestrator,
        tick_id: u64,
    ) -> Result<TickReceipt, AutonomicError> {
        self.cycle_count += 1;

        // Emergency bypass — checked before anything else (algedonic path,
        // spec §3b).
        if let Some(hard_action) = self.emergency.check(plant) {
            return self.execute_and_receipt(plant, hard_action, tick_id, "autonomic.emergency");
        }

        let obs = tracing::info_span!("autonomic.monitor").in_scope(|| {
            self.monitor.observe(plant, log, tick_id)
        })?;
        let analysis = tracing::info_span!("autonomic.analyze").in_scope(|| {
            self.analyzer.analyze(&obs, &self.audit)
        })?;
        let proposed = tracing::info_span!("autonomic.plan").in_scope(|| {
            self.planner.plan(plant, &analysis, orchestrator, tick_id)
        })?;

        let state_id = encode_state(analysis.drift_score, analysis.anomaly_score);
        let action_id = encode_action(proposed);

        let decision = tracing::info_span!("autonomic.gate").in_scope(|| {
            self.gate.check(state_id, action_id)
        })?;

        self.audit.record_event(
            AuditEventType::AgentSelected(format!("{proposed:?}")),
            format!("drift_score={}", analysis.drift_score),
            AuditPhase::Decision,
            self.cycle_count,
        );

        match decision {
            GateDecision::Admit(_) => {
                self.planner.record_dispatch(proposed, tick_id);
                self.execute_and_receipt(plant, proposed, tick_id, "autonomic.execute")
            }
            GateDecision::Refuse(intent) => {
                tracing::error_span!("autonomic.gate.refuse", status = "error").in_scope(|| {
                    self.audit.record_event(
                        AuditEventType::ReconstitutionTriggered(intent.contract_id.clone()),
                        format!("proposed={proposed:?} state_id={state_id}"),
                        AuditPhase::Action,
                        self.cycle_count,
                    );
                });
                let outcome = crate::action_dispatch::DispatchOutcome::Refused(intent);
                let input_json = serde_json::to_string(&obs).unwrap_or_default();
                let output_json = serde_json::to_string(&format!("{outcome:?}")).unwrap_or_default();
                Ok(TickReceipt::new(
                    tick_id,
                    &input_json,
                    &output_json,
                    self.audit.get_checksum().to_string(),
                ))
            }
        }
    }

    fn execute_and_receipt(
        &mut self,
        plant: &mut SelfPlant,
        action: RlAction,
        tick_id: u64,
        span_name: &'static str,
    ) -> Result<TickReceipt, AutonomicError> {
        let ctx = ExecutionContext {
            observation: Observation {
                drift_score: 0.0,
                anomaly_score: 0.0,
                tick_id,
            },
            tick_id,
        };
        let outcome = tracing::info_span!("autonomic.execute", name = span_name).in_scope(|| {
            self.actuator.execute(plant, &action, &ctx)
        })?;
        self.audit.record_event(
            AuditEventType::RecoveryCompleted(true, 0),
            format!("action={action:?} outcome={outcome:?}"),
            AuditPhase::Action,
            self.cycle_count,
        );
        let input_json = serde_json::to_string(&format!("{action:?}")).unwrap_or_default();
        let output_json = serde_json::to_string(&format!("{outcome:?}")).unwrap_or_default();
        Ok(TickReceipt::new(
            tick_id,
            &input_json,
            &output_json,
            self.audit.get_checksum().to_string(),
        ))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p wasm4pm --test autonomic_loop_integration_tests --features test-support 2>&1 | tail -60`
Expected: 4 passed. If `tick_admits_continue_on_stable_log_and_records_a_receipt` fails because `encode_state` on a truly stable, all-zero-score observation doesn't produce `0`, adjust `permissive_kernel()`'s fixture in the test to match `encode_state`'s actual output for that input — do not change `encode_state`'s binning to fit the test.

- [ ] **Step 5: Run the full `wasm4pm` test suite to confirm no regressions anywhere**

Run: `cargo test -p wasm4pm --all-features 2>&1 | tail -80`
Expected: all tests pass (pre-existing + this plan's new tests).

- [ ] **Step 6: Run `cargo check --workspace --all-features` for a full-workspace sanity pass**

Run: `cargo check --workspace --all-features 2>&1 | tail -60`
Expected: clean (matching the state confirmed at the end of the prior branch-merge work).

- [ ] **Step 7: Commit**

```bash
git add wasm4pm/src/autonomic/loop_driver.rs wasm4pm/tests/autonomic_loop_integration_tests.rs
git commit -m "feat(autonomic): AutonomicLoop driver — tick() wires Monitor/Analyze/Plan/gate/Execute/Knowledge

Closes the audit's core finding: the 5 previously-disconnected pieces
(prediction_drift.rs, RlOrchestrator, action_dispatch.rs,
autonomic_audit_trail.rs, advanced::wasm4auto) now run as one loop.
Emergency algedonic bypass, dwell-time-enforced Planner, fail-closed
viability gate, full audit-trail chain verified end-to-end."
```

---

## Self-Review

**Spec coverage:**
- §1 Component Map → Tasks 1-8 (every row mapped to a task).
- §1b state ownership → Task 2 (`drift_window` on `Plant` impls) + Task 3's doc comment explaining the pure-function/state-owner split.
- §1c core types → Task 1.
- §2/§2b Plant abstraction + coordination → Task 2 implements the abstraction; the `MinedProcessPlant→SelfPlant` coordination feed is **not** implemented in this plan — flagged below as a gap, not silently dropped.
- §3/§3b Viability gate + algedonic channel → Tasks 5, 7.
- §4/§4b dwell-time, refusal penalty, circuit breaker → Task 7 implements dwell-time; refusal-penalty-into-`ConvergenceMetrics` and the consecutive-refusal circuit breaker are **not** implemented — flagged below.
- §5 driver/OTEL/receipts → Task 8.
- §7 Rust discipline → applied throughout (newtypes, `Result` everywhere, `#[must_use]` on `GateDecision`/`TickReceipt`, no panics on runtime-derived values).
- §9 phases → this plan's Task 1-8 ordering matches.

**Gaps found during self-review (not silently dropped — named here):**
1. §2b's `MinedProcessPlant → SelfPlant` disturbance-coordination feed and §4's `ConvergenceMetrics` refusal-penalty coupling + consecutive-refusal circuit breaker are real spec requirements this plan does not implement. Reason: both require deeper changes to `policy_persistence.rs`/`RlOrchestrator`'s reward path than fit in an already-large 8-task plan, and neither blocks the core "wire the 5 pieces together" goal — the loop is real and functional without them. **Recommend a follow-up plan** once this one lands and compiles clean, scoped specifically to those two items.
2. `AnomalyMonitor` (Task 3) has no dedicated unit test — it requires a pre-registered `StoredObject` handle, which the plan's other fixtures don't set up. It's still wired (real code, not a stub); Task 8's integration test only exercises `DriftMonitor`, not `AnomalyMonitor`, in the loop. Flagged, not hidden — a follow-up task could add a `StoredObject`-backed fixture.

**Placeholder scan:** no "TBD"/"TODO"/"implement later" found in any task's code blocks; every step shows real code, not a description of code.

**Type consistency:** `RlAction`, `SelfPlant`, `MinedProcessPlant`, `Observation`, `AnalysisSummary`, `AutonomicError`, `GateDecision`, `TickReceipt`, `ViabilityGate`, `VersionedKernel` are each defined exactly once (Tasks 1, 2, 5) and referenced identically (same field names, same method signatures) in every later task that consumes them — cross-checked against each task's "Interfaces: Consumes" line.

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-08-16-autonomic-framework.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
