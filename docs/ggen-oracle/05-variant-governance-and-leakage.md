# 05 — Variant Governance + Cross-Checkpoint Leakage

**Status:** Spec. Capability area: **variant governance (#4)** + **cross-checkpoint leakage (#8)** from the
12-area map in `00-STRUCTURE-MAP.md` §8. Both are marked **TO BE BUILT** there.
**Date:** 2026-05-30
**Authority direction:** ggen produces the OCEL tape; wasm4pm adjudicates process *possibility*. This spec is the
"is this run's process-signature lawful, and did checkpoint N+1 leak into checkpoint N's gate" half of the Andon
oracle. It is the judge-of-possibility leap for the hourly 10-agent loop, not a post-hoc audit.
**Builds on (cited, real):** `wasm4pm-algos::dfg::discover_dfg` (`crates/wasm4pm-algos/src/dfg.rs:12`),
`ConformanceResult` (`crates/wasm4pm-compat/src/conformance.rs:62`),
`DeclareConstraint`/`DeclareModel` (`crates/wasm4pm-compat/src/models.rs:555/573`),
`validate_ocel_object_lifecycles` + `LifecycleViolation` (`wasm4pm/src/ocel_io.rs:399/413`),
the `ReceiptDoctor` refusal-finding shape (`wasm4pm/src/receipt.rs:33/56/63/77`),
the `StreamingDeclareBuilder` template vocabulary (`wasm4pm/src/streaming/streaming_declare.rs:80/106/124/140`).
**ggen-side facts (cited, real):** the 6-link builders + activity constants
(`/Users/sac/ggen/crates/ggen-lsp/src/intel/events.rs:14-35`), episode identity
(`episode_id = blake3(file‖code‖run_id)`, `events.rs:92`), the NDJSON tape
(`/Users/sac/ggen/crates/ggen-lsp/src/intel/log.rs`, path `default_path` →
`.ggen/ocel/agent-edit-events.ocel.jsonl`), and the dormancy marker
`GGEN-HARNESS-001 { detector_active: false }` (`/Users/sac/ggen/crates/ggen-lsp/src/route/diagnostic_species.rs:64-75`).

---

## 1. Purpose

The hourly loop runs ~10 agents, each emitting episode traces into the shared NDJSON tape. Each episode is a
**case** (`object_type = "episode"`, `episode_id = blake3(file‖code‖run_id)` — `events.rs:92`). Every case has a
**variant**: the ordered sequence of `activity` strings (`events.rs:14`). This spec governs those variants:

- **(a) Variant governance.** Classify every episode's variant as **ACCEPTED**, **NEW** (unseen, quarantine), or
  **FORBIDDEN** (a known-illegal signature). Track variant frequency and drift. Map each variant to the
  receipts it produced. Distinguish *lawful* variants (e.g. `Andon → blocked receipt`;
  `fake-live → repair-loop → alive`) from *forbidden* ones (`clear before route`; `receipt before gate`;
  `repair without a pending repair`). Give every checkpoint a stable **process signature**.
- **(b) Cross-checkpoint leakage.** Treat the loop as a sequence of **checkpoints** (Gall 001 → 001B → 001C). Detect
  three leakage species as **queryable conformance rules**: (i) an event from checkpoint N+1 participating in
  checkpoint N's gate window; (ii) a diagnostic species activated before its **receipt barrier** is reached;
  (iii) a provisional/dormant detector leaking into the global server/check path. Encode the receipt-order barrier
  ("`GGEN-HARNESS-001` may compile and be testable but stays dormant globally until `001C_ALIVE`") as **process law,
  not prose** — a Declare constraint the oracle replays, not a comment.

The verdict shape is the existing `ReceiptDoctor` pattern (`receipt.rs:77`): a stable refusal-code enum +
`{code, severity, json_path, message}` findings + `Admitted/Refused`, exit non-zero on refusal. ggen consumes it as
an **external `wpm` subprocess oracle** emitting one versioned JSON envelope (matching GGEN-NEEDS §5's
external-CLI-oracle boundary).

---

## 2. What EXISTS to build on vs. what is TO BE BUILT

### 2.1 EXISTS (cited)

| Asset | Citation | Reuse in this spec |
|---|---|---|
| **DFG discovery (variant substrate)** | `discover_dfg(log,key)->DFG` `crates/wasm4pm-algos/src/dfg.rs:12`; aggregates node/edge frequency per `Trace`, sets `start_activities`/`end_activities`. | The per-case activity-sequence extraction (`dfg.rs:21-25`, `e.get_activity(key)`) is exactly the variant-key projection — but DFG **aggregates** and never enumerates per-trace variants. Reuse the projection; build the enumeration. |
| **Conformance metrics envelope** | `ConformanceResult{fitness,precision,generalization,simplicity,total_traces,fitting_traces,deviating_traces}` serde-ready, `crates/wasm4pm-compat/src/conformance.rs:62`; `conformance_rate()` :107. | Variant-governance report embeds a `ConformanceResult` so the oracle's metrics line up with `wpm mining conformance`. |
| **Declare constraint type** | `DeclareConstraint{constraint_type:String, activities:Vec<String>, condition:String}` + `DeclareModel{constraints,activities}`, `crates/wasm4pm-compat/src/models.rs:555/573`. Serde-ready, `Default`. **No checker consumes it yet.** | The canonical container for the 6-link ordering law and the receipt-barrier law. We define a *checker* over it (TO BE BUILT). |
| **Declare template vocabulary (reference)** | `StreamingDeclareBuilder::to_declare` emits `template:"response(A,B)"`, `"precedence(A,B)"`, `"coexistence(A,B)"` (`wasm4pm/src/streaming/streaming_declare.rs:106/124/140`). NOTE: that builder uses an **internal** constraint struct with a `template` field, distinct from `wasm4pm-compat::DeclareConstraint` (`constraint_type` field). | Adopt the same template *names* (`response`, `precedence`, `succession`, `not_succession`, `absence`) as `DeclareConstraint.constraint_type` values so vocabulary is consistent across the codebase. |
| **Per-object temporal-order violation** | `validate_ocel_object_lifecycles(&OCEL)->Vec<LifecycleViolation>` `wasm4pm/src/ocel_io.rs:413`; `LifecycleViolation{object_id,event_a_id,event_b_id,timestamp_a_ms,timestamp_b_ms}` :399. Operates on **shape 2.B** (`models.rs` OCEL, string timestamps). Pure Rust. | The raw substrate for leakage-by-timestamp: an event whose timestamp precedes its episode predecessor is a candidate barrier-violation. The *semantic* layer (which activity must precede which) is TO BE BUILT on top. |
| **Refusal-finding verdict architecture** | `ReceiptTruthRefusal` enum (`receipt.rs:33`), `FindingSeverity{Deny,Warning}` :56, `ReceiptFinding{code,json_path,message,severity}` :63, `ReceiptDoctorState{Admitted,Refused}` :71, `ReceiptDoctorReport{state,findings,admitted}` :77. Pure Rust, `serde_json::Value` in / `Vec<finding>` out, wired to `wpm receipt`. | **Copy this shape verbatim** for the variant/leakage verdict. New refusal enum, same envelope discipline. |
| **DFG node/edge model** | `DFG{nodes,edges,start_activities,end_activities}`, `DFGEdge::new(from,to,freq)` (used `dfg.rs:73`). | Drift detection compares two `DFG`s (current-hour vs. accepted baseline) by edge-set delta. |

### 2.2 TO BE BUILT (nothing in-tree does it)

| # | Capability | Why nothing exists |
|---|---|---|
| T1 | **Per-trace variant enumeration + canonical variant key** | `discover_dfg` aggregates frequencies and never materializes per-case variants (`dfg.rs:69-74` collapses to edges). No `Variant`/`VariantSet` type anywhere. |
| T2 | **Variant policy (accept/deny/quarantine list) + signature catalog** | `00-STRUCTURE-MAP.md` §8 #4: "No variant-set tracking or allow/deny-list." No persistence surface. |
| T3 | **Variant→receipt mapping** | No fn correlates a variant to its `ReceiptEmitted` ids. |
| T4 | **Drift metrics (frequency / Jaccard over variant sets across windows)** | No window/variant-set concept. |
| T5 | **Declare-conformance checker over `DeclareModel`** | `models.rs:573` type exists; `00-STRUCTURE-MAP.md` §4.2: "no Declare conformance checker found." |
| T6 | **Checkpoint windowing + leakage rules** | §8 #8: "No checkpoint/window-scoping concept exists." |
| T7 | **Receipt-barrier law (dormancy-until-ALIVE) as an executable constraint** | The barrier lives only as a Rust bool `detector_active:false` + a code comment (`diagnostic_species.rs:73`). Not replayable. |
| T8 | **The `wpm oracle variant` / `wpm oracle leakage` CLI surface + JSON envelope** | §5: only `receipt`/`autoprocess` emit JSON; `wpm mining conformance` is mocked (`mining.rs:75 DFG::new()`). |
| T9 | **Bad-trace fixtures for the forbidden variants** | §6: "A bad-trace corpus … does NOT exist." |

**Count for this area: 6 EXISTS-substrates reused, 9 TO BE BUILT.**

---

## 3. Design

### 3.1 Where the code goes (maps onto existing crates)

Per the dependency direction (`00-STRUCTURE-MAP.md` §1: `wasm4pm-compat ← wasm4pm-algos ← wasm4pm ← wasm4pm-cli`):

| Module | Home crate | Rationale |
|---|---|---|
| `variant` (T1–T4: `Variant`, `VariantSet`, `VariantPolicy`, `VariantSignature`, drift) | **`wasm4pm-algos`** (new `src/variant.rs`) | Pure Rust, link-safe, sits beside `dfg.rs`/`conformance.rs`; reuses `discover_dfg`'s projection. No wasm-bindgen. |
| `declare_conformance` (T5: checker over `DeclareModel`) | **`wasm4pm-algos`** (new `src/declare_conformance.rs`) | Pure Rust; consumes `wasm4pm-compat::DeclareModel`. |
| `checkpoint` (T6–T7: `Checkpoint`, `CheckpointWindow`, `Barrier`, leakage rules) | **`wasm4pm-algos`** (new `src/checkpoint.rs`) | Pure Rust; depends only on `ocel-core` (the §2 carved crate) + `variant`/`declare_conformance`. |
| `oracle::variant` verdict assembly (refusal enum + report) | **`wasm4pm`** engine OR `wasm4pm-algos` if it must stay link-safe. **Recommend `wasm4pm-algos`** so the verdict is reusable and the engine's wasm-bindgen does not contaminate it. | Mirrors `receipt.rs` shape but lives where ggen could one day link it. |
| `wpm oracle <sub>` CLI + JSON envelope (T8) | **`wasm4pm-cli`** (new `src/commands/oracle.rs`) | The external-oracle boundary. Tests in `crates/wasm4pm-cli/tests/cli_tests.rs`. |
| Bad-trace fixtures (T9) | `fixtures/real/variant-*/` and `fixtures/real/leakage-*/` | Reuses the `fixtures/real/<scenario>/` convention (`00-STRUCTURE-MAP.md` §6). |

> **OCEL shape choice (must state, per `00-STRUCTURE-MAP.md` §2):** the oracle consumes **ggen's emitted shape 2.D**
> via the **NDJSON importer (GGEN-NEEDS §4a, TO BE BUILT in sibling spec)** parsed into **canonical 2.A** (`ocel-core`).
> Variant keys read `OCELEvent.event_type` (with the `#[serde(alias="activity")]` reconciliation from
> `00-STRUCTURE-MAP.md` §9.2). Episode case grouping reads the relationship qualifier `"episode"` (ggen's
> `EPISODE_QUALIFIER`, `events.rs:57`). This spec does **not** depend on shape 2.B; the existing
> `validate_ocel_object_lifecycles` (2.B) is a *reference design* we re-implement against 2.A in `checkpoint.rs`.

### 3.2 (a) Variant governance — types

```rust
// crates/wasm4pm-algos/src/variant.rs  (TO BE BUILT)

/// One episode's process signature: the ordered activity sequence for a case,
/// keyed by OCEL relationship qualifier "episode" (ggen's EPISODE_QUALIFIER).
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub struct Variant {
    /// Ordered activity names, e.g. ["DiagnosticRaised","RouteSelected",..,"ReceiptEmitted"].
    pub activities: Vec<String>,
}

impl Variant {
    /// Canonical, stable signature: blake3 over "\n"-joined activities.
    /// Stable across hosts/runs so the policy catalog keys on it.
    /// (Reuses the blake3 dep already in [workspace.dependencies], Cargo.toml:13-34.)
    pub fn signature(&self) -> String { /* blake3(self.activities.join("\n"))[..16] */ }
}

/// A counted variant + the episode cases that exhibited it + the receipts each produced.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VariantOccurrence {
    pub variant: Variant,
    pub signature: String,
    pub count: usize,
    pub case_ids: Vec<String>,        // episode_id (blake3(file‖code‖run_id))
    pub receipt_ids: Vec<String>,     // T3: variant→receipt mapping (from ReceiptEmitted attrs)
}

/// The variant set discovered from one OCEL log (one hour / one window).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VariantSet {
    pub occurrences: Vec<VariantOccurrence>,
    pub total_cases: usize,
}

/// Classification verdict for a single variant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum VariantClass {
    Accepted,    // signature in policy.accepted
    New,         // unseen signature — quarantine, surfaces as Warning
    Forbidden,   // signature in policy.forbidden OR matches a forbidden-law constraint
}

/// Policy = the allow/deny catalog for ONE checkpoint. Persisted as JSON
/// alongside the checkpoint registry (sibling spec #3). T2.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct VariantPolicy {
    pub checkpoint: String,                         // "GGEN-TPL-001@001B"
    pub accepted: Vec<NamedSignature>,              // lawful signatures
    pub forbidden: Vec<NamedSignature>,             // explicitly illegal signatures
    pub law: wasm4pm_compat::DeclareModel,           // the ordering law (3.4)
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NamedSignature { pub name: String, pub signature: String, pub example: Vec<String> }
```

```rust
// Enumerate variants from a flattened-per-episode EventLog (reuses dfg.rs projection).
pub fn enumerate_variants(log: &EventLog, activity_key: &str) -> VariantSet;  // T1
// Classify against a policy (signature lookup + forbidden-law replay).
pub fn classify(set: &VariantSet, policy: &VariantPolicy) -> Vec<(VariantOccurrence, VariantClass)>;
// Drift = Jaccard distance of current vs. baseline signature sets + per-variant freq delta.
pub fn drift(current: &VariantSet, baseline: &VariantSet) -> VariantDrift;  // T4
```

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VariantDrift {
    pub jaccard_distance: f64,            // 0.0 = identical signature sets
    pub new_signatures: Vec<String>,
    pub vanished_signatures: Vec<String>,
    pub frequency_shift: Vec<(String, i64)>, // signature -> count delta
}
```

### 3.3 Lawful vs. forbidden process signatures (the catalog)

Each checkpoint gets a **process signature catalog**. These are the load-bearing examples for the hourly loop.
Activity names are ggen's constants (`events.rs:16-34`). `→` is sequence; the case object is the episode.

**Lawful signatures (ACCEPTED):**

| Name | Signature (activity sequence) | Why lawful |
|---|---|---|
| `clean_repair` | `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted` | The canonical 6-link living loop (GGEN-NEEDS §3.1). |
| `andon_blocked` | `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GateFailed → RefusalEmitted` | **Andon → blocked receipt**: gate failed, the loop *refuses* rather than emitting a passing receipt. A blocked receipt (`RefusalEmitted`) is lawful; a passing `ReceiptEmitted` here would be forbidden. |
| `fake_live_recovered` | `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GateFailed → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted` | **fake-live → repair-loop → alive**: a first gate failure followed by a *re-routed* repair loop that reaches `GatePassed`. The loop (a `GateFailed` then a second `RouteSelected`) is lawful rework, not variant explosion. |
| `no_route_refusal` | `DiagnosticRaised → RefusalEmitted` | A diagnostic with no admissible route is refused immediately. Lawful (it never claims repair). |

**Forbidden signatures (FORBIDDEN):**

| Name | Illegal pattern | Refusal code |
|---|---|---|
| `clear_before_route` | A diagnostic's gate/receipt closes (`GatePassed`/`ReceiptEmitted`) with **no `RouteSelected`** in the episode. "Cleared before it was routed." | `ClearedBeforeRoute` |
| `receipt_before_gate` | `ReceiptEmitted` appears **before** any `GatePassed` in the episode (or with no `GatePassed` at all). | `ReceiptBeforeGate` |
| `repair_without_pending` | `RepairApplied` with **no preceding `RepairSuggested`/`RouteSelected`** for that episode. "Repaired without a pending repair." | `RepairWithoutPendingRepair` |
| `double_terminal` | Both `ReceiptEmitted` and `RefusalEmitted` for one episode (lawful + refused at once). | `DoubleTerminalState` |

Forbidden signatures are detected two ways and **must agree**: (1) explicit-signature lookup in
`VariantPolicy.forbidden`; (2) **Declare-law replay** (3.4), so a *novel* forbidden ordering not yet catalogued is
still caught by the law. New (uncatalogued, non-forbidden) variants are `VariantClass::New` → `Warning`, surfaced for
human catalog review — never silently accepted.

### 3.4 The ordering law as `DeclareModel` (T5, T7) — process law, not prose

The 6-link chain and the receipt barrier are encoded as `DeclareConstraint`s
(`constraint_type` uses the streaming_declare template vocabulary, `streaming_declare.rs:106/124/140`):

```json
// The lawful-ordering DeclareModel for checkpoint GGEN-TPL-001 — stored in VariantPolicy.law.
// constraint_type ∈ {precedence, response, succession, not_succession, absence, init, end}
{
  "activities": ["DiagnosticRaised","RouteSelected","RepairSuggested","RepairApplied",
                 "GatePassed","GateFailed","ReceiptEmitted","RefusalEmitted"],
  "constraints": [
    { "constraint_type": "init",         "activities": ["DiagnosticRaised"],                 "condition": "every episode opens with DiagnosticRaised" },
    { "constraint_type": "precedence",   "activities": ["RouteSelected","RepairApplied"],    "condition": "RepairApplied requires a prior RouteSelected (no repair_without_pending)" },
    { "constraint_type": "precedence",   "activities": ["RepairSuggested","RepairApplied"],  "condition": "RepairApplied requires a prior RepairSuggested" },
    { "constraint_type": "precedence",   "activities": ["RouteSelected","GatePassed"],       "condition": "no clear_before_route: a pass requires a prior route" },
    { "constraint_type": "precedence",   "activities": ["GatePassed","ReceiptEmitted"],      "condition": "no receipt_before_gate: a receipt requires a prior GatePassed" },
    { "constraint_type": "response",     "activities": ["DiagnosticRaised","ReceiptEmitted"],"condition": "a raised diagnostic must terminate (receipt OR refusal)" },
    { "constraint_type": "not_succession","activities": ["ReceiptEmitted","RefusalEmitted"], "condition": "no double_terminal in either order" },
    { "constraint_type": "not_succession","activities": ["RefusalEmitted","ReceiptEmitted"], "condition": "no double_terminal in either order" }
  ]
}
```

The **receipt-order barrier** (the dormancy law) is a separate, checkpoint-scoped constraint set:

```json
// The BARRIER law for GGEN-HARNESS-001: dormant until 001C_ALIVE.
// Encodes diagnostic_species.rs:73 "detector_active:false" as replayable process law.
{
  "activities": ["GGEN-HARNESS-001:DiagnosticRaised","001C_ALIVE"],
  "constraints": [
    { "constraint_type": "precedence",
      "activities": ["001C_ALIVE","GGEN-HARNESS-001:DiagnosticRaised"],
      "condition": "BARRIER: a GGEN-HARNESS-001 diagnostic may not appear in any episode emitted before the 001C_ALIVE barrier event for its checkpoint window. Compiling/testing the detector is lawful; emitting it into the global tape before ALIVE is a barrier violation." },
    { "constraint_type": "absence",
      "activities": ["GGEN-HARNESS-001:RepairApplied"],
      "condition": "BARRIER: a dormant species produces no RepairApplied globally until ALIVE." }
  ]
}
```

```rust
// crates/wasm4pm-algos/src/declare_conformance.rs  (T5, TO BE BUILT)
/// Replay an episode's activity sequence against a DeclareModel. Returns the
/// constraints it violates (empty = conforming). Pure Rust over wasm4pm-compat::DeclareModel.
pub fn check_declare(trace_activities: &[String], model: &DeclareModel) -> Vec<DeclareViolation>;
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeclareViolation { pub constraint_type: String, pub activities: Vec<String>, pub condition: String }
```

`precedence(A,B)` ⇒ every occurrence of B is preceded somewhere by A. `not_succession(A,B)` ⇒ no A followed later by B.
`init(A)` ⇒ first activity is A. `absence(A)` ⇒ A never occurs. These four cover all forbidden signatures in 3.3 and
the barrier law — no new template families needed beyond the streaming_declare vocabulary.

### 3.5 (b) Cross-checkpoint leakage — windowing + rules (T6)

A **checkpoint window** partitions the OCEL tape into the events belonging to one checkpoint's gate. ggen's tape has
no explicit window field today, so the spec defines the partition key precisely and names the ggen-side coordination
needed:

```rust
// crates/wasm4pm-algos/src/checkpoint.rs  (T6, TO BE BUILT)

/// One checkpoint in the Gall sequence (001 → 001B → 001C). Ordered.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Checkpoint {
    pub id: String,          // "001", "001B", "001C"
    pub ordinal: u32,        // 0,1,2 — defines N and N+1
    pub barrier_event: Option<String>, // e.g. "001C_ALIVE" — the receipt barrier (3.4)
}

/// The partition of an OCEL log into per-checkpoint windows.
/// Partition key (in priority order, all TO BE COORDINATED with ggen):
///   1. event attribute "checkpoint" if ggen emits one (preferred; see §5 contract);
///   2. else the diagnostic_code object id prefix mapped via the checkpoint registry
///      (sibling spec #3) — e.g. GGEN-HARNESS-001 ↦ 001C;
///   3. else a single implicit window (no leakage analysis possible — Warning).
pub fn window_by_checkpoint(ocel: &OCEL, checkpoints: &[Checkpoint]) -> Vec<CheckpointWindow>;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CheckpointWindow { pub checkpoint: String, pub ordinal: u32, pub event_ids: Vec<String> }
```

**The three leakage rules (each a queryable conformance rule, returning findings):**

```rust
/// L1 — future-checkpoint-in-gate: an event whose checkpoint ordinal > the
/// gate's ordinal participates in (shares an episode/object with) a GatePassed
/// in the lower window. "checkpoint N+1 event polluted checkpoint N's gate."
pub fn check_future_checkpoint_leak(windows: &[CheckpointWindow], ocel: &OCEL) -> Vec<LeakageFinding>;

/// L2 — species-before-barrier: a diagnostic species emitted into the global
/// tape before its barrier_event (3.4). Replays the BARRIER DeclareModel.
/// Catches GGEN-HARNESS-001 firing before 001C_ALIVE.
pub fn check_barrier_violation(ocel: &OCEL, policy: &VariantPolicy) -> Vec<LeakageFinding>;

/// L3 — provisional-detector-global-leak: a species with detector_active=false
/// (provisional) that nonetheless produced events on the GLOBAL server/check
/// path (transport attribute == "lsp"|"headless" with no quarantine flag).
/// Reads ggen's transport attribute (events.rs:213-223) + the species dormancy map.
pub fn check_provisional_leak(ocel: &OCEL, dormant_species: &[String]) -> Vec<LeakageFinding>;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LeakageFinding {
    pub rule: LeakageRule,             // L1|L2|L3
    pub code: VariantRefusal,
    pub severity: FindingSeverity,     // reuse receipt.rs:56 vocabulary
    pub json_path: String,             // e.g. "events[42].id"
    pub message: String,
    pub from_checkpoint: Option<String>,
    pub into_checkpoint: Option<String>,
}
```

L1 is the timestamp/ordering analog of `validate_ocel_object_lifecycles` (`ocel_io.rs:413`) but keyed on
*checkpoint ordinal*, not raw timestamp: it walks each `GatePassed`'s episode-and-object neighborhood and flags any
co-participating event from a strictly-higher-ordinal window. L2/L3 replay the barrier law and the dormancy map.

### 3.6 The verdict envelope (mirrors `ReceiptDoctor`, `receipt.rs:77`)

```rust
// The stable refusal-code enum for this oracle area (copy of the ReceiptTruthRefusal discipline).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum VariantRefusal {
    // variant governance
    ClearedBeforeRoute,
    ReceiptBeforeGate,
    RepairWithoutPendingRepair,
    DoubleTerminalState,
    ForbiddenSignature,        // explicit policy.forbidden hit
    // leakage
    FutureCheckpointInGate,    // L1
    BarrierViolation,          // L2
    ProvisionalDetectorLeak,   // L3
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum OracleVerdict { Admitted, Refused }

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VariantGovernanceReport {
    pub report_version: String,        // "ggen-oracle/variant/1" — versioned envelope (§5)
    pub checkpoint: String,
    pub verdict: OracleVerdict,
    pub conformance: ConformanceResult,            // reuse conformance.rs:62
    pub variants: Vec<ClassifiedVariant>,          // each with VariantClass + receipt_ids
    pub drift: Option<VariantDrift>,               // vs. baseline window if provided
    pub findings: Vec<VariantFinding>,             // {code,severity,json_path,message}
    pub leakage: Vec<LeakageFinding>,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VariantFinding { pub code: VariantRefusal, pub severity: FindingSeverity, pub json_path: String, pub message: String }
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClassifiedVariant { pub signature: String, pub class: VariantClass, pub count: usize, pub case_ids: Vec<String>, pub receipt_ids: Vec<String> }
```

`verdict = Refused` iff any finding/leakage has `severity == Deny` (any forbidden signature, any L1/L2/L3 Deny).
`New` variants are `Warning` only → `Admitted` with a warning (quarantine, not block).

---

## 4. Maps onto the `wpm` CLI (T8)

Add `wpm oracle` (new `crates/wasm4pm-cli/src/commands/oracle.rs`), wired into the command tree in
`crates/wasm4pm-cli/src/main.rs` beside `mining`/`receipt` (`00-STRUCTURE-MAP.md` §5). Honors the
exit-code + stdout-JSON convention (`main.rs` `try_main()->anyhow::Result<()>`, `e.die()` on `Err`):

```
wpm oracle
├── variant <log.ocel.jsonl> --policy <policy.json> [--baseline <prev.ocel.jsonl>] [-f json|human]
│       → VariantGovernanceReport; exit 0 Admitted, exit 1 Refused
├── leakage <log.ocel.jsonl> --checkpoints <checkpoints.json> --policy <policy.json> [-f json]
│       → leakage-only report (Vec<LeakageFinding>); exit non-zero on any Deny
└── signature <log.ocel.jsonl>           → enumerate VariantSet only (catalog-building aid), JSON
```

Default `--format json` for `variant`/`leakage` (machine-first, unlike `mining` which is human-table-only).
The command reads the NDJSON via the new `import_ocel_ndjson` (GGEN-NEEDS §4a, sibling spec) → `OCEL` (2.A),
flattens per-episode via the per-type flatten bridge (reference: `flatten_ocel_to_eventlog_for_type`,
`oc_petri_net.rs:102`) keyed on the `"episode"` qualifier, then runs §3. JSON serialization uses
`serde_json::to_string_pretty(&report)` exactly like `receipt.rs:140`.

**Smallest first patch (unblocks proof):** `wpm oracle variant` over the existing
`fixtures/real/trace-conform-agent-proof-lifecycle` (whose `collect_evidence → verify_evidence → emit_receipt` chain
is a structural sibling of the 6-link loop, `00-STRUCTURE-MAP.md` §6) proves the enumeration + classification path end
to end before the leakage rules land.

---

## 5. ggen-side consumption contract (external `wpm` oracle, JSON report)

Per GGEN-NEEDS §5, ggen consumes this as a **subprocess oracle**, not a linked dependency. ggen's living-loop
(`/Users/sac/ggen/crates/ggen-lsp/src/intel/`) calls:

```bash
wpm oracle variant \
  .ggen/ocel/agent-edit-events.ocel.jsonl \
  --policy .ggen/oracle/policy.GGEN-TPL-001.json \
  --baseline .ggen/ocel/last-hour.ocel.jsonl \
  -f json
# exit 0 + {verdict:"Admitted",...}  → loop proceeds
# exit 1 + {verdict:"Refused", findings:[{code:"ReceiptBeforeGate",...}]} → Andon: STOP THE LINE
```

**Contract terms (load-bearing):**

1. **Stable serialized field names.** The oracle reads `activity` (via `OCELEvent` `#[serde(alias="activity")]`,
   `00-STRUCTURE-MAP.md` §9.2), the episode relationship qualifier `"episode"` (`events.rs:57`), and `ReceiptEmitted`'s
   `receipt_id` attribute (`events.rs:304`) for T3. **ggen's proof tests grep the tape for `"activity":"DiagnosticRaised"`,
   the object id substring, and the code `GGEN-TPL-001`** — the oracle must not require ggen to rename these. Any field
   the oracle keys on that ggen does not yet emit (notably the `checkpoint` partition attribute, §3.5) is a
   **coordinated ggen-side addition**, never assumed silently.
2. **Refusal codes are an API.** `VariantRefusal` variant names are part of the contract; ggen's Andon handler matches
   on them (`ReceiptBeforeGate` → re-observe before receipt; `BarrierViolation` → the dormant species fired). Adding a
   refusal code is backward-compatible; renaming one is breaking and must be coordinated.
3. **Exit code = Andon signal.** Exit 0 = `Admitted`, exit ≥1 = `Refused`. ggen's Chicago-TDD subprocess test asserts
   on exit code + parsed JSON (externalizable evidence), matching `crates/wasm4pm-cli/tests/cli_tests.rs` discipline.
4. **The policy + checkpoints files are ggen-authored** and live under `.ggen/oracle/`. The oracle never invents the
   lawful catalog; ggen supplies `VariantPolicy` (the signatures + the `DeclareModel` law) per checkpoint. This keeps
   the *law* on ggen's side (RDF-is-truth) and the *adjudication* on wasm4pm's side.
5. **report_version field** gates schema evolution: `"ggen-oracle/variant/1"`. ggen pins the major; a bump is a
   coordinated change.

Example refused report ggen parses:

```json
{
  "report_version": "ggen-oracle/variant/1",
  "checkpoint": "GGEN-TPL-001@001B",
  "verdict": "Refused",
  "conformance": { "fitness": 0.83, "precision": null, "generalization": null, "simplicity": null,
                   "total_traces": 12, "fitting_traces": 10, "deviating_traces": 2 },
  "variants": [
    { "signature": "a1b2c3d4e5f60718", "class": "Accepted", "count": 9,
      "case_ids": ["..."], "receipt_ids": ["..."] },
    { "signature": "ff00 aa11 bb22 cc33", "class": "Forbidden", "count": 1,
      "case_ids": ["3f9c..."], "receipt_ids": ["7a21..."] }
  ],
  "drift": { "jaccard_distance": 0.18, "new_signatures": ["..."], "vanished_signatures": [],
             "frequency_shift": [["a1b2c3d4e5f60718", 2]] },
  "findings": [
    { "code": "ReceiptBeforeGate", "severity": "Deny",
      "json_path": "events[7].id",
      "message": "episode 3f9c... emitted ReceiptEmitted (e7) before any GatePassed" }
  ],
  "leakage": [
    { "rule": "L2", "code": "BarrierViolation", "severity": "Deny",
      "json_path": "events[11].id",
      "message": "GGEN-HARNESS-001 diagnostic emitted before 001C_ALIVE barrier",
      "from_checkpoint": "001C", "into_checkpoint": "001B" }
  ]
}
```

---

## 6. Fixtures (T9) — the bad-trace corpus

Following `fixtures/real/<scenario>/` (`00-STRUCTURE-MAP.md` §6). Each dir holds an `input.ocel.jsonl` (ggen-shape
NDJSON), a `policy.json` (`VariantPolicy`), and `expected-report.json` (the `VariantGovernanceReport` the oracle must
produce — the assertion target for `cli_tests.rs`).

| Fixture dir | Contents | Asserts |
|---|---|---|
| `fixtures/real/variant-clean-repair/` | the 6-link `clean_repair` signature, 3 episodes | `verdict=Admitted`, all `Accepted`, 0 findings |
| `fixtures/real/variant-andon-blocked/` | `andon_blocked` + `fake_live_recovered` | both `Accepted` (lawful rework), 0 Deny findings |
| `fixtures/real/variant-receipt-before-gate/` | episode with `ReceiptEmitted` before `GatePassed` | `verdict=Refused`, finding `ReceiptBeforeGate` |
| `fixtures/real/variant-clear-before-route/` | `GatePassed` with no `RouteSelected` | finding `ClearedBeforeRoute` |
| `fixtures/real/variant-repair-no-pending/` | `RepairApplied` with no `RepairSuggested`/`RouteSelected` | finding `RepairWithoutPendingRepair` |
| `fixtures/real/variant-double-terminal/` | both `ReceiptEmitted` and `RefusalEmitted` for one episode | finding `DoubleTerminalState` |
| `fixtures/real/leakage-future-checkpoint/` | a 001C event sharing an episode with a 001B `GatePassed` | L1 `FutureCheckpointInGate` |
| `fixtures/real/leakage-barrier-violation/` | `GGEN-HARNESS-001` diagnostic before `001C_ALIVE` | L2 `BarrierViolation` |
| `fixtures/real/leakage-provisional-global/` | `detector_active:false` species event on `transport:"headless"` | L3 `ProvisionalDetectorLeak` |

These also seed sibling spec #12's bad-trace corpus. The generator can be a `wpm oracle signature` round-trip plus
hand-authored forbidden lines (cheaper than a runtime mutator; the forbidden patterns are small).

---

## 7. Acceptance criteria (verifiable by wasm4pm builders)

1. **Variant enumeration.** `enumerate_variants` over `fixtures/real/variant-clean-repair/input.ocel.jsonl` yields one
   `VariantOccurrence` whose `activities` equal the 6-link sequence and whose `signature` is stable across two runs
   (`Variant::signature` determinism unit test, beside `dfg.rs:83` style).
2. **Classification.** Each forbidden fixture (6.3–6.6) produces `verdict=Refused` with exactly its named
   `VariantRefusal` code as a `Deny` finding; each lawful fixture (6.1–6.2) produces `verdict=Admitted` with zero `Deny`.
3. **Declare-law replay.** `check_declare` over a hand-built `receipt_before_gate` sequence returns the
   `precedence(GatePassed,ReceiptEmitted)` violation; over `clean_repair` returns empty. A *novel* forbidden ordering
   (not in `policy.forbidden`) is still caught by the law (proves T5 generalizes beyond the catalog).
4. **Drift.** `drift(current, baseline)` over two windows differing by one variant returns
   `jaccard_distance > 0`, the new signature in `new_signatures`, and a `frequency_shift` entry.
5. **Variant→receipt mapping.** `VariantOccurrence.receipt_ids` for `clean_repair` equals the `receipt_id` attribute
   of its `ReceiptEmitted` event (read from `events.rs:304`'s attribute).
6. **Leakage L1.** `leakage-future-checkpoint` yields a `FutureCheckpointInGate` Deny with correct
   `from_checkpoint`/`into_checkpoint`.
7. **Leakage L2 (barrier law).** `leakage-barrier-violation` yields `BarrierViolation`; and the **barrier is replayable**:
   removing the `GGEN-HARNESS-001` pre-ALIVE event makes the same input `Admitted` (proves T7 is law, not a hardcoded bool).
8. **Leakage L3.** `leakage-provisional-global` yields `ProvisionalDetectorLeak` for a `detector_active:false` species
   on a non-quarantined transport.
9. **CLI contract.** `wpm oracle variant <log> --policy <p> -f json` prints a `VariantGovernanceReport` with
   `report_version=="ggen-oracle/variant/1"`, exits 0 on Admitted / 1 on Refused. Verified in
   `crates/wasm4pm-cli/tests/cli_tests.rs` via `assert_cmd` + `predicates` (real binary, no mocks).
10. **No silent rename.** A test asserts the oracle still reads `activity`/`event_id`/inline `objects` (shape 2.C/2.D)
    so ggen's existing proof greps survive (consistency with `00-STRUCTURE-MAP.md` §9.2 alias decision).
11. **Link-safety.** `wasm4pm-algos` (with the new `variant`/`declare_conformance`/`checkpoint` modules) compiles with
    no `wasm-bindgen` in its dependency tree (so the verdict types stay ggen-linkable if ever needed). `version.workspace = true`.
12. **Whole-suite green.** Full `cargo test` across the workspace stays green; new modules add unit tests inline
    (`#[cfg(test)] mod tests`) in the `conformance.rs:397`/`dfg.rs:83` style.

---

## 8. Dependencies on sibling specs / open questions

**Depends on:**
- **`ocel-core` carving** (GGEN-NEEDS §2, sibling spec): the `variant`/`checkpoint` modules type against `ocel-core`'s
  `OCEL`/`OCELEvent`/`OCELRelationship` (shape 2.A), not the engine's 2.B.
- **NDJSON importer** (GGEN-NEEDS §4a, sibling spec): `wpm oracle` reads ggen's `.ocel.jsonl` only after
  `import_ocel_ndjson` exists. Until then, fixtures can be whole-doc JSON via `import_ocel_json` (`mod_ocel.rs:4`).
- **Checkpoint model registry (#3, sibling spec):** §3.5's partition-by-diagnostic-code fallback and the per-checkpoint
  `VariantPolicy` storage need the registry. Without it, only the explicit-`checkpoint`-attribute path (priority 1) works.
- **Serialized-name reconciliation** (`00-STRUCTURE-MAP.md` §9.2): the `#[serde(alias="activity")]` decision on
  `OCELEvent.event_type` is a hard prerequisite for variant-key extraction.

**Open questions (flag back to ggen + sibling authors):**
1. **Checkpoint partition key.** ggen does not emit a `checkpoint` event attribute today. Preferred fix: ggen adds one
   in `events.rs` (coordinated, per §5 term 1). Fallback: derive from diagnostic-code prefix via the registry. Which?
2. **Window boundary semantics.** Is a checkpoint window time-bounded (the hour), barrier-event-bounded (between two
   `*_ALIVE` events), or run-id-bounded? §3.5 assumes barrier/registry-bounded; ggen must confirm.
3. **`fake_live_recovered` loop bound.** How many `GateFailed → RouteSelected` rework cycles are lawful before the
   variant is "explosion" not "recovery"? Needs a policy threshold (a `max_rework` field on `VariantPolicy`).
4. **Receipt-barrier event name.** Is `001C_ALIVE` an actual emitted activity, or a derived marker? If derived, the
   oracle needs a rule to synthesize it; if emitted, ggen must add it to `activity` constants (`events.rs:14`).
5. **Provisional-leak transport policy (L3).** Which transports count as "global server/check path"? §3.5 assumes
   `lsp`/`headless`; ggen owns the transport vocabulary (`events.rs:165`) and must confirm the dormant-species set.
