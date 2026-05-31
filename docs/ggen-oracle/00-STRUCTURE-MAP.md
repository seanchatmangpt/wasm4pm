# 00 — wasm4pm Structure Map (for the ggen Oracle spec)

**Status:** Survey artifact. Ground truth for all sibling specs in `docs/ggen-oracle/`.
**Date:** 2026-05-30
**Authored by:** Survey agent. Every claim below is cited to a real file/line read from
`/Users/sac/wasm4pm`. Where a capability does **not** exist, it is marked **TO BE BUILT**.
**Version train:** workspace is `26.5.29` (`/Users/sac/wasm4pm/Cargo.toml` line 7). Note:
the `wasm4pm` and `wasm4pm-algos` crates are pinned by **path** in `wasm4pm-cli/Cargo.toml`
with a `26.5.28` version string — version-string drift already exists in-tree and any new
crate must use `version.workspace = true` to avoid it.

> **The leap this map enables:** wasm4pm today is a judge of process *history* (discover a
> model, replay a finished log, audit a finished receipt). The ggen oracle needs a judge of
> process *possibility* — STOP mid-trace. Almost none of that "online / prefix / negative /
> causal-ordering Andon" surface exists yet. This map separates the ~5 things that exist from
> the ~7 that must be built, so the spec authors do not hallucinate capabilities.

---

## 1. Crate map (9 workspace members + roles)

From `/Users/sac/wasm4pm/Cargo.toml` line 4. These are the only crates that compile.

| Crate | Path | Role (cited) | Relevance to ggen oracle |
|---|---|---|---|
| `wasm4pm` | `wasm4pm/` | **The engine.** `crate-type = ["cdylib","rlib"]` (Cargo.toml line ~33); ~120 `pub mod`s in `wasm4pm/src/lib.rs` incl. `receipt`, `oc_conformance`, `ocel_io`, `ocel_flatten`, `oc_petri_net`, `streaming_conformance`, `prediction*`, `transition_system`, `discovery`, `conformance`. Most are `#[wasm_bindgen]` JS shims; the inner `*_inner` fns are pure Rust. | Holds the richest PM surface AND the OCEL `ReceiptDoctor`. But it depends on `wasm-bindgen` — **not** linkable by ggen. Oracle logic should be reachable from `wpm` CLI, or refactored into a pure crate. |
| `wasm4pm-types` | `crates/wasm4pm-types/` | "Canonical types that all functions pass around" (`lib.rs` line 2): `EventLog`/`Trace`/`Event` (XES model), **OCEL 2.0** (`ocel.rs`), `DFG`/`PetriNet`/`DeclareModel` (`models.rs`), `ConformanceResult`/`TokenReplayResult` (`conformance.rs`), import (`import/`). | **This is where `ocel-core` is carved from** (GGEN-NEEDS §2). Source of the OCEL 2.0 type contract for the shared crate. |
| `wasm4pm-algos` | `crates/wasm4pm-algos/` | "Branchless algorithm implementations" (`lib.rs` line 2): `dfg`, `alpha`, `heuristic`, `streaming`, `columnar`, `conformance`, `truex`. Re-exports `wasm4pm_types` (`lib.rs` line 18). | Pure Rust, no wasm-bindgen — **this is the link-safe home** for any oracle logic ggen might one day link, and the home of the canonical conformance fns named in GGEN-NEEDS. |
| `wasm4pm-cli` | `crates/wasm4pm-cli/` | Binary `wpm` (`Cargo.toml` `[[bin]] name = "wpm"`). Command tree in `src/main.rs`. | **The external-oracle boundary** (GGEN-NEEDS §5). All ggen↔wasm4pm adjudication crosses here via subprocess + JSON. |
| `wasm4pm-utils` | `crates/wasm4pm-utils/` | Shared utilities. | Incidental. |
| `wasm4pm-cognition` | `crates/wasm4pm-cognition/` | RL / cognition agents (optional dep of `wasm4pm`, feature-gated). | Out of scope. |
| `wasm4pm-macros` | `crates/wasm4pm-macros/` | Proc-macros. | Incidental. |
| `prolog8` | `crates/prolog8/` | Prolog-style engine. | Out of scope (possible future rule surface for causal laws). |
| `miniml-core` (pkg `miniml`) | `crates/miniml-core/` | ML primitives. | Out of scope. |
| `tps-metrics` | `tps-metrics/` | Metrics workspace member. | Out of scope. |

**Dependency direction:** `wasm4pm-types` (leaf) ← `wasm4pm-algos` ← `wasm4pm` ← `wasm4pm-cli`.
`ocel-core` must become a new leaf *below* `wasm4pm-types`.

---

## 2. The OCEL type situation — THREE incompatible shapes (critical)

This is the single most important finding for the spec authors. **There is not one OCEL type
in wasm4pm; there are three, and ggen has a fourth.** Any spec that says "OCEL 2.0" must say
*which* of these.

### 2.A — Canonical OCEL 2.0 (`crates/wasm4pm-types/src/ocel.rs`) — the GGEN-NEEDS §2 target

The clean, standard, serde-typed model. This is what `ocel-core` is carved from.

```rust
// crates/wasm4pm-types/src/ocel.rs  (lines 6-85, verbatim shape)
pub struct OCEL {
    #[serde(rename = "eventTypes")] pub event_types: Vec<OCELType>,
    #[serde(rename = "objectTypes")] pub object_types: Vec<OCELType>,
    #[serde(default)] pub events: Vec<OCELEvent>,
    #[serde(default)] pub objects: Vec<OCELObject>,
}
pub struct OCELType { pub name: String, #[serde(default)] pub attributes: Vec<OCELTypeAttribute> }
pub struct OCELTypeAttribute { pub name: String, #[serde(rename="type")] pub value_type: String }
pub struct OCELEvent {
    pub id: String,
    #[serde(rename = "type")] pub event_type: String,
    pub time: DateTime<FixedOffset>,                 // <-- typed time
    #[serde(default)] pub attributes: Vec<OCELEventAttribute>,
    #[serde(default)] pub relationships: Vec<OCELRelationship>,  // <-- normalized refs
}
pub struct OCELRelationship { #[serde(rename="objectId")] pub object_id: String, pub qualifier: String }
pub struct OCELObject {
    pub id: String, #[serde(rename="type")] pub object_type: String,
    #[serde(default)] pub attributes: Vec<OCELObjectAttribute>,
    #[serde(default)] pub relationships: Vec<OCELRelationship>,
}
pub struct OCELObjectAttribute { pub name: String, pub value: OCELAttributeValue, pub time: DateTime<FixedOffset> }
#[serde(untagged)]
pub enum OCELAttributeValue { Integer(i64), Float(f64), Boolean(bool), Time(DateTime<FixedOffset>), String(String), #[default] Null }
```

- Re-exported from `wasm4pm-types/src/lib.rs` line 32: `pub use ocel::{OCELEvent, OCELObject, OCEL};`
  (note: `OCELType`, `OCELRelationship`, `OCELAttributeValue` are **not** in the convenience
  re-export — `ocel-core` carving must re-export the full set so call sites don't break).
- **Coupling to fix for `ocel-core`:** `ocel.rs` line 4 imports `crate::event_log::AttributeValue`
  and provides bidirectional `From` impls (lines 101-128). `event_log::AttributeValue`
  (`crates/wasm4pm-types/src/event_log.rs` lines 6-18) is the XES model and pulls `uuid`.
  GGEN-NEEDS §2 flagged this exactly. The `From<AttributeValue>` / `From<OCELAttributeValue>`
  impls must move out of `ocel-core` (e.g. stay in `wasm4pm-types`) so `ocel-core` keeps only
  `serde`/`serde_json`/`chrono`.

### 2.B — Legacy WASM OCEL (`wasm4pm/src/models.rs`) — used by the engine's `oc_*`/`ocel_*` fns

A **different, untyped** OCEL used internally by the engine. **All of the object-centric
analytics fns in §4 operate on THIS type, not 2.A.**

```rust
// wasm4pm/src/models.rs  (lines ~642-727, cited shape)
pub struct OCEL {
    pub event_types: Vec<String>,            // <-- bare strings, no OCELType
    /* object_types */                       // Vec<String>
    pub events: Vec<OCELEvent>,
    pub objects: Vec<OCELObject>,
    pub object_relations: Vec<OCELObjectRelation>,
}
pub struct OCELEvent {
    pub id: String, pub event_type: String,
    pub timestamp: String,                   // <-- STRING, not DateTime
    pub object_ids: Vec<String>,             // <-- flat id list
    pub object_refs: Vec<OCELEventObjectRef>,// + qualified refs
    /* attributes: HashMap-ish */
}
pub struct OCELObject { pub id, pub object_type, pub changes: Vec<OCELObjectAttributeChange>, /* embedded_relations */ }
```

This type carries an `all_object_ids()` helper (used by `validate_ocel_object_lifecycles`,
`wasm4pm/src/ocel_io.rs` line 209) and an attribute-change history (`changes`) the canonical
2.A type lacks. **Implication for the oracle:** the lifecycle/causality checks (the closest
thing to "judge of possibility" that exists, §4) live on 2.B and would need adapting to 2.A
or to the streamed ggen log.

### 2.C — On-disk fixture JSON (OCEL 1.0-ish) — what `fixtures/real/*/expected-ocel.json` actually contains

`fixtures/real/trace-conform-agent-proof-lifecycle/expected-ocel.json` uses a **third** wire
shape that matches *neither* Rust type:

```json
{ "ocel_version": "2.0",
  "ocel_events": [ { "event_id":"e0", "activity":"collect_evidence",
                     "timestamp":"...Z", "objects":[{"id":"...","type":"SourceFile"}],
                     "attributes":{"frame_index":0,"file":"..."} } ],
  "ocel_objects": [ { "id":"...","type":"SourceFile","attributes":{} } ] }
```

Note `activity` (not `type`), `event_id` (not `id`), inline `objects` with `type` (not
`relationships`/`objectId`). **This is structurally the same family as ggen's current
`OcelEvent { activity, objects: Vec<OcelObjectRef{id,type,qualifier}> }`** (GGEN-NEEDS §8) —
so ggen's "lossy subset" already matches wasm4pm's own fixtures, NOT wasm4pm's canonical
types. The agent that builds the NDJSON importer (§4 of GGEN-NEEDS) must reconcile this.

### 2.D — ggen's emitted shape (reference, from GGEN-NEEDS §8)

`activity`, inline `objects`, `timestamp: DateTime<Utc>`, `attributes: HashMap<String,String>`.
Closest to 2.C. **Furthest from 2.A** (the migration target).

> **Spec-author takeaway:** the migration contract in GGEN-NEEDS §3 maps **2.D → 2.A**. The
> serialized-name constraint (GGEN-NEEDS §3.1, ggen greps `"activity":"DiagnosticRaised"`)
> collides with 2.A's `#[serde(rename="type")]`. wasm4pm fixtures (2.C) keep `activity`, which
> means an `activity` serde alias on `OCELEvent` is *consistent with wasm4pm's own corpus* and
> is the lowest-risk reconciliation. Recommend the type-mapping spec adopt a serde alias rather
> than force ggen to rename and rewrite its proof assertions.

---

## 3. Import / IO surface (what exists vs. the NDJSON gap)

| Capability | Status | Citation |
|---|---|---|
| Whole-document OCEL 2.0 JSON → `OCEL` (2.A) | **EXISTS** | `crates/wasm4pm-types/src/import/ocel/mod_ocel.rs`: `import_ocel_json(&str) -> Result<OCEL, serde_json::Error>` (line 4), `import_ocel_json_slice(&[u8]) -> ...` (line 8). Thin `serde_json::from_str/slice`. Gated `#[cfg(feature="import")]` (`import/mod.rs`). |
| XES import | **EXISTS** | `import/xes/{import_xes,stream_xes}.rs`; engine-side `wasm4pm::xes_format::load_eventlog_from_xes` (used by `autoprocess.rs` line 8, `audit.rs` line 9). |
| Engine OCEL load/validate/export (2.B) | **EXISTS** | `wasm4pm/src/ocel_io.rs`: `load_ocel2_from_json` (line 33), `export_ocel2_to_json` (line 48), `validate_ocel` (line 65) — all `#[wasm_bindgen]`, return `JsValue`. |
| **NDJSON / append-only event-stream reader** (GGEN-NEEDS §4a: `import_ocel_ndjson(reader) -> OCEL`, tolerate truncated last line, synthesize type decls) | **TO BE BUILT** | No `ndjson`/`jsonl`/line-delimited reader exists anywhere under `import/` or `ocel_io.rs`. This is the single biggest IO gap. |
| Shared `ocel-core` serializer ggen emits through (GGEN-NEEDS §4b alt) | **TO BE BUILT** | `ocel-core` does not exist yet. |

---

## 4. Discovery + conformance API surface (exact signatures)

### 4.1 `wasm4pm-algos` (pure Rust — link-safe, named in GGEN-NEEDS)

All take the **XES `EventLog`** (2.x types from `event_log.rs`), keyed by `activity_key`
(`"concept:name"` is the convention everywhere). **None of these operate on OCEL directly** —
they need a flattened log.

```rust
// crates/wasm4pm-algos/src/dfg.rs:12
pub fn discover_dfg(log: &EventLog, activity_key: &str) -> Result<DFG>
// crates/wasm4pm-algos/src/heuristic.rs:11
pub fn discover_heuristic(log: &EventLog, activity_key: &str) -> Result<DFG>
// crates/wasm4pm-algos/src/streaming.rs:10  (note: this is a DFG miner, NOT online conformance)
pub fn discover_streaming_dfg(log: &EventLog, activity_key: &str) -> Result<DFG>
// crates/wasm4pm-algos/src/alpha.rs:11
pub fn discover_alpha(log: &EventLog, activity_key: &str) -> Result<PetriNet>

// crates/wasm4pm-algos/src/conformance.rs:13  (the two GGEN-NEEDS §1 names)
pub fn check_conformance_token_replay(log: &EventLog, model: &DFG,     activity_key: &str) -> Result<ConformanceResult>
pub fn check_conformance_alignment  (log: &EventLog, model: &PetriNet, activity_key: &str) -> Result<ConformanceResult>
// + pub struct AlignmentStep { log_activity, model_activity, cost }  (conformance.rs:140)
// + pub struct TraceAlignment { steps, total_cost }                  (conformance.rs:151)
```

`ConformanceResult` (`crates/wasm4pm-types/src/conformance.rs:62`) is **serde-serializable**:
`{ fitness: f64, precision: Option<f64>, generalization, simplicity, total_traces,
fitting_traces, deviating_traces }` + `conformance_rate()`. `TokenReplayResult` similarly
serde-serializable (line 4). **These are the JSON report payloads the oracle should emit.**

> The "60 algos" framing in GGEN-NEEDS is aspirational against `wasm4pm-algos` — that crate has
> exactly **4 discovery fns + 2 conformance fns + truex**. The large algorithm zoo lives in the
> `wasm4pm` engine crate (§4.2), not in `wasm4pm-algos`.

### 4.2 `wasm4pm` engine — object-centric + online + predictive surface (mostly `JsValue`)

These are the richest and most oracle-relevant, but nearly all are `#[wasm_bindgen]` returning
`JsValue` — **not directly callable from a Rust subprocess oracle without a pure-Rust seam.**

| Fn / type | Signature (cited) | Oracle relevance |
|---|---|---|
| `oc_conformance_check_inner` | `wasm4pm/src/oc_conformance.rs:26` `(ocel: &OCEL /*2.B*/) -> Result<serde_json::Value, String>` | **Pure-Rust, returns JSON.** Per-object-type fitness over OCEL. The closest existing thing to an OCEL conformance oracle. Inner fn is callable; the `#[wasm_bindgen]` wrapper at line 131 is not. |
| `validate_ocel_object_lifecycles` | `wasm4pm/src/ocel_io.rs:178` `(ocel: &OCEL /*2.B*/) -> Vec<LifecycleViolation>` | **Pure Rust.** Detects "event B for an object has earlier timestamp but appears later" — i.e. **temporal-order violation per object**. This is the seed of "receipt causality / out-of-order" Andon. `LifecycleViolation{object_id, event_a_id, event_b_id, timestamp_a_ms, timestamp_b_ms}` (line 164). |
| `flatten_ocel_to_eventlog_for_type` | `wasm4pm/src/oc_petri_net.rs:102` | OCEL(2.B) → per-type `EventLog`, the bridge that lets §4.1 conformance run on object-centric logs. |
| `discover_oc_petri_net` | `wasm4pm/src/oc_petri_net.rs:31` (JsValue) | OC Petri-net discovery. |
| `measure_flattening_loss` | `wasm4pm/src/ocel_flatten.rs:236` `(ocel:&OCEL, object_type:&str) -> FlatteningLossReport` | Pure Rust; quantifies info lost flattening — useful for object-causality metrics. |
| `streaming_conformance_*` | `wasm4pm/src/streaming_conformance.rs` lines 32/50/80/111/145: `begin/add_event/close_trace/stats/finalize` (all JsValue, keyed on a `dfg_handle`) | **The only online/incremental conformance primitive that exists.** Stateful, event-at-a-time against a DFG. This is the backbone the "STOP mid-trace" oracle should wrap — but it is DFG-replay fitness, **not** prefix-completability or forbidden-variant detection. |
| `predict_next_k` / `predict_beam_paths` | `wasm4pm/src/prediction_next_activity.rs:45/92` (JsValue, takes `prefix_json`) | Next-activity prediction from a prefix — **the only prefix-aware surface**. Predicts likely continuations; does NOT answer "is this prefix still completable to ALIVE / a terminal state". |
| `discover_transition_system` | `wasm4pm/src/transition_system.rs:85` (+ `_from_handle` line 204); `TSState`/`TSTransition`/`TransitionSystem` (lines 34/43/56) | A reachability/state model — **the most promising existing substrate for prefix-completability** (does a reachable terminal state exist from the prefix-induced state?). No completability query exists on it yet. |
| `play_petri_net` / `petri_net_playout` | `wasm4pm/src/petri_net_playout.rs:41/222`; `PlayoutConfig`/`PlayoutResult` (lines 15/33) | Generates traces a model *can* produce — the dual of prefix-completability; could seed a "is prefix in the playout language" check. |
| `conformance_guards::guard_*` | `wasm4pm/src/conformance_guards.rs` lines 15/31/49/60/74/87 | Numeric safety guards (empty log, fitness bounds, zero-denominator), **not** semantic-ordering guards. |
| `DeclareModel` / `DeclareConstraint` | `crates/wasm4pm-types/src/models.rs:555/573` | Declarative-constraint *types* exist; **no Declare conformance checker** found. A natural home for ggen's 6-link ordering law (`ReceiptEmitted` must follow `GatePassed`) as Declare `precedence`/`response` constraints — **TO BE BUILT**. |

### 4.3 The receipt judge — `wasm4pm::receipt` (the existing "judge of possibility" analog)

`wasm4pm/src/receipt.rs` (2122 lines) is a **fully built adversarial receipt oracle**. It is
the conceptual nearest neighbor to the Andon oracle ggen wants, applied to *receipt envelopes*
rather than *live traces*.

```rust
// wasm4pm/src/receipt.rs  (public surface, cited line numbers)
pub enum ReceiptTruthRefusal { /* ObservedOCELMissing, ExpectedOCELMissing,
  PlaceholderEvidenceDetected, ExpectedObservedCloneDetected, BoundaryEvidenceMissing,
  ClosureOverclaimed, ChallengeNonceMismatch/Missing, ObservedTraceNotChallengeBound,
  ProofClassOverclaimed, ... */ }                                           // :33
pub enum FindingSeverity { Deny, Warning }                                  // :56
pub struct ReceiptFinding { code, severity, json_path, message }            // :63
pub enum VerificationState { Admitted, Refused }                            // :92
pub enum RefusalClass / AllowedNextAction { .. }                            // :98 / :113
pub struct ReceiptDoctor; impl: audit(&Value) -> ReceiptDoctorReport (:939)
                              verify_with_audience(&Value, DiagnosticAudience) (:989)
pub struct OCELReceiptLinter { lint(&Value) -> Vec<ReceiptFinding> }        // :284
pub struct ExpectedObservedCloneDetector::check                            // :510
pub struct BoundaryEvidenceVerifier::verify                                // :648
pub struct ClosureOverclaimDetector::detect                                // :726
pub struct CanonicalHashVerifier::verify                                   // :818
pub struct ChallengeNonceVerifier::verify                                   // :2044
pub fn compute_blake3_hash(&str)->String / compute_sha256_hash(&str)       // :164 / :168
```

These take/return `serde_json::Value` and `Vec<ReceiptFinding>` — **pure Rust, no wasm-bindgen**
— and are already wired to the `wpm receipt` CLI (§5). The Andon-oracle spec should mirror this
*refusal-finding* pattern: a stable `enum` of refusal codes + `{code, severity, json_path,
message}` findings + an `Admitted/Refused` verdict. **But these inspect a finished receipt
envelope; none of them watch a live OCEL trace or reason about future events.**

### 4.4 truex canonicalization (deterministic OCEL hashing — exists)

```rust
// crates/wasm4pm-algos/src/truex/canonicalize.rs:3
pub fn canonical_stringify(value: &Value) -> String     // JCS-OCEL canonical form
// crates/wasm4pm-algos/src/truex/verify.rs:18
pub fn verify_receipt(envelope: &Value) -> (VerificationResult, String, String)
```

Rules documented in `docs/truex-ocel2-canonical-profile.md` (timestamp→UTC `Z`, lexicographic
key sort, deterministic array order by `id`, whitespace strip). **This is the canonical-hash
substrate for receipt causality / replayability.** ggen already BLAKE3-derives `event_id` and
`receipt_id` (GGEN-NEEDS §3.1); aligning ggen's hashing to `canonical_stringify` would make
ggen receipts truex-verifiable.

---

## 5. The `wpm` CLI command tree + report formats (the external-oracle boundary)

Binary `wpm`, parsed in `crates/wasm4pm-cli/src/main.rs` (clap derive, `propagate_version`).

```
wpm [--verbose]
├── doctor                          health check
├── wizard                          interactive setup (TTY; #[ignore]d in tests)
├── telco <subcommand>              router status / nanosecond arch
├── mining                          ── PRIMARY ORACLE SURFACE ──
│   ├── discover <input> [-a algo=heuristic] [-k activity_key=concept:name]
│   └── conformance <log> <model>  [-k activity_key]
├── config <subcommand>            CLI config
├── autoprocess <input> [-k key] [--config <json>] [-f format=human|json]
├── agent {list|status|switch <i>|reset}
├── spc <subcommand>               statistical process control
├── audit <input> [-k key]         Vision-2030 conformance audit (SIMD token replay)
├── man                            emit markdown CLI reference
├── receipt <subcommand>           ── RECEIPT JUDGE SURFACE ──
│   ├── doctor <file> [--strict] [-f human|json] [-a producer|operator|ci]
│   ├── verify-ocel2 <file>
│   ├── detect-fixture-mutation <file>
│   ├── verify-boundary-evidence <file>
│   ├── verify-proof-class <file>
│   ├── verify-challenge <file>
│   ├── canonicalize-ocel2 <file>
│   ├── producer-safe-report <file>
│   ├── operator-private-report <file>
│   └── truthforge <file>          adversarial mutator matrix
└── lean <subcommand>              Lean Six Sigma waste audit
```

(Subcommand args cited from `commands/{mining,receipt,agent,autoprocess,audit}.rs` and `main.rs`.)

### Report formats — machine-readable JSON status

| Command | JSON output? | Citation / caveat |
|---|---|---|
| `wpm receipt doctor` | **YES** | `commands/receipt.rs:140` `if args.format=="json"` → `serde_json::to_string_pretty(&report.producer_safe / .operator_private)`. Default is `human`. Exit non-zero on refusal (line 186). **This is the model the oracle should copy.** |
| `wpm receipt producer-safe-report` / `operator-private-report` | **YES** | Force `format="json"` internally (`receipt.rs:347/357`). |
| `wpm receipt canonicalize-ocel2` | **partial** | Prints canonical JSON to stdout (`receipt.rs:324`), text framing. |
| `wpm autoprocess` | **YES** | `commands/autoprocess.rs:35` `if format=="json"` → `to_string_pretty`. |
| `wpm mining conformance` | **NO (and stubbed)** | `commands/mining.rs:74-92`: prints a `Table` (Fitness/Precision) only; no `--format`. **And the model is mocked**: `let dfg = DFG::new();` (line 75, comment "Mock model load for now") — it never loads the `<model>` arg. So `wpm mining conformance` is **TO BE BUILT** as a real, JSON-emitting oracle. |
| `wpm mining discover` | **NO** | `mining.rs:56-62`: prints a DFG `Table`; only `heuristic` algo wired, `inductive` bails (`anyhow::bail!`). No JSON. |
| `wpm audit` | text table | `commands/audit.rs`: parses internal `simd_token_replay` JSON but renders a table. |

**Output plumbing:** `wasm4pm-cli/src/io.rs` provides `Io` (colored `header/success/error/warning/info`,
verbose-gated) + a `Table` printer (lines 68-124). There is **no shared JSON-envelope helper** —
each command rolls its own `to_string_pretty`. The oracle spec should define **one stable JSON
report envelope** (schema + version field) and a `--format json` convention, because the two
existing JSON emitters (`receipt`, `autoprocess`) use ad-hoc shapes.

### Error/exit convention
`main.rs` → `try_main() -> anyhow::Result<()>`; on `Err`, `e.die()` (`wasm4pm_cli::errors::Report`).
Refusals propagate as `anyhow::bail!`/`Err` → non-zero exit (e.g. `receipt.rs:187`,
`mining.rs` discover unsupported-algo). **ggen's Chicago-TDD subprocess oracle can rely on
exit-code + stdout-JSON** — but only `receipt`/`autoprocess` honor that today.

---

## 6. Fixture & test conventions

| Convention | Location | Notes |
|---|---|---|
| Rust CLI integration tests | `crates/wasm4pm-cli/tests/cli_tests.rs` | `assert_cmd::Command::cargo_bin("wpm")` + `predicates` on stdout; `tempfile::tempdir`. Chicago-style (real binary). `#[ignore]` for TTY-needing `wizard`. **This is where ggen-oracle CLI tests belong.** |
| Real OCEL/POWL fixtures | `fixtures/real/<scenario>/` | Each scenario dir holds `expected-ocel.json` (shape 2.C), `expected-conform.json`, `model.powl.json`, sometimes `stack.ts.txt`. Two scenarios exist: `trace-conform-accepted`, `trace-conform-agent-proof-lifecycle`. **The agent-proof-lifecycle fixture is a `collect_evidence → verify_evidence → emit_receipt` chain — structurally a sibling of ggen's 6-link living-loop.** Reuse this convention for ggen oracle fixtures. |
| XES corpora | `data/`, `fixtures/real/trace-conform-accepted/*.xes`, `tests/fixtures/BPI_2020_Travel_Permits_Actual.xes` | Standard PM benchmark logs (Sepsis, BPI, DomesticDeclarations, RepairExample). |
| Unit tests | inline `#[cfg(test)] mod tests` in each algo file | e.g. `conformance.rs:397`, `dfg.rs:83`. Real `EventLog`/`PetriNet` construction, no mocks. |
| TS proof harness (legacy/parallel) | `tests/proof/*.proof.ts` (vitest), `tests/archive/` | `ocel.proof.ts`, `receipt.proof.ts`, `release.proof.ts`, `rl.proof.ts`, `spc.proof.ts`. **These are the JS-side proof contracts**; the Rust oracle should not depend on them but should stay assertion-compatible where they overlap (OCEL/receipt). |
| `data/DATASET-SUMMARY.txt` | repo root `data/` neighborhood | Inventory of corpora. |

**A "bad-trace corpus" (impossible/forbidden OCEL logs for negative testing) does NOT exist.**
The only adversarial corpus is *receipt-envelope* mutation, generated at runtime by
`wpm receipt truthforge` (`receipt.rs:367-494`, 4 mutators: challenge-nonce tamper, proof-class
overclaim, mock/placeholder injection, expected-observed clone). There are **no impossible-OCEL
fixtures** (e.g. `ReceiptEmitted` before `GatePassed`, orphan receipt, future-checkpoint leak).
Building that corpus is **TO BE BUILT** (GGEN-NEEDS-derived vision item #12).

---

## 7. Version / dependency conventions

- Workspace version `26.5.29` via `[workspace.package] version` (`Cargo.toml:7`); members use
  `version.workspace = true`. **`ocel-core` must follow this** (publish under `26.5.x` per
  GGEN-NEEDS §2).
- **Drift warning:** `wasm4pm-cli/Cargo.toml` pins `wasm4pm-algos`/`wasm4pm` at `"26.5.28"` by
  path; `wasm4pm/Cargo.toml` pins `wasm4pm-cognition`/`miniml` at `26.5.28`. The workspace is at
  `26.5.29`. New crates should use `version.workspace = true` + path, not a hard-coded string.
- Shared dep versions are centralized in `[workspace.dependencies]` (`Cargo.toml:13-34`): `serde`
  1.0 (derive), `serde_json` 1.0 (**`preserve_order`** — relevant to canonical hashing),
  `chrono` 0.4 (serde), `uuid` 1.16, `blake3` 1.5, `sha2`. **`ocel-core` should take `serde` +
  `serde_json` + `chrono` from the workspace table** to inherit `preserve_order`.
- Release profile: `opt-level="z"`, `lto`, `panic="abort"` (`Cargo.toml:36-41`) — wasm-oriented.
- `import` and `ocel` are **cargo features** (`import/mod.rs` `#[cfg(feature="import")]`;
  `oc_conformance.rs:25` `#[cfg(feature="ocel")]`). The oracle CLI surface must enable the right
  features; `wasm4pm-cli/Cargo.toml` already pulls `wasm4pm` with `features=["cloud"]`.

---

## 8. Exists vs. TO BE BUILT — the 12 capability areas

The vision's capability areas, each judged against real code. **"Exists" means a callable,
cited fn; "Partial" means a substrate exists but not the specific query; "TO BE BUILT" means
nothing in-tree does it.**

| # | Capability (oracle vision) | Status | Evidence / where it would attach |
|---|---|---|---|
| 1 | **Conformance upgrade** (real model-vs-log fitness, JSON report) | **Partial** | Algos exist (`check_conformance_token_replay/alignment`, `conformance.rs:13/163`) and `ConformanceResult` is serde-ready. BUT `wpm mining conformance` is mocked (`mining.rs:75 DFG::new()`) and emits a table, not JSON. Wire the real model load + `--format json` over `ConformanceResult`. |
| 2 | **Discovery vs. declared** (mine actual process, compare to ggen's declared 6-link model) | **Partial** | `discover_dfg/heuristic/alpha` exist; `discover_transition_system` exists. No "compare discovered to a declared reference model + report deviation" fn. Build a declared-model registry (#3) + a diff. |
| 3 | **Checkpoint model registry** (store the canonical model per checkpoint, e.g. Gall 001/001B) | **TO BE BUILT** | No model-registry/persistence surface found (the registries in lib.rs — `algorithm_registry`, `capability_registry` — are about *algorithms*, not *user models*). `DeclareModel` type exists to hold the law. |
| 4 | **Variant governance** (new/forbidden variant detection) | **TO BE BUILT** | No variant-set tracking or allow/deny-list. `discover_dfg` aggregates frequencies but never enumerates per-trace variants. |
| 5 | **Object causality** (cross-object causal consistency) | **Partial** | `validate_ocel_object_lifecycles` (`ocel_io.rs:178`) checks *per-object* temporal order; `measure_flattening_loss` (`ocel_flatten.rs:236`) quantifies cross-type loss. No multi-object *causal-consistency* checker. |
| 6 | **Streaming / online intake** (event-at-a-time) | **Partial (exists, DFG-only)** | `streaming_conformance_{begin,add_event,close_trace,stats,finalize}` (`streaming_conformance.rs`) — stateful, incremental, but DFG-replay-fitness only and `JsValue`-bound. Needs a pure-Rust/CLI seam + semantic-law layer. |
| 7 | **Prefix / negative conformance** (is this PREFIX completable to ALIVE? reject impossible logs) | **TO BE BUILT** | No prefix-completability query. Nearest substrates: `discover_transition_system` (reachability), `predict_next_k` (continuation likelihood), `play_petri_net` (model language). None answers "can this prefix still reach a terminal state". This is the core "judge of possibility" gap. |
| 8 | **Cross-checkpoint leakage** (did checkpoint N+1's event pollute checkpoint N's gate?) | **TO BE BUILT** | No checkpoint/window-scoping concept exists. Requires #3 (checkpoint registry) + event-window partitioning. |
| 9 | **Receipt causality** (does ReceiptEmitted have causal predecessors? ReceiptEmitted-before-GatePassed Andon) | **Partial** | The *pattern* exists for receipt **envelopes** (`ReceiptDoctor`, `ClosureOverclaimDetector`, `ChallengeNonceVerifier`, `receipt.rs`), and `validate_ocel_object_lifecycles` gives raw temporal-order violations. NO checker that enforces the 6-link *activity ordering law* on a live OCEL trace. `DeclareModel` could encode it. |
| 10 | **OCPQ query language** (object-centric process query) | **TO BE BUILT** | No query-language/engine found. `prolog8` is the only rule-engine in the workspace and could host it. |
| 11 | **Manufacturing metrics** (fitness/precision/generalization/simplicity + variants/bottlenecks) | **Partial** | `ConformanceResult` carries all four metric *fields* (`conformance.rs:62`) but only `fitness` is computed; `precision/generalization/simplicity` are `None` (`with_*` setters exist, unused). Bottleneck/variant analytics absent. |
| 12 | **Bad-trace corpus** (impossible OCEL fixtures for negative testing) | **TO BE BUILT** | Only `wpm receipt truthforge` mutates *receipt envelopes* at runtime (`receipt.rs:367`). No impossible-*OCEL* fixtures, no `wpm`-emitted bad-trace generator. |

**Summary:** of 12 areas — **0 fully-exist**, **6 partial** (1,2,5,6,9,11), **6 TO BE BUILT**
(3,4,7,8,10,12). The "judge of possibility" leap (prefix-completability #7, variant governance
#4, cross-checkpoint leakage #8, live receipt-causality ordering #9) is almost entirely greenfield.
The strongest existing assets to build on are: the pure-Rust conformance algos (§4.1), the
`oc_conformance_check_inner` / `validate_ocel_object_lifecycles` OCEL functions (§4.2), the
`ReceiptDoctor` refusal-finding architecture (§4.3 — copy its shape for the Andon verdict),
`discover_transition_system` (§4.2 — substrate for completability), and the truex canonical
hashing (§4.4).

---

## 9. Concrete recommendations for the sibling specs (grounding map)

1. **`ocel-core` carving** → carve from `crates/wasm4pm-types/src/ocel.rs` (shape 2.A, §2.A).
   Leave the `From<event_log::AttributeValue>` impls behind in `wasm4pm-types`. Inherit
   `serde`/`serde_json`(preserve_order)/`chrono` from `[workspace.dependencies]`. Use
   `version.workspace = true`. Re-export the FULL type set (`OCELType`, `OCELRelationship`,
   `OCELAttributeValue` are missing from the current convenience re-export at `lib.rs:32`).

2. **Serialized-name reconciliation** (GGEN-NEEDS §3.1) → add `#[serde(alias = "activity")]`
   on `OCELEvent.event_type` and accept `event_id`/`objects` inline forms. This is consistent
   with wasm4pm's *own* fixtures (shape 2.C, §2.C) and avoids forcing ggen to rewrite its Gall
   proof assertions. Spell this out in the type-mapping spec.

3. **NDJSON importer** (§3, GGEN-NEEDS §4a) → new `import_ocel_ndjson(reader) -> OCEL` beside
   `import_ocel_json` in `crates/wasm4pm-types/src/import/ocel/`; fold one event per line,
   synthesize `eventTypes`/`objectTypes`, tolerate a truncated final line. Feature-gate under
   `import` like its siblings.

4. **The oracle CLI** → add a `wpm oracle <subcommand>` (or extend `wpm mining`) that: (a) reads
   ggen's `.ocel.jsonl`, (b) runs conformance + the new semantic-ordering / prefix checks, (c)
   emits a **single versioned JSON report envelope** with `Admitted/Refused` + `Vec<finding{code,
   severity, json_path, message}>` modeled on `ReceiptDoctor` (§4.3), (d) exits non-zero on
   refusal. Tests go in `crates/wasm4pm-cli/tests/cli_tests.rs` with `assert_cmd` (§6).

5. **First real conformance wire-up** → fix `wpm mining conformance` (`mining.rs:75`) to load the
   real model and emit `ConformanceResult` as JSON — this is the smallest patch that turns a
   mocked table into a real oracle and unblocks GGEN-NEEDS §7 proof obligation #6.

6. **Encode the 6-link law** → represent ggen's `DiagnosticRaised → RouteSelected →
   RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted` as `DeclareModel` precedence
   constraints (`models.rs:555/573`) and build a Declare-conformance checker (none exists) — this
   is the buildable core of capabilities #4, #7, #9.

---

*This map is descriptive only. No Rust source, Cargo.toml, or existing file was modified. The
single file written is this document.*
