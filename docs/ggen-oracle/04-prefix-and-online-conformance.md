# 04 — Prefix / Online / Negative Conformance (the Andon-oracle leap)

**Status:** Capability spec. Ground truth: every cited symbol was read from `/Users/sac/wasm4pm`. Capabilities that do not exist yet are marked **TO BE BUILT**.
**Date:** 2026-05-30
**Version train:** `26.5.x` (workspace `26.5.29`, `/Users/sac/wasm4pm/Cargo.toml:7`). New code uses `version.workspace = true`.
**Depends on:** `00-STRUCTURE-MAP.md` (the survey), `GGEN-NEEDS.md` (ggen's requirements).

---

## 1. Purpose

wasm4pm today judges process **history**: discover a model, replay a *finished* log, audit a *finished* receipt envelope. This spec defines the leap to a judge of process **possibility** — an **Andon oracle** that watches ggen's live append-only OCEL tape and can say **STOP mid-trace** the instant a partial trace becomes *impossible to lawfully complete*.

Two distinct judgments, both **TO BE BUILT**:

1. **Prefix conformance (the static question).** Given a reference model `M` and a *prefix* `σ = ⟨e₁ … eₙ⟩` of events seen so far for one case, is there **still** a lawful continuation `ρ` such that `σ·ρ` reaches a terminal **ALIVE** state of `M`? Three verdicts:
   - **ALIVE** — `σ` is a legal prefix and at least one lawful completion exists. *Keep going.*
   - **DEAD** — no lawful completion exists; `σ` already violated `M`. *STOP THE LINE.*
   - **TERMINAL** — `σ` is itself a complete lawful trace (reached a final marking). *Episode closed lawfully.*

2. **Online incremental conformance (the streaming question).** Tail ggen's `.ggen/ocel/agent-edit-events.ocel.jsonl`, fold one event per line into per-case state, re-evaluate prefix conformance *incrementally* (O(1) amortized per event, not O(n) re-replay), and emit an **early Andon STOP** the moment any open case transitions to **DEAD**.

The high-value target is the **negative** direction: not "this finished trace had fitness 0.94", but "**event 4 of case `item.tera|GGEN-TPL-001|run-7` must not be admitted — `ReceiptEmitted` cannot lawfully follow this prefix because `GatePassed` was never observed.**" That is the andon pull ggen consumes to refuse an agent edit *before* the receipt is written.

---

## 2. The model ggen is judged against: the 6-link living-loop law

ggen emits a fixed activity vocabulary (`crates/ggen-lsp/src/intel/events.rs:14-32`, module `activity`, verbatim string consts):

```
DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted
```

plus two off-happy-path terminals: `GateFailed` (`activity::GATE_FAILED`) and `RefusalEmitted` (`activity::REFUSAL_EMITTED`). The case key is `(file, diagnostic_code, run_id)` — the `episode` object — and `event_id`/`receipt_id` are BLAKE3-derived. The on-disk serialized field is **`"activity"`** (not `"type"`), e.g. `"activity":"DiagnosticRaised"` — load-bearing for ggen's Gall proof greps (`GGEN-NEEDS.md` §3.1). This oracle must consume that wire shape directly (see §7, `--alias activity`).

This 6-link chain is a **strict-precedence / response law**. It is exactly the kind of rule the existing `DeclareModel` type can carry but **no checker enforces yet** (see §4). The reference model is *not discovered* from ggen's own log (that would be circular — the agent could teach the oracle its own violations); it is an **authored** law. §6 defines its serialized form.

---

## 3. What EXISTS to build on vs. what is TO BE BUILT

### 3.1 EXISTS — reusable substrates (cited)

| Asset | Citation | What it gives the Andon oracle | Limitation for *this* spec |
|---|---|---|---|
| `TraceState { Alive, FakeLive, Blocked }` | `wasm4pm/src/models.rs:960-968` (serde `"ALIVE"`/`"FAKE-LIVE"`/`"BLOCKED"`) | **The verdict vocabulary already exists.** ALIVE/DEAD map onto Alive/Blocked; TERMINAL needs distinguishing from in-progress Alive. | No `Dead`/`Terminal` distinction for *prefixes*; `FakeLive` is "ended early but no missing token", which is close to "ALIVE-but-not-yet-terminal". |
| `StreamingConformanceChecker` | `wasm4pm/src/models.rs:1006-1160` | **Incremental, event-at-a-time token replay.** `add_event(case_id, activity)` updates a per-case marking in O(places); `close_trace(case_id)` checks final markings. `open_traces: HashMap<String, OpenTraceState>` already keys by case. | (a) Built from a **PetriNet** (`from_petri_net`, `:1019`), not a Declare/precedence law. (b) Fitness-based — it computes a *score*, it does not answer "can this prefix still reach ALIVE". (c) Once `Blocked`, it keeps eating events (`:1059-1062`) — no early-STOP signal is surfaced. |
| `OpenTraceState` | `wasm4pm/src/models.rs:996-1004` | Per-case `marking`, `produced/consumed/missing_tokens`, `state`. The mutable cursor a streaming reader updates. | Same as above — token-marking, not law-state. |
| `PetriNet` + `FlatIncidenceMatrix` | `crates/wasm4pm-compat/src/models.rs:96` (`final_markings`), `:118-128` (`FlatIncidenceMatrix::get`, `places_count`) | Final markings *exist* — the substrate for "reached a terminal state". | Reachability ("does ANY firing sequence from marking `m` reach a final marking") is **not** queryable — see TO BE BUILT #1. |
| `discover_transition_system` | `wasm4pm/src/transition_system.rs:85-187`; `TransitionSystem { states, transitions, initial_state, final_states }` (`:56-67`) | A **reachability graph**: states, labelled transitions, and an explicit `final_states: HashSet<usize>`. This is the *most direct* substrate for prefix-completability over a small authored law. | It is a *discoverer* from logs, not a *checker* of a prefix; no "from this state, is a final_state reachable" query exists. |
| `ConformanceResult` (algos) | `crates/wasm4pm-algos/src/conformance.rs` + `crates/wasm4pm-compat/src/conformance.rs:63-107` (`fitness`, `precision`, `generalization`, `simplicity`, `total_traces`, `fitting_traces`, `deviating_traces`, `conformance_rate()`) | Serde-ready report payload for the *batch* fitness portion of an oracle report. | Whole-log only; says nothing about prefixes or order-law violations. |
| `ReceiptDoctor` refusal architecture | `wasm4pm/src/receipt.rs:31-134` (`ReceiptTruthRefusal`, `FindingSeverity{Deny,Warning}`, `ReceiptFinding{code,json_path,message,severity}`, `ReceiptDoctorState{Admitted,Refused}`, `ReceiptDoctorReport`) | **The exact report shape to mirror.** A stable refusal-code enum + `{code,severity,json_path,message}` findings + `Admitted/Refused` verdict, already serde + already wired to a CLI. | Inspects a *finished envelope*; never watches a live trace or reasons about future events. Copy the *shape*, not the logic. |
| `validate_ocel_object_lifecycles` | `wasm4pm/src/ocel_io.rs:178` → `Vec<LifecycleViolation{object_id,event_a_id,event_b_id,timestamp_a_ms,timestamp_b_ms}>` (`:164`) | Pure-Rust per-object out-of-order detection — seed for the **temporal-soundness** prefix detectors (D6). | Per-object timestamp order only; no activity-ordering law, no notion of prefix. |
| Existing fixture verdict shape | `fixtures/real/trace-conform-agent-proof-lifecycle/expected-conform.json` (`verdict:"AndonPull"`, `andon_reason:"InsufficientReceiptCoverage"`, `details:[{dimension,ok,detail}]`) | **wasm4pm already speaks "AndonPull".** The oracle report's `verdict`/`reason` vocabulary should align with this existing fixture, not invent a parallel one. | Static, whole-trace verdict; no prefix/early-stop semantics. |

### 3.2 TO BE BUILT (the greenfield)

| # | Capability | Why nothing reusable | Proposed home |
|---|---|---|---|
| 1 | **Prefix-completability query** `can_reach_terminal(state) -> bool` over an authored law | No reachability query exists on `PetriNet` or `TransitionSystem`. This is the core "judge of possibility" primitive. | new `prefix_conformance` module in `wasm4pm-algos` (pure Rust, link-safe) |
| 2 | **Authored ordering-law model** (`OrderingLaw`) compiled to a deterministic automaton with an explicit DEAD sink | `DeclareModel`/`DeclareConstraint` (`models.rs:886-917`) are *types only* — no compiler, no checker. ggen's law is a strict line graph, simpler than full Declare; a purpose-built automaton is buildable and exact. | `wasm4pm-algos::prefix_conformance::OrderingLaw` |
| 3 | **Per-prefix verdict** `PrefixVerdict { Alive, Dead, Terminal }` (+ the offending detector + json_path) | `TraceState` is fitness-derived and lacks `Dead`/`Terminal` prefix semantics. | same module |
| 4 | **Online tape reader** (tail NDJSON, fold per case, emit STOP) | No NDJSON reader anywhere (`00-MAP` §3); `StreamingConformanceChecker` has no early-STOP surface. | `wasm4pm-cli` `wpm oracle` (subprocess oracle); reader logic in `wasm4pm-algos` |
| 5 | **Negative/impossible-prefix detector predicates** (D1–D7, §5) | No semantic-ordering guards exist (`conformance_guards.rs` is numeric only — `00-MAP` §4.2). | same module + the `OrderingLaw` |
| 6 | **Early-STOP signal contract** (machine-readable JSON the moment a case dies) | No such contract; `receipt doctor` emits only on a finished file. | `wpm oracle watch` / `wpm oracle check`, §7 |
| 7 | **Bad-prefix fixture corpus** (impossible `.ocel.jsonl` snippets) | None exist (`00-MAP` §6); only runtime *envelope* mutation via `wpm receipt truthforge`. | `fixtures/real/ggen-oracle-bad-prefix/` |

**Also fix (pre-existing latent bug, blocks reuse of streaming as-is):** `wasm4pm/src/streaming_conformance.rs:35` calls `StreamingConformanceChecker::from_dfg(dfg)`, but **no `from_dfg` method exists** on that type — only `from_petri_net` (`models.rs:1019`). The DFG→checker bridge is broken today. The Andon oracle does **not** depend on the WASM streaming bridge (it uses the pure `OrderingLaw` path), so this need not be fixed for this spec — but flag it so builders do not mistake the WASM streaming path for working incremental conformance.

---

## 4. Why an authored automaton, not token replay or Declare-mining

The 6-link law is a **strict line graph with two early-exit sinks**. Modelling it as a free-choice PetriNet and using `StreamingConformanceChecker` would give *fitness scores*, but fitness ≠ completability: a `RepairApplied`-then-`ReceiptEmitted` prefix (missing `GatePassed`) can score high fitness while being **lawfully dead** (it skipped a mandatory gate). The Andon oracle must answer a **boolean reachability** question, not a fitness question.

The cleanest exact substrate is a **deterministic finite automaton (DFA)** with one explicit **DEAD** sink:

- States = positions in the law (`q0 … q6`) plus terminal sinks (`q_receipt`, `q_gatefailed`, `q_refusal`) plus one absorbing `q_DEAD`.
- Each event's `activity` drives a transition. Any activity with no lawful outgoing edge from the current state goes to `q_DEAD`.
- **Completable(q) = "a terminal accepting state is reachable from q without passing through `q_DEAD`."** Precomputed once at law-compile time by backward reachability over the DFA (TO BE BUILT #1, but trivial on a DFA — a single reverse-BFS from the accepting set).

This reuses the `TransitionSystem` *shape* (`states`/`transitions`/`final_states`, `transition_system.rs:56-67`) as the in-memory representation, but the automaton is **compiled from the authored law**, not discovered. The reverse-BFS completability marking is the one genuinely new algorithm.

---

## 5. The impossible-prefix detectors (concrete predicates)

Each detector is a predicate over `(law, prefix, next_event)` that, when true, yields a `PrefixFinding` with a stable `code` and forces the prefix verdict to **DEAD** (severity `Deny`) or flags a warning (severity `Warning`). Codes mirror the `ReceiptTruthRefusal` naming convention (`receipt.rs:33`).

| ID | Code (enum variant) | Predicate (informal) | Severity | Grounding |
|---|---|---|---|---|
| **D1** | `ReceiptBeforeGate` | `next.activity == "ReceiptEmitted"` and `"GatePassed"` ∉ prefix activities for this case | Deny | The headline andon. Law: `GatePassed` strictly precedes `ReceiptEmitted`. |
| **D2** | `RepairWithoutRoute` | `next.activity == "RepairApplied"` and `"RouteSelected"` ∉ prefix | Deny | "repair without routed obligation" — law: `RouteSelected` precedes `RepairApplied`. |
| **D3** | `ClearWithoutDiagnostic` | a stale-clear / closing event (`ReceiptEmitted` or `RefusalEmitted`) appears for a `(file,code)` whose prefix never contained `DiagnosticRaised` | Deny | "clear without prior diagnostic key" — the episode was never opened. |
| **D4** | `SuggestWithoutRoute` | `next.activity == "RepairSuggested"` and `"RouteSelected"` ∉ prefix | Deny | Law order `RouteSelected → RepairSuggested`. |
| **D5** | `RouteWithoutDiagnostic` | `next.activity == "RouteSelected"` and `"DiagnosticRaised"` ∉ prefix | Deny | Law order `DiagnosticRaised → RouteSelected`. |
| **D6** | `OutOfOrderTimestamp` | `next.time < max(prefix.time)` for the same case (event arrives with an earlier timestamp than an already-folded event) | Deny | Reuses the lifecycle-violation idea from `validate_ocel_object_lifecycles` (`ocel_io.rs:178`); temporal soundness of the prefix. |
| **D7** | `DuplicateTerminal` | a second terminal event (`ReceiptEmitted`/`GateFailed`/`RefusalEmitted`) for a case already in a terminal state | Deny | A case may close once. |
| **D8** (warn) | `RepeatedActivity` | the same non-terminal activity recurs for one case (silent rework loop) | Warning | Variant-explosion / hidden-loop smell; does not kill the prefix but is reported. |

Two **cross-checkpoint / scope** detectors are the boundary to siblings (HARNESS / OUT receipt, artifact-mutation-outside-sync). They depend on a *window/checkpoint scoping* concept that is **TO BE BUILT** elsewhere (`00-MAP` §8 items 3 & 8). This spec defines them as *interfaces* and defers their implementation:

| ID | Code | Predicate (informal) | Owner |
|---|---|---|---|
| **D9** | `HarnessActiveBeforeOutReceipt` | a `HARNESS`-scoped activity is globally active for a window before that window's `OUT` receipt event is observed | needs checkpoint registry (sibling spec) — this spec exposes the hook `PrefixContext.window_id` |
| **D10** | `ArtifactMutationOutsideSync` | a `RepairApplied` (artifact mutation) event whose `(file,run_id)` is not enclosed by an active `ggen sync` span object | needs ggen to emit a `sync` object on the event (ggen-side); oracle checks containment |

D9/D10 are **declared but TO BE BUILT** and explicitly flagged so builders do not hallucinate them as working. D1–D8 are fully specified and buildable from the `OrderingLaw` + per-case prefix state alone.

---

## 6. The authored law — serialized form (`OrderingLaw`)

A small, human-authored JSON file (the reference model ggen is judged against). Lives at `fixtures/real/ggen-oracle-law/living-loop-6link.law.json`. **TO BE BUILT** type + loader in `wasm4pm-algos::prefix_conformance`.

```jsonc
{
  "law_version": "26.5.x",
  "law_id": "ggen-living-loop-6link",
  // case is keyed by these object types appearing in OCEL event.objects[].type
  "case_key": ["file", "diagnostic_code", "episode"],
  "activities": [
    "DiagnosticRaised", "RouteSelected", "RepairSuggested",
    "RepairApplied", "GatePassed", "ReceiptEmitted",
    "GateFailed", "RefusalEmitted"
  ],
  // strict-precedence edges: "A -> B" means B may only occur if A already occurred in this case
  "precedence": [
    { "before": "DiagnosticRaised", "after": "RouteSelected"   },
    { "before": "RouteSelected",    "after": "RepairSuggested" },
    { "before": "RouteSelected",    "after": "RepairApplied"   },
    { "before": "RepairApplied",    "after": "GatePassed"      },
    { "before": "GatePassed",       "after": "ReceiptEmitted"  }
  ],
  // accepting terminals: a prefix ending in one of these is TERMINAL (lawfully closed)
  "accepting": ["ReceiptEmitted", "GateFailed", "RefusalEmitted"],
  // a case opens only on these activities (else ClearWithoutDiagnostic / RouteWithoutDiagnostic)
  "initial": ["DiagnosticRaised"]
}
```

```rust
// wasm4pm-algos/src/prefix_conformance/law.rs   (TO BE BUILT)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OrderingLaw {
    pub law_version: String,
    pub law_id: String,
    pub case_key: Vec<String>,
    pub activities: Vec<String>,
    pub precedence: Vec<Precedence>,
    pub accepting: Vec<String>,
    pub initial: Vec<String>,
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Precedence { pub before: String, pub after: String }

impl OrderingLaw {
    /// Compile to a DFA + precomputed completability bitset (reverse-BFS from `accepting`).
    pub fn compile(&self) -> CompiledLaw;          // TO BE BUILT
}
pub struct CompiledLaw { /* states, edges, dead_sink, completable: Vec<bool> */ }
```

---

## 7. Concrete API design (prefix + online)

### 7.1 Pure-Rust core — `wasm4pm-algos::prefix_conformance` (link-safe; TO BE BUILT)

```rust
// wasm4pm-algos/src/prefix_conformance/mod.rs   (TO BE BUILT)

/// The verdict for one case's current prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PrefixVerdict {
    #[serde(rename = "ALIVE")]    Alive,    // legal prefix, completion to accepting state exists
    #[serde(rename = "DEAD")]     Dead,     // no lawful completion — STOP THE LINE
    #[serde(rename = "TERMINAL")] Terminal, // prefix is itself a lawfully closed trace
}

/// Stable refusal codes — mirrors `ReceiptTruthRefusal` (receipt.rs:33) naming.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PrefixRefusal {
    ReceiptBeforeGate, RepairWithoutRoute, ClearWithoutDiagnostic,
    SuggestWithoutRoute, RouteWithoutDiagnostic, OutOfOrderTimestamp,
    DuplicateTerminal, RepeatedActivity,
    // TO BE BUILT (cross-checkpoint, sibling-owned):
    HarnessActiveBeforeOutReceipt, ArtifactMutationOutsideSync,
}

/// One finding — same shape as `ReceiptFinding` (receipt.rs:62) so reports are uniform.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrefixFinding {
    pub code: PrefixRefusal,
    pub severity: FindingSeverity,   // reuse receipt::FindingSeverity { Deny, Warning }
    pub json_path: String,           // e.g. "$.events[4]" — index into the tape
    pub message: String,             // human-readable
    pub case_id: String,             // (file|diagnostic_code|run_id)
    pub activity: String,            // the offending event's activity
}

/// Per-case incremental cursor (the online state). One per open episode.
pub struct CaseCursor {
    pub case_id: String,
    pub dfa_state: usize,            // current state in CompiledLaw
    pub seen: Vec<String>,           // activities folded so far (small — ≤ ~8)
    pub last_time_ms: i64,           // for D6 temporal soundness
    pub verdict: PrefixVerdict,
}

/// The online judge. Holds the compiled law + all open case cursors.
pub struct PrefixOracle {
    law: CompiledLaw,
    cases: std::collections::HashMap<String, CaseCursor>,
}

impl PrefixOracle {
    pub fn new(law: &OrderingLaw) -> Self;                       // TO BE BUILT

    /// Static query: classify a complete prefix in one shot (batch / fixtures).
    pub fn classify_prefix(&self, case_id: &str, activities: &[String])
        -> (PrefixVerdict, Vec<PrefixFinding>);                 // TO BE BUILT

    /// Incremental step: fold ONE event. O(1) amortized.
    /// Returns the (possibly unchanged) verdict and any NEW findings this event produced.
    /// When the returned verdict is `Dead`, callers MUST emit an early STOP.
    pub fn observe(&mut self, ev: &PrefixEvent)
        -> (PrefixVerdict, Vec<PrefixFinding>);                 // TO BE BUILT

    /// Snapshot of all open cases (for the report `open_cases` array).
    pub fn snapshot(&self) -> Vec<CaseCursor>;                  // TO BE BUILT
}

/// Minimal event the oracle needs — derived from an OCEL event (shape 2.A/2.C).
pub struct PrefixEvent {
    pub activity: String,    // from OCELEvent.event_type (serde alias "activity")
    pub time_ms: i64,        // from OCELEvent.time
    pub case_id: String,     // derived from event.relationships/objects per law.case_key
    pub tape_index: usize,   // line number in the .jsonl, for json_path
}
```

The `observe` step is the genuine online primitive: it advances `dfa_state`, runs detectors D1–D8, and — crucially — when the new state is the DEAD sink **or** `completable[dfa_state] == false`, it sets `verdict = Dead` and returns the killing finding. This is the early-STOP the streaming layer surfaces.

### 7.2 Online tape reader (the NDJSON tail; TO BE BUILT)

Reuses the NDJSON importer that sibling spec 03 (IO) defines (`import_ocel_ndjson`), but for *watch* mode reads incrementally:

```rust
// wasm4pm-cli side or wasm4pm-algos::prefix_conformance::stream  (TO BE BUILT)
/// One-shot: read a whole .ocel.jsonl, classify every case's final prefix.
pub fn check_tape(law: &OrderingLaw, ndjson: &str) -> OracleReport;   // TO BE BUILT

/// Watch: tail a file; for each new line, fold it; on first DEAD per case,
/// write an EarlyStop record to stdout (one JSON object per line) and continue.
pub fn watch_tape<R: std::io::BufRead>(
    law: &OrderingLaw, reader: R, mut on_stop: impl FnMut(&EarlyStop),
) -> std::io::Result<()>;                                             // TO BE BUILT
```

Truncated final line is tolerated (ggen appends concurrently — `GGEN-NEEDS.md` §4) — a parse error on the *last* line is skipped, not fatal.

---

## 8. The report + early-STOP schemas (the ggen consumption contract)

### 8.1 Batch report — `OracleReport` (one versioned envelope, modeled on `ReceiptDoctorReport`)

```rust
// TO BE BUILT — mirrors receipt.rs:76 ReceiptDoctorReport
#[derive(serde::Serialize, serde::Deserialize)]
pub struct OracleReport {
    pub report_version: String,        // "ggen-oracle/1"
    pub law_id: String,
    pub verdict: OracleVerdict,        // Admitted | AndonPull  (aligns w/ fixture "AndonPull")
    pub total_cases: usize,
    pub alive_cases: usize,
    pub dead_cases: usize,
    pub terminal_cases: usize,
    pub findings: Vec<PrefixFinding>,  // all Deny + Warning across every case
    // optional batch fitness, populated from algos ConformanceResult when a model is given
    pub conformance: Option<ConformanceSummary>,
}
#[derive(serde::Serialize, serde::Deserialize)]
pub enum OracleVerdict { Admitted, AndonPull }  // string "AndonPull" matches existing fixture
```

Example serialized envelope (what `wpm oracle check --format json` prints):

```json
{
  "report_version": "ggen-oracle/1",
  "law_id": "ggen-living-loop-6link",
  "verdict": "AndonPull",
  "total_cases": 1,
  "alive_cases": 0,
  "dead_cases": 1,
  "terminal_cases": 0,
  "findings": [
    {
      "code": "ReceiptBeforeGate",
      "severity": "Deny",
      "json_path": "$.events[3]",
      "message": "ReceiptEmitted cannot follow this prefix: GatePassed never observed for case item.tera|GGEN-TPL-001|run-7",
      "case_id": "item.tera|GGEN-TPL-001|run-7",
      "activity": "ReceiptEmitted"
    }
  ],
  "conformance": null
}
```

### 8.2 Early-STOP record — `EarlyStop` (the streaming andon pull, one JSON object per line)

```json
{
  "kind": "EarlyStop",
  "report_version": "ggen-oracle/1",
  "law_id": "ggen-living-loop-6link",
  "case_id": "item.tera|GGEN-TPL-001|run-7",
  "tape_index": 3,
  "verdict": "DEAD",
  "finding": {
    "code": "ReceiptBeforeGate",
    "severity": "Deny",
    "json_path": "$.events[3]",
    "message": "STOP: ReceiptEmitted is not a lawful continuation; GatePassed missing.",
    "case_id": "item.tera|GGEN-TPL-001|run-7",
    "activity": "ReceiptEmitted"
  }
}
```

`verdict`/`reason` vocabulary aligns with the existing `expected-conform.json` fixture (`verdict:"AndonPull"`, `andon_reason`). The `EarlyStop.finding.code` is the machine-readable `andon_reason`.

---

## 9. Mapping onto crates + the `wpm` CLI

| Layer | Home | Rationale |
|---|---|---|
| `OrderingLaw`, `CompiledLaw`, `PrefixOracle`, detectors D1–D8, `check_tape`, `watch_tape` | **`wasm4pm-algos`** new module `prefix_conformance` | Pure Rust, no `wasm-bindgen` — the only link-safe, subprocess-reachable home (`00-MAP` §1; algos is leaf-ish and re-exports `wasm4pm-compat`). Keeps the oracle callable both as a library and from `wpm` without the WASM engine. |
| `FindingSeverity` reuse | from `wasm4pm::receipt` (or lift the 2-variant enum into `wasm4pm-algos`) | Uniform finding shape across receipt-doctor and prefix-oracle. If `wasm4pm-algos` must not depend on the engine crate, define a local `FindingSeverity{Deny,Warning}` identical in serde. |
| NDJSON read | sibling spec 03's `import_ocel_ndjson` | Do not duplicate the reader. |
| CLI surface | **`wpm oracle`** subcommand (new), beside `wpm mining`/`wpm receipt` (`crates/wasm4pm-cli/src/main.rs`, `commands/`) | Matches the external-oracle boundary (`GGEN-NEEDS.md` §5). |

### 9.1 `wpm oracle` command tree (TO BE BUILT)

```
wpm oracle
├── check   <tape.ocel.jsonl>  --law <law.json>  [-f human|json]
│       one-shot: classify all cases, print OracleReport, exit non-zero on AndonPull
└── watch   <tape.ocel.jsonl>  --law <law.json>
        tail the tape; emit one EarlyStop JSON object per line per first-DEAD case;
        exit non-zero if any case died
```

Follows the `wpm receipt doctor` precedent exactly: `--format json` → `serde_json::to_string_pretty(&report)`; default `human`; **non-zero exit on refusal** (`receipt.rs:186` pattern, propagated via `anyhow::bail!` → `main.rs::try_main` → `e.die()`). This is the smallest CLI addition that gives ggen a real andon oracle, and it parallels the recommendation in `00-MAP` §9.4.

---

## 10. ggen-side consumption contract

ggen invokes `wpm` as a **subprocess** (Chicago-TDD real boundary; `GGEN-NEEDS.md` §5 — only `ocel-core` is linked, everything else is the CLI oracle). Two modes:

1. **Gate-time one-shot** (synchronous, in ggen's headless gate path):
   ```bash
   wpm oracle check .ggen/ocel/agent-edit-events.ocel.jsonl \
       --law living-loop-6link.law.json --format json
   ```
   ggen reads stdout JSON (`OracleReport`) and the **exit code**. Non-zero ⇒ `verdict == "AndonPull"` ⇒ ggen refuses the edit / withholds the receipt. ggen maps `findings[].code` onto its own diagnostic species (`ReceiptBeforeGate` → refuse `receipt_emitted` call).

2. **Live watch** (long-running, alongside the LSP session):
   ```bash
   wpm oracle watch .ggen/ocel/agent-edit-events.ocel.jsonl --law living-loop-6link.law.json
   ```
   Each line of stdout is an `EarlyStop` JSON object. ggen's intel layer parses it and raises an in-editor andon the instant a case goes DEAD — *before* the offending agent edit lands a receipt.

**Wire-shape contract (non-negotiable, `GGEN-NEEDS.md` §3.1):** the oracle consumes `"activity":"…"` and inline `objects:[{id,type}]` (ggen's 2.C/2.D shape). It must NOT require ggen to rename to OCEL-2.A `"type"`. Achieved via the serde `#[serde(alias="activity")]` reconciliation that sibling spec 02 owns; this spec depends on it. The `case_id` is derived from the law's `case_key` against `event.objects[].type` — ggen already emits `file`, `diagnostic_code`, `episode` objects (`GGEN-NEEDS.md` §3.1), so no ggen-side change is needed for D1–D8.

---

## 11. Fixtures (TO BE BUILT — the bad-prefix corpus)

No impossible-trace corpus exists (`00-MAP` §6). Create `fixtures/real/ggen-oracle-bad-prefix/`, each a real `.ocel.jsonl` snippet + an `expected-oracle.json` (`OracleReport`), following the `fixtures/real/<scenario>/expected-*.json` convention. Minimum set, one per Deny detector:

```
ggen-oracle-bad-prefix/
├── 01-receipt-before-gate/        # D1: D,R,Rs,Ra,ReceiptEmitted (no GatePassed) → DEAD ReceiptBeforeGate
├── 02-repair-without-route/       # D2: D,RepairApplied → DEAD RepairWithoutRoute
├── 03-clear-without-diagnostic/   # D3: ReceiptEmitted with no prior DiagnosticRaised → DEAD ClearWithoutDiagnostic
├── 04-out-of-order-timestamp/     # D6: e2.time < e1.time → DEAD OutOfOrderTimestamp
├── 05-duplicate-terminal/         # D7: two ReceiptEmitted for one case → DEAD DuplicateTerminal
└── 00-happy-6link/                # ALL six in order → TERMINAL, verdict Admitted (the positive control)
```

The positive control `00-happy-6link` is ggen's real living-loop tape — proves the oracle admits a lawful trace (closes `GGEN-NEEDS.md` §7 proof obligation #6 from the *possibility* side). Reuse the structural sibling already in-tree: `fixtures/real/trace-conform-agent-proof-lifecycle/` (`collect_evidence → verify_evidence → emit_receipt`) is the same 3-stage line-graph family.

---

## 12. Acceptance criteria (verifiable by wasm4pm builders)

1. **Law compiles + completability is exact.** `OrderingLaw::compile()` produces a DFA whose `completable[q]` is `true` iff an accepting state is reachable from `q` without entering `q_DEAD`. Unit test: reverse-BFS result matches a hand-computed table for the 6-link law.
2. **Static classifier is correct on the corpus.** `classify_prefix` returns the `expected-oracle.json` verdict + finding codes for all six fixtures in §11. `00-happy-6link` ⇒ `TERMINAL`/`Admitted`; each bad fixture ⇒ `DEAD` with the matching `PrefixRefusal` code.
3. **Incremental == batch.** For every fixture, folding events one-at-a-time via `observe` yields the same final verdict and finding set as `classify_prefix` on the whole prefix (the online path must not disagree with the batch path).
4. **Early-STOP fires at the right index.** In `01-receipt-before-gate`, `observe` returns `Dead` exactly when the `ReceiptEmitted` event (tape_index 4) is folded — not before, not after; the emitted `EarlyStop.tape_index == 4`.
5. **CLI honors the contract.** `wpm oracle check 01-receipt-before-gate/*.ocel.jsonl --law … --format json` prints a valid `OracleReport` with `verdict:"AndonPull"` and exits non-zero; `00-happy-6link` exits zero with `verdict:"Admitted"`. Integration test in `crates/wasm4pm-cli/tests/cli_tests.rs` via `assert_cmd::Command::cargo_bin("wpm")` + `predicates` (existing convention, `00-MAP` §6).
6. **Wire-shape tolerance.** The oracle parses ggen's real `.ocel.jsonl` (`"activity"`, inline `objects`, `DateTime<Utc>`) without requiring `"type"`/`relationships`; a truncated final line is skipped, not fatal.
7. **No regression.** `wasm4pm-algos` test suite stays green; the new module adds no `wasm-bindgen` dependency to `wasm4pm-algos`.
8. **Pure-Rust subprocess reachability proven.** `wpm oracle check` runs with no JS/WASM runtime present (it links only `wasm4pm-algos`, not the `wasm4pm` cdylib engine) — verifiable by the integration test running under plain `cargo test`.

---

## 13. Open questions for the conductor / sibling specs

1. **`FindingSeverity` home.** Reuse `wasm4pm::receipt::FindingSeverity` (couples `wasm4pm-algos`→`wasm4pm` engine, undesirable) or define an identical 2-variant enum local to `wasm4pm-algos`? Recommend the latter for link-safety; spec 02 should confirm there's no serde-name clash.
2. **D9/D10 ownership.** The cross-checkpoint detectors (`HarnessActiveBeforeOutReceipt`, `ArtifactMutationOutsideSync`) need a checkpoint/window registry and a `sync`-span object emitted by ggen. Which sibling spec owns the checkpoint registry (`00-MAP` §8 items 3 & 8)? This spec exposes `PrefixContext.window_id` as the hook but does not implement it.
3. **Law authorship + versioning.** Where does `living-loop-6link.law.json` live as source of truth — in wasm4pm fixtures, or shipped by ggen and passed via `--law`? Recommend ggen ships it (the law is ggen's domain), wasm4pm only interprets it.
4. **`from_dfg` bug.** Should the latent `StreamingConformanceChecker::from_dfg` call (`streaming_conformance.rs:35`, no such method) be fixed as part of this work or filed separately? This spec does not depend on it.
5. **Window vs. case for multi-run tapes.** ggen's tape is append-only across many `run_id`s. Confirm `case_id = file|diagnostic_code|run_id` is the correct case granularity (vs. per-`run_id`), since `D7 DuplicateTerminal` semantics depend on it.

---

*This spec is descriptive only. No Rust source, Cargo.toml, or existing file was modified. The single file written is `/Users/sac/wasm4pm/docs/ggen-oracle/04-prefix-and-online-conformance.md`.*
