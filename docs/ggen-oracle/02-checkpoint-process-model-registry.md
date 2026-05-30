# 02 — Gall Checkpoint Process-Model Registry (ggen Oracle spec)

**Status:** Spec. Buildable by the wasm4pm agent system.
**Date:** 2026-05-30
**Capability area:** #3 (Checkpoint model registry) in `00-STRUCTURE-MAP.md §8`; supplies the *declared model* substrate for #2 (discovery-vs-declared), #4 (variant governance), #7 (prefix/negative conformance), #8 (cross-checkpoint leakage), #9 (receipt causality).
**Version train:** `26.5.x` (workspace `26.5.29`, `Cargo.toml:7`). New artifacts use `version.workspace = true`.
**Authority direction:** wasm4pm owns PROCESS law. ggen *asks* (`wpm` subprocess + JSON). ggen *binds* a checkpoint id to a model id; wasm4pm *adjudicates* the trace against that model.

> This spec is descriptive only. It writes no Rust, no Cargo.toml, no fixture file as standalone source. Every schema / grammar / fixture below lives inside this markdown as a fenced block; the wasm4pm builders lift them into the tree.

---

## 0. Purpose — the bridge it builds

The Gall oracle's full chain is:

```
doctrine  →  MODEL  →  trace  →  conformance  →  receipt
            (this spec)  (ggen OCEL)  (specs 03/04)  (spec 05)
```

This spec specifies the **MODEL** link: a *machine-checkable registry of canonical checkpoint process models*. A "checkpoint" is a Gall obligation (e.g. `GALL-CHECKPOINT-001C`). Each checkpoint **binds** to exactly one canonical model id (e.g. `living_diagnostic_clear_v1`). The registry is the single place where doctrine ("a diagnostic must clear through the 6-link living loop, ReceiptEmitted last") is frozen into a structure the conformance engine can replay a trace against.

Without this registry, every other oracle capability has nothing to conform *against*: `wpm mining conformance` today loads `DFG::new()` (a mocked empty model — `mining.rs:75`). The registry is the thing that turns "conform against nothing" into "conform against the declared law for this checkpoint."

The leap from history-judge to possibility-judge happens here: a registered model carries not only *allowed* structure (a workflow net / choice graph) but the **refusal transitions** and **terminal states** that let an online checker say STOP mid-trace ("`ReceiptEmitted` fired but you are not in the post-`GatePassed` marking").

---

## 1. What EXISTS in wasm4pm to build on (cited)

The most important finding: **a registry already exists and `living_diagnostic_clear_v1` is already registered.** This spec extends it; it does not start from zero.

| Capability | Status | Citation (file:symbol) |
|---|---|---|
| Process-model registry (in-memory, TTL+LRU) | **EXISTS** | `wasm4pm/src/model_registry.rs:101` `ProcessModelRegistry`; `:107 new`, `:121 get`, `:142 insert`, `:179 resolve_model` |
| Model envelope (id, name, version, type, payload, metadata) | **EXISTS** | `model_registry.rs:25` `ProcessModelEnvelope` |
| Model-type tag | **EXISTS (2 variants)** | `model_registry.rs:16` `ModelType { PNML, POWL }` |
| Variant → model routing (guards, priority) | **EXISTS** | `model_registry.rs:88` `VariantRule`, `:47 ConditionalGuard`, `:37 ComparisonOp`, `:82 VariantKey`, `:179 resolve_model` |
| Default registration of `living_diagnostic_clear_v1` | **EXISTS** | `model_registry.rs:194-209` `static REGISTRY` includes `fixtures/models/living_diagnostic_clear_v1.pnml` via `include_str!` |
| WASM register/get bindings (pure-Rust core callable) | **EXISTS** | `model_registry.rs:355 register_model`, `:402 get_model` — both validate SemVer + parse payload; inner logic is pure Rust |
| Structural workflow-net validator | **EXISTS** | `model_registry.rs:245 validate_workflow_net` (1 source, 1 sink, all-nodes-on-source→sink path) |
| PNML parse/serialize | **EXISTS** | `wasm4pm/src/pnml_io.rs:53 from_pnml(&str)->Result<PetriNet,String>`, `:213 to_pnml(&PetriNet)->String` (roxmltree) |
| The canonical Gall PNML fixture | **EXISTS** | `fixtures/models/living_diagnostic_clear_v1.pnml` (6 transitions + ALIVE; see §3.1) |
| SemVer validator | **EXISTS** | `model_registry.rs:218 validate_semver` |
| POWL / Choice-Graph model types | **EXISTS** | `crates/wasm4pm-types/src/choice_graph.rs:29 ChoiceGraph` (+ validation `:75 new`, errors `:38`); `powl8_op.rs:17 Powl8Op` |
| Choice-graph route fixtures (sibling of 6-link) | **EXISTS** | `routes/agent-proof-lifecycle.powl.json` (`collect_evidence→verify_evidence→emit_receipt`); `fixtures/real/trace-conform-agent-proof-lifecycle/model.powl.json` + `expected-conform.json` |
| Declare constraint/model types (no checker) | **EXISTS (types only)** | `crates/wasm4pm-types/src/models.rs:555 DeclareConstraint`, `:573 DeclareModel` |
| Reachability/transition-system substrate | **EXISTS** | `wasm4pm/src/transition_system.rs:56 TransitionSystem`, `:34 TSState`, `:43 TSTransition`, `:85 discover_transition_system` |
| Reachability graph artifact (worked example) | **EXISTS** | `reachability_graph.yaml` (8 markings, deadlock/liveness/boundedness analysis — *for a different net*, `lawful_dispatch_system`) |

**`PetriNet` shape used by the registry** (`model_registry.rs:13` imports `crate::models::PetriNet`, the **engine** 2.B type): `wasm4pm/src/models.rs:773 PetriNetPlace{id,label,marking}`, `:784 PetriNetTransition{id,label,is_invisible}`, `:795 PetriNetArc{from,to,weight}`. PNML transition **labels** carry the activity name (`<name><text>…`); transition **ids** are `t_<Activity>`.

---

## 2. What is TO BE BUILT (cited gaps)

| # | Item | Why it is TO BE BUILT (evidence) |
|---|---|---|
| B1 | **Checkpoint → model binding table** | No checkpoint concept exists. The registry maps `model_id → envelope` (`model_registry.rs:102`) and `VariantKey → model_id` (`:179`), but nothing maps `GALL-CHECKPOINT-001C → living_diagnostic_clear_v1`. `resolve_model` keys on attribute guards, not checkpoint ids. |
| B2 | **Enriched model schema** (allowed/required events, partial order, permitted loops, **refusal transitions**, **terminal states**) | `ProcessModelEnvelope.payload` is an opaque `String` (`model_registry.rs:31`) holding raw PNML/POWL. There is no typed schema for refusal transitions or terminal-state declarations. PNML has places/transitions/arcs but no first-class "refusal" or "ALIVE-terminal" semantics — `living_diagnostic_clear_v1.pnml` encodes ALIVE as just another transition. |
| B3 | **Disk-backed model directory loader** | The registry is in-memory + a single `include_str!` (`model_registry.rs:197`). No loader that scans `fixtures/models/*.{pnml,powl.json,checkpoint.json}` and registers all of them. |
| B4 | **`wpm model` CLI surface** | `main.rs` has no `model` command (grep: 0 hits). Registry is only reachable via `#[wasm_bindgen]` `register_model`/`get_model`. ggen (the external oracle consumer) cannot reach it as a subprocess today. |
| B5 | **The five missing checkpoint models** | Only `living_diagnostic_clear_v1` exists on disk. `residual_preservation_v1`, `checkpoint_leakage_guard_v1`, `andon_foreign_surface_v1`, `ten_agent_hourly_cycle_v1`, `receipt_order_barrier_v1` do not exist (grep: 0 hits for any of those names). |
| B6 | **6-link reconciliation of the existing PNML** | `living_diagnostic_clear_v1.pnml` has transition `RepairAttempted` (`fixtures/models/living_diagnostic_clear_v1.pnml:33`), but ggen's 6-link law is `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted` (GGEN-NEEDS §3.1) — two distinct repair transitions, no `ALIVE` activity in ggen's emitted log. The fixture and ggen's law disagree. **Reconcile, do not silently keep the mismatch.** |
| B7 | **Declared-vs-discovered diff & prefix-completability query** | `DeclareModel` is a type with no checker (`00-MAP §4.2`); `TransitionSystem` has no "is this prefix completable to a terminal state" query (`00-MAP §8 #7`). The registry must expose enough structure for spec 03/04 to build these. |

**Tally:** EXISTS = 14 cited surfaces (registry, envelope, variant routing, PNML IO, workflow validator, POWL/choice-graph types, the one fixture, transition-system substrate, …). TO BE BUILT = 7 items (B1–B7).

---

## 3. The model schema (concrete design)

### 3.0 Design choice: a *checkpoint model descriptor* wraps the existing envelope

Rather than fork `ProcessModelEnvelope`, add a **descriptor** layer that *references* an envelope by `model_id` and adds the semantic fields the envelope lacks (refusal transitions, terminal states, partial order, loops, event classes, checkpoint binding). The raw PNML/POWL stays the `payload`; the descriptor is the machine-checkable law on top.

Reasoning grounded in tree facts: `ProcessModelEnvelope.payload: String` (`model_registry.rs:31`) is deliberately opaque and already carries PNML. Wrapping (not replacing) keeps `register_model`/`get_model`/`from_pnml`/`validate_workflow_net` and the `static REGISTRY` default registration intact (`model_registry.rs:194`). The descriptor adds a sidecar JSON; the envelope payload remains the geometry.

### 3.1 The mismatch to reconcile first (B6)

The on-disk fixture (`fixtures/models/living_diagnostic_clear_v1.pnml`) — verbatim transition labels:

```
DiagnosticRaised → RouteSelected → RepairAttempted → GatePassed → ReceiptEmitted → ALIVE
```

ggen's emitted 6-link law (GGEN-NEEDS §3.1, `crates/ggen-lsp/src/intel/events.rs` builders):

```
DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted
```

Two differences: (a) the fixture collapses `RepairSuggested`+`RepairApplied` into one `RepairAttempted`; (b) the fixture has an `ALIVE` transition ggen never emits (`ALIVE` is a *terminal-state property*, not an activity in ggen's log).

**Resolution (this spec mandates):** the canonical model uses ggen's two-transition repair and treats `ALIVE` as a **terminal state**, not a fired activity. The `RepairAttempted`/`ALIVE` fixture is updated to match ggen's law *in the same change* as the descriptor lands (no silent rename — coordinate with ggen's Gall-checkpoint receipt tests per GGEN-NEEDS §3.1). The reconciled PNML is given verbatim in §6.1.

### 3.2 Descriptor schema (JSON, the declarative format)

One `*.checkpoint.json` per checkpoint model, stored beside the PNML in `fixtures/models/`. Schema (JSON Schema draft-07, abbreviated):

```jsonc
{
  "$schema": "https://wasm4pm/schemas/gall-checkpoint-model/v1",
  "schema_version": "1.0.0",          // descriptor schema version
  "model_id": "living_diagnostic_clear_v1",   // MUST match a ProcessModelEnvelope.id
  "model_version": "1.0.0",           // SemVer; validated by validate_semver (model_registry.rs:218)
  "geometry": {                        // points at the registered envelope payload
    "model_type": "PNML",             // ModelType (model_registry.rs:16): "PNML" | "POWL"
    "ref": "living_diagnostic_clear_v1.pnml"   // file beside this descriptor; loaded into envelope.payload
  },

  // ── event classes (the serialized-name contract with ggen) ──
  "activity_key": "activity",          // ggen serializes the event kind as "activity" (GGEN-NEEDS §3.1)
  "allowed_events": [                  // closed set: any activity NOT here = ForeignSurface refusal
    "DiagnosticRaised","RouteSelected","RepairSuggested","RepairApplied","GatePassed","ReceiptEmitted"
  ],
  "required_events": [                 // MUST appear for a clearing trace to be ALIVE
    "DiagnosticRaised","GatePassed","ReceiptEmitted"
  ],
  "optional_events": ["RouteSelected","RepairSuggested","RepairApplied"],

  // ── partial order (precedence law) ──
  // each pair [A,B] = "B must not occur before A has occurred" (Declare 'precedence')
  "partial_order": [
    ["DiagnosticRaised","RouteSelected"],
    ["RouteSelected","RepairSuggested"],
    ["RepairSuggested","RepairApplied"],
    ["RepairApplied","GatePassed"],
    ["GatePassed","ReceiptEmitted"]
  ],

  // ── permitted loops (bounded rework) ──
  "permitted_loops": [
    { "back_edge": ["GatePassed_fail","RouteSelected"], "max_iterations": 3,
      "guard_attr": "gate.result", "guard_value": "fail" }
  ],

  // ── refusal transitions (the STOP-mid-trace law) ──
  // each refusal = an event observed in a marking that forbids it
  "refusal_transitions": [
    { "code": "GALL-ORACLE-R01", "when_event": "ReceiptEmitted",
      "forbidden_unless_seen": ["GatePassed"],
      "severity": "Deny", "message": "ReceiptEmitted before GatePassed" },
    { "code": "GALL-ORACLE-R02", "when_event": "RepairApplied",
      "forbidden_unless_seen": ["RepairSuggested"],
      "severity": "Deny", "message": "RepairApplied without a routed RepairSuggested" },
    { "code": "GALL-ORACLE-R03", "when_event": "*",
      "forbidden_if_not_in": "allowed_events",
      "severity": "Deny", "message": "Foreign activity on this checkpoint surface" }
  ],

  // ── terminal states (when is the trace ALIVE / done) ──
  "terminal_states": [
    { "name": "ALIVE", "requires_all_seen": ["GatePassed","ReceiptEmitted"],
      "and_last_event": "ReceiptEmitted" }
  ],
  "non_completable_if": [              // negative-conformance: prefix can NEVER reach ALIVE
    { "code": "GALL-ORACLE-DEAD01", "condition": "RepairApplied seen AND GatePassed not reachable" }
  ],

  // ── object lifecycle (cross-object law; consumed by spec 04) ──
  "object_types": {
    "file":            { "created_by": ["DiagnosticRaised"], "cardinality": "1" },
    "diagnostic_code": { "created_by": ["DiagnosticRaised"], "cardinality": "1" },
    "episode":         { "created_by": ["DiagnosticRaised"], "terminated_by": ["ReceiptEmitted"] },
    "agent":           { "created_by": ["RouteSelected"], "cardinality": "0..1" }
  },

  // ── checkpoint binding (B1) ──
  "binds_checkpoints": ["GALL-CHECKPOINT-001C"],

  // ── provenance ──
  "doctrine_ref": "GGEN-NEEDS.md §3.1 (6-link living loop)",
  "model_digest": ""                   // BLAKE3 of canonical geometry; filled at register time
}
```

**Refusal-finding shape** mirrors the existing receipt judge so the oracle's verdict is uniform across surfaces. From `wasm4pm/src/receipt.rs:63 ReceiptFinding{code,severity,json_path,message}` and `:56 FindingSeverity{Deny,Warning}` and `:92 VerificationState{Admitted,Refused}`. The descriptor's `refusal_transitions[].code/severity/message` map 1:1; the conformance engine (spec 03) emits `ReceiptFinding`-shaped findings.

### 3.3 EBNF — the partial-order / refusal mini-grammar

A compact textual form for the precedence + refusal law, for authoring and for the bad-trace generator (capability #12). The JSON above is canonical; this grammar is a human-writable surface that compiles to it.

```ebnf
model_law      = { statement } ;
statement      = precedence | response | refusal | terminal | loop_decl | foreign ;
precedence     = "before" ws event ws "requires" ws event ;        (* B requires A: precedence A,B *)
response       = "after"  ws event ws "expect"   ws event ;         (* A then B eventually *)
refusal        = "refuse" ws code ws "when" ws event ws "unless_seen" ws event_list ;
foreign        = "refuse_foreign" ws "into" ws event_list ;        (* closed allowed set *)
terminal       = "alive"  ws "when_all" ws event_list ws "and_last" ws event ;
loop_decl      = "loop"   ws event ws "->" ws event ws "max" ws integer ;
event_list     = event { "," event } ;
event          = '"' identifier '"' ;
code           = '"' "GALL-ORACLE-" alnum { alnum | "-" } '"' ;
ws             = " " | "\t" ;
```

Worked example (compiles to the `living_diagnostic_clear_v1` JSON above):

```
before "RouteSelected" requires "DiagnosticRaised"
before "RepairSuggested" requires "RouteSelected"
before "RepairApplied" requires "RepairSuggested"
before "GatePassed" requires "RepairApplied"
before "ReceiptEmitted" requires "GatePassed"
refuse "GALL-ORACLE-R01" when "ReceiptEmitted" unless_seen "GatePassed"
refuse "GALL-ORACLE-R02" when "RepairApplied" unless_seen "RepairSuggested"
refuse_foreign into "DiagnosticRaised","RouteSelected","RepairSuggested","RepairApplied","GatePassed","ReceiptEmitted"
loop "GatePassed" -> "RouteSelected" max 3
alive when_all "GatePassed","ReceiptEmitted" and_last "ReceiptEmitted"
```

### 3.4 Rust descriptor type (sketch — lives in `model_registry.rs` alongside the existing types)

```rust
// Proposed addition to wasm4pm/src/model_registry.rs (extends, does not replace).
// Pure serde; no wasm-bindgen on the data type (so it is callable from the wpm CLI core).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointModelDescriptor {
    pub schema_version: String,
    pub model_id: String,              // MUST equal a ProcessModelEnvelope.id
    pub model_version: String,         // validate_semver (model_registry.rs:218)
    pub geometry: GeometryRef,         // { model_type: ModelType, ref: String }
    pub activity_key: String,          // "activity" for ggen
    pub allowed_events: Vec<String>,
    pub required_events: Vec<String>,
    #[serde(default)] pub optional_events: Vec<String>,
    pub partial_order: Vec<[String; 2]>,
    #[serde(default)] pub permitted_loops: Vec<PermittedLoop>,
    pub refusal_transitions: Vec<RefusalTransition>, // -> ReceiptFinding (receipt.rs:63)
    pub terminal_states: Vec<TerminalState>,
    #[serde(default)] pub non_completable_if: Vec<NonCompletableRule>,
    #[serde(default)] pub object_types: std::collections::HashMap<String, ObjectLifecycle>,
    pub binds_checkpoints: Vec<String>,   // B1: GALL-CHECKPOINT-001C, ...
    #[serde(default)] pub doctrine_ref: String,
    #[serde(default)] pub model_digest: String,   // BLAKE3 via receipt.rs:164 compute_blake3_hash
}
```

`RefusalTransition.severity` reuses `wasm4pm::receipt::FindingSeverity` (`receipt.rs:56`). The descriptor stays in `model_registry.rs` (not `ocel-core`) because it depends on `ModelType` and the engine `PetriNet`, neither of which `ocel-core` should pull.

---

## 4. How it maps onto crates + the `wpm` CLI

### 4.1 Crate placement

| Piece | Home | Why |
|---|---|---|
| `CheckpointModelDescriptor` + loader | `wasm4pm/src/model_registry.rs` (extend) | Co-locate with `ProcessModelRegistry` (`:101`), reuse `validate_semver` (`:218`), `validate_workflow_net` (`:245`), `from_pnml` (`pnml_io.rs:53`). |
| Checkpoint→model binding map | `ProcessModelRegistry` field `checkpoints: HashMap<String,String>` + `bind_checkpoint(checkpoint_id, model_id)` / `resolve_checkpoint(checkpoint_id)->Option<String>` | Mirrors the existing `resolve_model` pattern (`:179`); LRU/TTL untouched. |
| Directory loader (B3) | `model_registry.rs::load_model_dir(path)->Result<usize,String>` | Scans `*.checkpoint.json`, registers envelope from `geometry.ref`, binds checkpoints. Replaces the single `include_str!` (`:197`) with directory-driven registration. |
| Declarative law evaluation (precedence/refusal/terminal) | spec 03 (conformance) consumes the descriptor; the *type* lives here. | Keeps the registry the source of law; conformance the judge. |
| `DeclareModel` bridge | optional `descriptor.to_declare()->DeclareModel` (`models.rs:573`) | Lets the future Declare checker reuse `partial_order` as `precedence` constraints (00-MAP rec #6). |

The descriptor type is **pure Rust + serde** → reachable from the `wpm` CLI core. The existing `#[wasm_bindgen] register_model` (`:355`) stays for the JS side; a new pure-Rust `register_descriptor(&str)` underlies the CLI.

### 4.2 `wpm model` CLI surface (B4)

New subcommand tree in `crates/wasm4pm-cli/src/commands/` (sibling of `mining.rs`, `receipt.rs`), registered in `main.rs`. Follows the `wpm receipt doctor` JSON-and-exit-code convention (`receipt.rs:140` `--format json`, `:186` non-zero exit on refusal).

```
wpm model
├── register <descriptor.checkpoint.json> [--dir <models_dir>] [-f human|json]
│       loads descriptor, validates SemVer + workflow-net + closed-event-set,
│       registers envelope, binds checkpoints. Exit non-zero on invalid model.
├── list                              [-f human|json]
│       lists registered model_ids, versions, bound checkpoints.
├── show <model_id|GALL-CHECKPOINT-id> [-f human|json]
│       resolves checkpoint→model if a checkpoint id is given; prints the descriptor.
├── validate <descriptor.checkpoint.json> [-f human|json]
│       static check only (no registration): SemVer, workflow-net, allowed/required
│       consistency, partial-order acyclicity, terminal reachability. Findings as
│       ReceiptFinding[] shape.
└── bind <GALL-CHECKPOINT-id> <model_id> [-f human|json]
        explicit binding (B1), persisted to the registry.
```

`validate`/`register`/`show` emit the **versioned JSON report envelope** defined in §5.1 with `--format json` and exit non-zero on any `Deny` finding — exactly mirroring `receipt doctor` (`receipt.rs:186`). Tests go in `crates/wasm4pm-cli/tests/cli_tests.rs` with `assert_cmd::Command::cargo_bin("wpm")` (00-MAP §6).

---

## 5. The ggen-side consumption contract (external `wpm` oracle, JSON)

ggen never links the registry. ggen invokes `wpm` as a subprocess and reads stdout JSON + exit code (GGEN-NEEDS §5; Chicago-TDD real boundary).

### 5.1 Versioned JSON report envelope (shared with sibling specs 03/04/05)

One stable shape, modeled on `wasm4pm::receipt::ReceiptDoctorReport` (`receipt.rs:939`) so all oracle commands speak the same dialect:

```jsonc
{
  "report_version": "1.0.0",
  "report_kind": "model_validation",        // model_validation | model_show | model_list
  "wpm_version": "26.5.29",
  "subject": { "model_id": "living_diagnostic_clear_v1",
               "checkpoint_id": "GALL-CHECKPOINT-001C" },
  "verdict": "Admitted",                     // Admitted | Refused  (receipt.rs:92 VerificationState)
  "findings": [                              // empty when Admitted with no warnings
    { "code": "GALL-ORACLE-R01", "severity": "Deny",
      "json_path": "$.refusal_transitions[0]",
      "message": "ReceiptEmitted before GatePassed" }
  ],
  "model_digest": "<blake3>",                // receipt.rs:164 compute_blake3_hash over canonical geometry
  "summary": { "allowed_events": 6, "required_events": 3, "refusal_rules": 3, "terminal_states": 1 }
}
```

### 5.2 ggen's call pattern

```bash
# 1. ggen registers (once, or in CI) the checkpoint model it will be judged against:
wpm model register fixtures/models/living_diagnostic_clear_v1.checkpoint.json --format json
#    exit 0 + verdict:"Admitted"  => model is lawful and bound to GALL-CHECKPOINT-001C

# 2. ggen resolves which model governs a checkpoint (the binding, B1):
wpm model show GALL-CHECKPOINT-001C --format json
#    => { subject.model_id: "living_diagnostic_clear_v1", ... }

# 3. ggen then hands its emitted .ocel.jsonl + the resolved model to the conformance oracle
#    (spec 03): wpm mining conformance <.ocel.jsonl> <model_id> --format json
```

**Contract guarantees ggen relies on (acceptance-testable):**
- Exit code 0 ⟺ `verdict == "Admitted"`; non-zero ⟺ `verdict == "Refused"` (mirrors `receipt.rs:186`).
- `subject.model_id` is stable for a given `checkpoint_id` across invocations (binding is deterministic, priority-sorted like `resolve_model` `:181`).
- `findings[].code` values are from a closed, documented set (`GALL-ORACLE-*`); ggen may grep them in proof tests.
- The serialized event kind is matched on `activity_key="activity"` — consistent with ggen's emission and wasm4pm's own fixtures (`expected-ocel.json` uses `"activity"`; 00-MAP §2.C). **The registry never forces ggen to rename `activity`.**

---

## 6. Concrete model definitions (the six checkpoint models)

All six are `*.checkpoint.json` descriptors. `living_diagnostic_clear_v1` additionally has the reconciled PNML geometry (§6.1). The other five may use PNML or `model_type:"POWL"` with a `ChoiceGraph` geometry (`choice_graph.rs:29`), following the `routes/agent-proof-lifecycle.powl.json` precedent.

### 6.1 `living_diagnostic_clear_v1` — bound to `GALL-CHECKPOINT-001C`

Reconciled PNML geometry (replaces the `RepairAttempted`/`ALIVE`-as-transition fixture per B6; `ALIVE` becomes a terminal marking, two repair transitions):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<pnml>
  <net id="living_diagnostic_clear_v1" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel">
    <page id="page1">
      <place id="p_source"><name><text>p_source</text></name><initialMarking><text>1</text></initialMarking></place>
      <place id="p1"><name><text>p1</text></name></place>
      <place id="p2"><name><text>p2</text></name></place>
      <place id="p3"><name><text>p3</text></name></place>
      <place id="p4"><name><text>p4</text></name></place>
      <place id="p5"><name><text>p5</text></name></place>
      <place id="p_sink"><name><text>p_sink</text></name></place>
      <transition id="t_DiagnosticRaised"><name><text>DiagnosticRaised</text></name></transition>
      <transition id="t_RouteSelected"><name><text>RouteSelected</text></name></transition>
      <transition id="t_RepairSuggested"><name><text>RepairSuggested</text></name></transition>
      <transition id="t_RepairApplied"><name><text>RepairApplied</text></name></transition>
      <transition id="t_GatePassed"><name><text>GatePassed</text></name></transition>
      <transition id="t_ReceiptEmitted"><name><text>ReceiptEmitted</text></name></transition>
      <arc id="a1"  source="p_source" target="t_DiagnosticRaised"/>
      <arc id="a2"  source="t_DiagnosticRaised" target="p1"/>
      <arc id="a3"  source="p1" target="t_RouteSelected"/>
      <arc id="a4"  source="t_RouteSelected" target="p2"/>
      <arc id="a5"  source="p2" target="t_RepairSuggested"/>
      <arc id="a6"  source="t_RepairSuggested" target="p3"/>
      <arc id="a7"  source="p3" target="t_RepairApplied"/>
      <arc id="a8"  source="t_RepairApplied" target="p4"/>
      <arc id="a9"  source="p4" target="t_GatePassed"/>
      <arc id="a10" source="t_GatePassed" target="p5"/>
      <arc id="a11" source="p5" target="t_ReceiptEmitted"/>
      <arc id="a12" source="t_ReceiptEmitted" target="p_sink"/>
    </page>
  </net>
</pnml>
```

`p_sink` marked = terminal state `ALIVE` (no `t_ALIVE` activity). This still passes `validate_workflow_net` (`model_registry.rs:245`): one source `p_source`, one sink `p_sink`, every node on the source→sink path. Descriptor: the JSON in §3.2 verbatim.

### 6.2 `residual_preservation_v1` — bound to `GALL-CHECKPOINT-001B`

Doctrine: a residual (the "must be re-observed" set ggen carries) must be *preserved* — never silently cleared. A diagnostic may close only if its residual was observed at least once before `GatePassed`.

```jsonc
{
  "schema_version": "1.0.0", "model_id": "residual_preservation_v1", "model_version": "1.0.0",
  "geometry": { "model_type": "POWL", "ref": "residual_preservation_v1.powl.json" },
  "activity_key": "activity",
  "allowed_events": ["DiagnosticRaised","ResidualObserved","RouteSelected","RepairApplied","GatePassed","ReceiptEmitted"],
  "required_events": ["DiagnosticRaised","ResidualObserved","GatePassed","ReceiptEmitted"],
  "partial_order": [["DiagnosticRaised","ResidualObserved"],["ResidualObserved","GatePassed"],["GatePassed","ReceiptEmitted"]],
  "refusal_transitions": [
    { "code": "GALL-ORACLE-RES01", "when_event": "GatePassed", "forbidden_unless_seen": ["ResidualObserved"],
      "severity": "Deny", "message": "Gate passed without re-observing the residual set" },
    { "code": "GALL-ORACLE-RES02", "when_event": "ReceiptEmitted", "forbidden_unless_seen": ["GatePassed"],
      "severity": "Deny", "message": "Receipt emitted with unpreserved residual" }
  ],
  "terminal_states": [ { "name": "ALIVE", "requires_all_seen": ["ResidualObserved","GatePassed","ReceiptEmitted"], "and_last_event": "ReceiptEmitted" } ],
  "object_types": { "residual": { "created_by": ["DiagnosticRaised"], "terminated_by": ["ReceiptEmitted"], "cardinality": "1..*" } },
  "binds_checkpoints": ["GALL-CHECKPOINT-001B"], "doctrine_ref": "residual preservation"
}
```

### 6.3 `checkpoint_leakage_guard_v1` — bound to `GALL-CHECKPOINT-LEAK-001`

Doctrine (capability #8): checkpoint N+1's events must not pollute checkpoint N's gate. Events are window-scoped by a `checkpoint_id` attribute; an event whose `checkpoint_id` differs from the gate's window is a leak.

```jsonc
{
  "schema_version": "1.0.0", "model_id": "checkpoint_leakage_guard_v1", "model_version": "1.0.0",
  "geometry": { "model_type": "POWL", "ref": "checkpoint_leakage_guard_v1.powl.json" },
  "activity_key": "activity",
  "window_scope_attr": "checkpoint_id",
  "allowed_events": ["DiagnosticRaised","GatePassed","ReceiptEmitted"],
  "required_events": ["GatePassed"],
  "partial_order": [["DiagnosticRaised","GatePassed"]],
  "refusal_transitions": [
    { "code": "GALL-ORACLE-LEAK01", "when_event": "GatePassed",
      "forbidden_if_window_contains_foreign": true,
      "severity": "Deny", "message": "GatePassed window contains an event from a different checkpoint_id" },
    { "code": "GALL-ORACLE-LEAK02", "when_event": "*",
      "forbidden_if_window_mismatch": "checkpoint_id",
      "severity": "Deny", "message": "Event checkpoint_id leaked across the gate window" }
  ],
  "terminal_states": [ { "name": "SEALED", "requires_all_seen": ["GatePassed"], "and_last_event": "GatePassed" } ],
  "binds_checkpoints": ["GALL-CHECKPOINT-LEAK-001"], "doctrine_ref": "cross-checkpoint leakage (cap #8)"
}
```

> `window_scope_attr` / `forbidden_if_window_*` are descriptor extensions whose enforcement is spec 03's job; the registry only stores and validates the declaration. Flagged as a dependency in §8.

### 6.4 `andon_foreign_surface_v1` — bound to `GALL-CHECKPOINT-ANDON-001`

Doctrine: the Andon law — any activity outside the closed allowed set on this surface is an immediate STOP (foreign-surface intrusion). Pure closed-world refusal.

```jsonc
{
  "schema_version": "1.0.0", "model_id": "andon_foreign_surface_v1", "model_version": "1.0.0",
  "geometry": { "model_type": "POWL", "ref": "andon_foreign_surface_v1.powl.json" },
  "activity_key": "activity",
  "allowed_events": ["DiagnosticRaised","RouteSelected","RepairSuggested","RepairApplied","GatePassed","ReceiptEmitted"],
  "required_events": [],
  "partial_order": [],
  "refusal_transitions": [
    { "code": "GALL-ORACLE-FOR01", "when_event": "*", "forbidden_if_not_in": "allowed_events",
      "severity": "Deny", "message": "Foreign activity pulled the Andon: not in the checkpoint's allowed surface" }
  ],
  "terminal_states": [ { "name": "CLEAN", "requires_all_seen": [], "and_last_event": null } ],
  "binds_checkpoints": ["GALL-CHECKPOINT-ANDON-001"], "doctrine_ref": "Andon foreign-surface guard"
}
```

This is the registry-side analog of `wasm4pm::receipt::ReceiptTruthRefusal::PlaceholderEvidenceDetected` (`receipt.rs:33`) — closed-set intrusion detection, applied to live activities instead of receipt fields.

### 6.5 `ten_agent_hourly_cycle_v1` — bound to `GALL-CHECKPOINT-CYCLE-010`

Doctrine: the cron-driven 10-agent hourly cycle (cf. project memory `concurrent-author-cron-loop`). Up to 10 parallel agent episodes per hour, each a full living-loop; the cycle is ALIVE only when ≥1 episode reached `ReceiptEmitted` and no episode leaked across the hour boundary. Loop is the *batch* (re-fire each hour, bounded).

```jsonc
{
  "schema_version": "1.0.0", "model_id": "ten_agent_hourly_cycle_v1", "model_version": "1.0.0",
  "geometry": { "model_type": "POWL", "ref": "ten_agent_hourly_cycle_v1.powl.json" },
  "activity_key": "activity",
  "window_scope_attr": "cycle_id",
  "allowed_events": ["CycleOpened","DiagnosticRaised","RouteSelected","RepairApplied","GatePassed","ReceiptEmitted","CycleClosed"],
  "required_events": ["CycleOpened","CycleClosed"],
  "partial_order": [["CycleOpened","DiagnosticRaised"],["GatePassed","ReceiptEmitted"],["ReceiptEmitted","CycleClosed"]],
  "permitted_loops": [
    { "back_edge": ["ReceiptEmitted","DiagnosticRaised"], "max_iterations": 10,
      "guard_attr": "agent_index", "guard_value": "<10" }
  ],
  "refusal_transitions": [
    { "code": "GALL-ORACLE-CYC01", "when_event": "DiagnosticRaised", "forbidden_unless_seen": ["CycleOpened"],
      "severity": "Deny", "message": "Agent episode started outside an opened cycle" },
    { "code": "GALL-ORACLE-CYC02", "when_event": "DiagnosticRaised", "forbidden_after_count": { "event": "DiagnosticRaised", "max": 10 },
      "severity": "Deny", "message": "More than 10 agent episodes in one hourly cycle" },
    { "code": "GALL-ORACLE-CYC03", "when_event": "CycleClosed", "forbidden_unless_seen": ["ReceiptEmitted"],
      "severity": "Warning", "message": "Cycle closed with zero clearing episodes" }
  ],
  "terminal_states": [ { "name": "CYCLE_ALIVE", "requires_all_seen": ["CycleOpened","ReceiptEmitted","CycleClosed"], "and_last_event": "CycleClosed" } ],
  "binds_checkpoints": ["GALL-CHECKPOINT-CYCLE-010"], "doctrine_ref": "10-agent hourly cron cycle"
}
```

### 6.6 `receipt_order_barrier_v1` — bound to `GALL-CHECKPOINT-RCPT-001`

Doctrine (capability #9): the strictest single law — `ReceiptEmitted` MUST have causal predecessors and MUST be last. This is the registry's expression of the receipt-causality barrier; the conformance engine + `validate_ocel_object_lifecycles` (`ocel_io.rs:178`) enforce it on the trace.

```jsonc
{
  "schema_version": "1.0.0", "model_id": "receipt_order_barrier_v1", "model_version": "1.0.0",
  "geometry": { "model_type": "PNML", "ref": "receipt_order_barrier_v1.pnml" },
  "activity_key": "activity",
  "allowed_events": ["GatePassed","ReceiptEmitted"],
  "required_events": ["GatePassed","ReceiptEmitted"],
  "partial_order": [["GatePassed","ReceiptEmitted"]],
  "refusal_transitions": [
    { "code": "GALL-ORACLE-BAR01", "when_event": "ReceiptEmitted", "forbidden_unless_seen": ["GatePassed"],
      "severity": "Deny", "message": "ReceiptEmitted before GatePassed (causality barrier violated)" },
    { "code": "GALL-ORACLE-BAR02", "when_event": "*", "forbidden_after_event": "ReceiptEmitted",
      "severity": "Deny", "message": "Activity occurred after ReceiptEmitted (receipt must be terminal)" }
  ],
  "terminal_states": [ { "name": "RECEIPTED", "requires_all_seen": ["GatePassed","ReceiptEmitted"], "and_last_event": "ReceiptEmitted" } ],
  "non_completable_if": [ { "code": "GALL-ORACLE-BARDEAD", "condition": "ReceiptEmitted seen AND GatePassed not seen" } ],
  "object_types": { "Receipt": { "created_by": ["ReceiptEmitted"], "cardinality": "1" } },
  "binds_checkpoints": ["GALL-CHECKPOINT-RCPT-001"], "doctrine_ref": "GGEN-NEEDS §3.1 receipt ordering"
}
```

### 6.7 Binding table (B1) summary

| Checkpoint id | bound model_id | doctrine |
|---|---|---|
| `GALL-CHECKPOINT-001C` | `living_diagnostic_clear_v1` | full 6-link living loop |
| `GALL-CHECKPOINT-001B` | `residual_preservation_v1` | residual must be re-observed |
| `GALL-CHECKPOINT-LEAK-001` | `checkpoint_leakage_guard_v1` | no cross-checkpoint window leak |
| `GALL-CHECKPOINT-ANDON-001` | `andon_foreign_surface_v1` | closed allowed-event surface |
| `GALL-CHECKPOINT-CYCLE-010` | `ten_agent_hourly_cycle_v1` | ≤10 episodes/hour, bounded |
| `GALL-CHECKPOINT-RCPT-001` | `receipt_order_barrier_v1` | ReceiptEmitted last + caused |

---

## 7. Acceptance criteria (verifiable by wasm4pm builders)

1. **Registry extension compiles & existing tests green.** `CheckpointModelDescriptor` + `bind_checkpoint`/`resolve_checkpoint`/`load_model_dir` added to `model_registry.rs`; the existing `#[test] test_living_diagnostic_clear_v1_validation` (`model_registry.rs:682`), `test_lru_eviction`, `test_ttl_expiration`, `test_variant_routing` still pass.
2. **Reconciled PNML still validates.** The §6.1 reconciled `living_diagnostic_clear_v1.pnml` parses via `pnml_io::from_pnml` and passes `validate_workflow_net` (assert via a test analogous to `model_registry.rs:682`). Its transition labels are exactly the 6-link set (`RepairSuggested`+`RepairApplied`, no `t_ALIVE`).
3. **All six descriptors register.** `load_model_dir(fixtures/models)` registers 6 envelopes and binds 6 checkpoints; each descriptor passes `wpm model validate … --format json` with `verdict:"Admitted"`, exit 0.
4. **Binding is deterministic.** `wpm model show GALL-CHECKPOINT-001C --format json` returns `subject.model_id == "living_diagnostic_clear_v1"` on repeated calls.
5. **Invalid model refused with non-zero exit.** A descriptor with a cyclic `partial_order` or a `required_event` absent from `allowed_events`, or an unreachable terminal state, makes `wpm model validate` emit `verdict:"Refused"` + a `Deny` finding and exit non-zero (mirrors `receipt.rs:186`).
6. **Closed-set refusal fires.** `andon_foreign_surface_v1`: a descriptor whose `allowed_events` omits an activity present elsewhere yields `GALL-ORACLE-FOR01` when validated against a probe trace (negative fixture).
7. **JSON envelope is stable & versioned.** Every `wpm model` JSON output carries `report_version`, `verdict ∈ {Admitted,Refused}`, `findings: ReceiptFinding[]`, `subject.model_id` — the §5.1 shape, byte-greppable by ggen (codes `GALL-ORACLE-*`).
8. **CLI tests exist.** `crates/wasm4pm-cli/tests/cli_tests.rs` gains `assert_cmd` tests for `wpm model register|list|show|validate|bind` covering criteria 3–7.
9. **ggen contract honored.** `activity_key == "activity"`; the registry never requires ggen to rename its serialized `activity` field (GGEN-NEEDS §3.1). The 6-link chain remains mineable.
10. **Digest reproducible.** `model_digest` is BLAKE3 (`receipt.rs:164`) over canonical geometry; re-registering an unchanged descriptor yields the same digest.

---

## 8. Dependencies on sibling specs & open questions

**Depends on / hands off to:**
- **`ocel-core` spec** — the descriptor's `activity_key`/`object_types` must agree with the carved OCEL types; `allowed_events` are the event-type names ggen declares.
- **Spec 03 (conformance / prefix-completability)** — *consumes* the descriptor: turns `partial_order`→precedence checks, `refusal_transitions`→live STOP findings, `terminal_states`/`non_completable_if`→prefix-completability. The registry only *stores & statically validates* the law; spec 03 *enforces* it on a trace. The `window_scope_attr`/`forbidden_if_window_*` fields (§6.3, §6.5) are declarations spec 03 must implement.
- **Spec 04 (object causality)** — consumes `object_types` lifecycle; pairs with `validate_ocel_object_lifecycles` (`ocel_io.rs:178`).
- **Spec 05 (receipt)** — consumes `model_digest` + the `Receipt` object lifecycle in `receipt_order_barrier_v1`; reuses `compute_blake3_hash` (`receipt.rs:164`).
- **`wpm mining conformance` wire-up (00-MAP rec #5)** — must accept a `model_id` and load it from this registry instead of `DFG::new()` (`mining.rs:75`).

**Open questions for the wasm4pm builders:**
1. **Persistence.** The registry is in-memory + `include_str!` (`model_registry.rs:194`). Is `load_model_dir` enough, or does `wpm model bind` need on-disk persistence (a `models.lock`-style file) so bindings survive process restarts between ggen calls? (Affects acceptance #4.)
2. **POWL geometry for the five new models.** §6.2–6.5 declare `model_type:"POWL"` with a `*.powl.json` `ChoiceGraph` (per `routes/agent-proof-lifecycle.powl.json`). The `register_model` POWL path is `#[cfg(feature="powl")]` (`model_registry.rs:373`). Should the oracle CLI always enable `powl`, or should these five be authored as PNML for uniform validation via `validate_workflow_net`?
3. **Descriptor schema versioning vs. model versioning.** Two version fields (`schema_version`, `model_version`). Confirm `validate_semver` (`:218`) is applied to both, and which one gates `wpm`'s `propagate_version`.
4. **Loop semantics scope.** `permitted_loops` (e.g. the 10-agent batch, §6.5) — does the registry validate loop-edge reachability statically, or is loop enforcement entirely spec 03's runtime concern? (Affects what `wpm model validate` must check.)
5. **`ALIVE` as marking vs. activity (B6).** This spec mandates `ALIVE`/terminal-state-not-activity and a two-transition repair. Confirm with ggen's Gall-checkpoint proof tests (`crates/ggen-lsp/tests/ggen_tpl_001_*`) before the coordinated fixture+assertion change lands.

---

*This document is the single file written for this capability area. No Rust source, Cargo.toml, or existing fixture was modified.*
