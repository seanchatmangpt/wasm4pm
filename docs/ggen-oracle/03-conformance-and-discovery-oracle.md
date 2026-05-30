# 03 — Conformance + Discovery Oracle (the proof upgrade)

**Status:** Spec. Buildable against the structure map (`00-STRUCTURE-MAP.md`) and the checkpoint-model spec (`02-*`, referenced as "spec 02").
**Date:** 2026-05-30
**Version train:** `26.5.x` (workspace `26.5.29`, `/Users/sac/wasm4pm/Cargo.toml:7`). New code uses `version.workspace = true`.
**Boundary:** ggen consumes this as an **external `wpm` CLI oracle** (subprocess + machine-readable JSON), never as a linked dependency. Only `ocel-core` is linked (per `GGEN-NEEDS.md` §5).
**Authored by:** Conformance/Discovery spec agent. Every "EXISTS" claim is cited to a real file:symbol read from `/Users/sac/wasm4pm`. Everything else is marked **TO BE BUILT**.

---

## 1. Purpose

Today ggen's living-loop proof is **string-presence**: the proof tests grep the on-disk JSONL for `"activity":"DiagnosticRaised"`, the object id substring (`item.tera`), and the code (`GGEN-TPL-001`) — see `GGEN-NEEDS.md` §3.1. That proves *the six activity strings appeared*. It does **not** prove:

1. **Conformance** — the observed 6-link trace `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted` actually **replays** against the declared checkpoint model (right order, no extra moves, no missing moves).
2. **Discovery match** — the process **discovered** from ggen's accumulated log (DFG) **equals** the declared model, i.e. no **hidden loops, rework, or shadow paths** crept in across many runs.

This spec upgrades both, reusing the existing pure-Rust conformance engine (`wasm4pm-algos`) and DFG discovery, and defines the **machine-readable JSON report** ggen consumes. It deliberately stops at *finished-trace* conformance + *aggregate* discovery-diff; the **mid-trace "judge of possibility"** (prefix-completability, forbidden-variant Andon) is the sibling spec's job (structure map §8 items #4, #7) — this oracle is the **history judge done correctly**, which is the precondition for that leap.

The proof obligation this satisfies: `GGEN-NEEDS.md` §7 item 6 — *"demonstrate ggen's emitted 6-link living-loop log mines into a conforming process via `wpm`."*

---

## 2. What EXISTS vs what is TO BE BUILT

### 2.1 EXISTS — build directly on these (cited)

| Capability | Symbol (file:line) | Notes |
|---|---|---|
| Token-replay conformance | `check_conformance_token_replay(log:&EventLog, model:&DFG, activity_key:&str)->Result<ConformanceResult>` — `crates/wasm4pm-algos/src/conformance.rs:13` | Rozinat/van der Aalst token counters; per-trace + aggregate fitness. **The ordering proof.** Pure Rust. |
| Alignment conformance | `check_conformance_alignment(log:&EventLog, model:&PetriNet, activity_key:&str)->Result<ConformanceResult>` — `conformance.rs:163` | Dijkstra on synchronous product; emits `TraceAlignment{steps,total_cost}` (`conformance.rs:151`) and `AlignmentStep{log_activity,model_activity,cost}` (`conformance.rs:140`). **The deviation localizer.** |
| Serde-ready report payload | `ConformanceResult{fitness, precision:Option<f64>, generalization:Option<f64>, simplicity:Option<f64>, total_traces, fitting_traces, deviating_traces}` + `conformance_rate()` — `crates/wasm4pm-types/src/conformance.rs:62` | Already `#[derive(Serialize,Deserialize)]`. NaN-safe `clamp_finite` (`:51`) and `with_precision/with_generalization/with_simplicity` builders (`:91-105`). |
| DFG discovery | `discover_dfg(log,activity_key)->Result<DFG>` — `crates/wasm4pm-algos/src/dfg.rs:12` | O(n) single pass; produces `DFG{nodes,edges,start_activities,end_activities}` (`crates/wasm4pm-types/src/models.rs:38`). **The discovery half.** |
| Heuristic discovery | `discover_heuristic(log,activity_key)->Result<DFG>` — `crates/wasm4pm-algos/src/heuristic.rs:11` | Same `DFG` shape; wired in CLI already. |
| Alpha discovery (Petri) | `discover_alpha(log,activity_key)->Result<PetriNet>` — `crates/wasm4pm-algos/src/alpha.rs:11` | Feeds `check_conformance_alignment`. |
| OCEL→per-type EventLog flatten | `flatten_ocel_to_eventlog_for_type(ocel:&OCEL, object_type:&str)->Result<EventLog,JsValue>` — `wasm4pm/src/oc_petri_net.rs:102` | **Critical bridge:** OCEL has no traces; conformance needs an XES `EventLog` keyed by `concept:name`. Operates on the **legacy engine OCEL (shape 2.B)** and returns `JsValue` errors — NOT directly reusable by a pure CLI oracle. **A pure-Rust re-implementation against `ocel-core` (2.A) is TO BE BUILT** (§5.1). |
| OC conformance reference | `oc_conformance_check_inner(ocel:&OCEL)->Result<serde_json::Value,String>` — `wasm4pm/src/oc_conformance.rs:26` | Pure-Rust, returns JSON per object type. Pattern to copy (flatten → discover ref net → replay → per-type fitness), but bound to engine OCEL (2.B) and `serde_wasm_bindgen`. |
| Existing conformance report shape | `fixtures/real/trace-conform-agent-proof-lifecycle/expected-conform.json` | **The report contract already in-tree:** `{route_id, fitness, precision, required_stage_coverage, receipt_coverage, object_lifecycle_validity, verdict, andon_reason, details:[{dimension,ok,detail}]}`. The agent-proof-lifecycle scenario (`collect_evidence→verify_evidence→emit_receipt`) is a structural sibling of ggen's 6-link loop. **Align the new envelope to this — do not invent a new shape.** |
| Verdict/findings pattern | `ReceiptDoctorReport{state:ReceiptDoctorState, findings:Vec<ReceiptFinding>, admitted:bool}` — `wasm4pm/src/receipt.rs:78`; `ReceiptFinding{code, json_path, message, severity}` (`:63`); `FindingSeverity{Deny,Warning}` (`:56`); `ReceiptDoctorState{Admitted,Refused}` (`:71`) | **Copy this shape** for the oracle verdict. Pure `serde_json::Value` + findings; already wired to `wpm receipt doctor` with JSON output + non-zero exit on refusal (`receipt.rs:140,186`). |
| CLI mining surface | `wpm mining {discover,conformance}` — `crates/wasm4pm-cli/src/commands/mining.rs:17` | **`discover` works** (heuristic only, table output). **`conformance` is MOCKED**: `let dfg = DFG::new();` (`mining.rs:75`, comment "Mock model load for now") — never loads the `<model>` arg, prints a `Table`, no `--format`. |
| CLI test convention | `crates/wasm4pm-cli/tests/cli_tests.rs` (`assert_cmd::cargo_bin("wpm")` + `predicates`, `tempfile::tempdir`) | Where the oracle CLI acceptance tests go. |

### 2.2 TO BE BUILT

| # | Item | Why it does not exist |
|---|---|---|
| B1 | **Pure-Rust OCEL→EventLog flatten** against `ocel-core` (2.A) keyed by a chosen object type | Existing `flatten_ocel_to_eventlog_for_type` (`oc_petri_net.rs:102`) operates on engine OCEL 2.B and returns `JsValue`; not callable from the CLI oracle without a pure seam. |
| B2 | **Real model loader** for `wpm mining conformance` (`.dfg.json` and a checkpoint-model file from spec 02) | `mining.rs:75` is `DFG::new()` — a stub. |
| B3 | **`wpm oracle conform`** command: OCEL `.jsonl` + checkpoint model → conformance verdict JSON | No OCEL-aware conformance command exists; `wpm mining conformance` is XES-`EventLog`-only and mocked. |
| B4 | **`wpm oracle discover-diff`** command: OCEL `.jsonl` → discovered DFG **vs** declared DFG → structural diff (hidden loops / rework / shadow edges) | No "compare discovered to declared" anywhere (structure map §8 #2). `discover_dfg` exists; the **diff** does not. |
| B5 | **One versioned JSON report envelope** (`OracleReport`) with `verdict` + `findings[]` | No shared JSON-envelope helper in the CLI (`io.rs` is text `Table` only); each command rolls its own (structure map §5). |
| B6 | **`--format json` + non-zero-exit-on-refusal** convention for the oracle commands | Only `wpm receipt`/`autoprocess` honor JSON+exit-code today; `mining` does not. |
| B7 | **Checkpoint-model → DFG/PetriNet adapter** (consume the model from spec 02) | Depends on spec 02's serialized model format; the adapter that turns it into the `DFG`/`PetriNet` the algos take is new. |

**Tally:** EXISTS = 9 reusable assets; TO BE BUILT = 7 items (all small, all built on the EXISTS column).

---

## 3. The two proofs, precisely

### 3.1 Proof A — conformance (the trace replays against the declared model)

ggen's log is OCEL; the algos take an XES `EventLog`. The bridge: **flatten OCEL on the `episode` object type** so each diagnostic-repair episode becomes one trace whose events are the activities in timestamp order. (ggen's events already carry an `episode` object — `GGEN-NEEDS.md` §3.1.)

```
.ggen/ocel/agent-edit-events.ocel.jsonl
  → import (NDJSON, sibling spec 01)            ──→ OCEL  (ocel-core 2.A)
  → flatten on object_type = "episode" (B1)     ──→ EventLog (one trace per episode)
  → declared checkpoint model (spec 02)          ──→ DFG  (and/or PetriNet)  via adapter (B7)
  → check_conformance_token_replay(log,dfg,"concept:name")  [EXISTS conformance.rs:13]
       └ for alignment + per-step deviations:
         check_conformance_alignment(log,petri,"concept:name") [EXISTS conformance.rs:163]
  → ConformanceResult → OracleReport envelope (B5)
```

The declared DFG for the canonical living-loop is exactly the 6-link chain:

```
start_activities = ["DiagnosticRaised"]
edges = [
  ("DiagnosticRaised","RouteSelected"), ("RouteSelected","RepairSuggested"),
  ("RepairSuggested","RepairApplied"), ("RepairApplied","GatePassed"),
  ("GatePassed","ReceiptEmitted")
]
end_activities = ["ReceiptEmitted"]
```

`check_conformance_token_replay` then proves:
- **Ordering:** `RepairApplied` before `GatePassed` before `ReceiptEmitted` (a `ReceiptEmitted` that fires before `GatePassed` produces a missing token on the absent edge → fitness < 1.0, `deviating_traces ≥ 1`).
- **No extra moves:** a stray activity (e.g. a second `RepairApplied` — rework) lands on an edge not in the model → missing token → fitness drop.
- **No missing moves:** a trace that ends at `GatePassed` (never emits a receipt) leaves a remaining token → fitness < 1.0.

This is the upgrade from "the strings appeared" to "the strings appeared **in a lawful order with no rework and a proper terminus**."

### 3.2 Proof B — discovery match (the discovered process equals the declared one)

Over many ggen runs the log accumulates many episodes. Discover the **actual** DFG and diff it against the declared DFG:

```
OCEL (all episodes) → flatten("episode") → EventLog
  → discover_dfg(log,"concept:name")  [EXISTS dfg.rs:12]   ──→ DFG_actual
  declared model (spec 02) → adapter (B7)                   ──→ DFG_declared
  → dfg_structural_diff(DFG_actual, DFG_declared)  (B4, TO BE BUILT)
       → { shadow_edges:   edges in actual ∉ declared,   // unexpected paths
           missing_edges:  edges in declared ∉ actual,   // never exercised
           rework_edges:   self-loops / back-edges in actual ∉ declared,
           shadow_starts/ends, extra_activities }
```

A clean ggen is `shadow_edges == [] && rework_edges == []`. A back-edge such as `("GatePassed","RouteSelected")` appearing in `DFG_actual` is a **rework loop** the string-presence proof is blind to; the diff surfaces it as `rework_edges`.

> **Why DFG-diff, not full Petri replay, for Proof B:** discovery cost is O(n) and the diff is set algebra over `DFGEdge` (`models.rs:21`, already `Eq+Hash`). It catches hidden loops/rework/shadow paths — the named requirement — without the expense of net discovery on every run. Alignment (Proof A) is where per-step localization happens.

---

## 4. The machine-readable JSON report (the ggen consumption contract)

One **versioned** envelope, aligned to the in-tree `expected-conform.json` shape and the `ReceiptDoctorReport` verdict pattern. ggen parses **only this**; field names are a stability contract (mirroring `GGEN-NEEDS.md` §3.1's serialized-name discipline — any rename must be coordinated with ggen).

### 4.1 `OracleReport` schema (TO BE BUILT — lives in `ocel-core` or a new `wasm4pm-cli` report module)

```jsonc
{
  "report_version": "1",                 // bump on any breaking field change
  "oracle": "conform" | "discover-diff",  // which sub-oracle produced this
  "model_id": "ggen-living-loop",         // declared model id (from spec 02)
  "object_type": "episode",               // flattening pivot
  "verdict": "Admitted" | "Refused",      // mirrors ReceiptDoctorState (receipt.rs:71)
  "andon_reason": "OrderingViolation" | "ShadowPath" | "ReworkLoop"
                  | "IncompleteTrace" | "ModelLogMismatch" | null,

  // ---- Proof A payload (oracle == "conform") ----
  "conformance": {
    "fitness": 1.0,                       // ConformanceResult.fitness
    "precision": 1.0,                     // Option → null when not computed
    "generalization": null,
    "simplicity": null,
    "total_traces": 12,
    "fitting_traces": 11,
    "deviating_traces": 1,
    "conformance_rate": 0.9167            // ConformanceResult.conformance_rate()
  },

  // ---- Proof B payload (oracle == "discover-diff") ----
  "discovery_diff": {
    "shadow_edges":  [{"source":"GatePassed","target":"RouteSelected","frequency":2}],
    "missing_edges": [],
    "rework_edges":  [{"source":"GatePassed","target":"RouteSelected","frequency":2}],
    "shadow_starts": [], "shadow_ends": [], "extra_activities": [],
    "declared_edge_count": 5, "actual_edge_count": 6
  },

  // ---- findings: one per deviation, modeled on ReceiptFinding (receipt.rs:63) ----
  "findings": [
    {
      "code": "ReceiptBeforeGate",        // stable enum (see §4.2)
      "severity": "Deny" | "Warning",     // mirrors FindingSeverity (receipt.rs:56)
      "json_path": "$.events[7]",         // pointer into the source OCEL
      "message": "ReceiptEmitted at e7 has no preceding GatePassed in episode ep-3",
      "trace_id": "ep-3",                 // episode object id
      "alignment": [                      // present for conform deviations (AlignmentStep)
        {"log_activity":"ReceiptEmitted","model_activity":null,"cost":1}
      ]
    }
  ],

  // ---- details: human-readable per-dimension, copied verbatim convention from
  //      fixtures/real/.../expected-conform.json ----
  "details": [
    {"dimension":"fitness","ok":true,"detail":"11/12 episodes replay against declared model"},
    {"dimension":"ordering","ok":false,"detail":"1 episode emits receipt before gate"},
    {"dimension":"no_shadow_paths","ok":true,"detail":"0 shadow edges discovered"}
  ]
}
```

### 4.2 Stable finding codes (TO BE BUILT — enum mirroring `ReceiptTruthRefusal`, `receipt.rs:33`)

```rust
// Serialized as the JSON string in OracleReport.findings[].code
#[derive(Serialize, Deserialize)]
pub enum OracleFinding {
    // --- conform (Proof A) ---
    OrderingViolation,   // edge fired that is not in the declared DFG
    ReceiptBeforeGate,   // ReceiptEmitted with no preceding GatePassed (6-link law)
    IncompleteTrace,     // remaining token: episode never reached ReceiptEmitted
    ExtraActivity,       // log move: activity absent from the model
    // --- discover-diff (Proof B) ---
    ShadowPath,          // edge in discovered DFG ∉ declared DFG
    ReworkLoop,          // back-edge / self-loop discovered, not declared
    NeverExercised,      // declared edge absent from discovered DFG (Warning, not Deny)
}
```

`ReceiptBeforeGate` is the 6-link-law specialization the structure map (§8 #9) calls out as missing — it is computed here as a named ordering violation (a missing token on the absent `(GatePassed→ReceiptEmitted)` edge whose predecessor `GatePassed` never fired).

### 4.3 Verdict rule

```
verdict = Refused  iff  any finding.severity == Deny
                        (e.g. fitness < 1.0 in --strict, or any ShadowPath/ReworkLoop/ReceiptBeforeGate)
        = Admitted otherwise (NeverExercised / sub-threshold precision are Warnings)
```

Exit code: `Refused → non-zero` (matches `wpm receipt doctor`, `receipt.rs:186`), `Admitted → 0`. `--strict` promotes `fitness < 1.0` from Warning to Deny.

---

## 5. Mapping onto existing crates + the `wpm` CLI

### 5.1 Crate placement

| New code | Home crate | Rationale |
|---|---|---|
| `OracleReport`, `OracleFinding`, `OracleVerdict` types | **`ocel-core`** (the new leaf, `GGEN-NEEDS.md` §2) | Serde-only; both `wasm4pm-cli` and (optionally) ggen can deserialize the same struct. Inherit `serde`/`serde_json`(`preserve_order`)/`chrono` from `[workspace.dependencies]`. |
| `flatten_ocel_to_eventlog(ocel:&OCEL, object_type:&str)->EventLog` (B1, pure Rust, `ocel-core` 2.A) | **`wasm4pm-algos`** | Pure Rust, link-safe; sits beside the conformance fns it feeds. Re-implements `oc_petri_net.rs:102` against 2.A with `anyhow`/`Result` errors (no `JsValue`). |
| `dfg_structural_diff(actual:&DFG, declared:&DFG)->DiscoveryDiff` (B4) | **`wasm4pm-algos`** | Set algebra over `DFGEdge` (already `Eq+Hash`, `models.rs:21`). Pure Rust. |
| checkpoint-model → `DFG`/`PetriNet` adapter (B7) | **`wasm4pm-algos`** (or `wasm4pm-cli` if the model type is CLI-local) | Depends on spec 02's serialized model; keep it next to the algos that consume `DFG`. |
| `wpm oracle {conform,discover-diff}` command (B3,B4) + envelope emit (B5,B6) | **`wasm4pm-cli`** (`commands/oracle.rs`, registered in `main.rs` clap tree) | The external-oracle boundary; reuses `Io` and adds `--format json`. |
| Real model loader for `wpm mining conformance` (B2) | **`wasm4pm-cli`** (`commands/mining.rs:64`) | Smallest patch: replace `DFG::new()` (`mining.rs:75`) with a real load + emit `ConformanceResult` as JSON. Unblocks the existing command independently of `wpm oracle`. |

### 5.2 CLI surface (extends the existing tree from structure map §5)

```
wpm oracle                                   # NEW subcommand group (B3,B4)
├── conform  <ocel.jsonl> --model <model.json> [--object-type episode]
│            [--checker token|alignment] [--strict] [-f json|human]
│            # OCEL → flatten → token-replay (or alignment) → OracleReport
└── discover-diff <ocel.jsonl> --model <model.json> [--object-type episode]
             [-a algo=dfg|heuristic] [-f json|human]
             # OCEL → discover_dfg → dfg_structural_diff(declared) → OracleReport
```

And the independent fix to the existing command:

```
wpm mining conformance <log> <model> [-k concept:name] [-f json]   # B2: load real model, emit ConformanceResult JSON
```

`--object-type episode` defaults to `episode` (ggen's pivot) but is configurable. `--model` accepts the checkpoint model serialized by spec 02 (the adapter B7 maps it to `DFG`/`PetriNet`); for the bare living-loop, a `.dfg.json` (the `DFG` serde shape) is also accepted directly.

### 5.3 Output plumbing

`--format json` prints `serde_json::to_string_pretty(&OracleReport)` to stdout and nothing else (so ggen can pipe-parse); `--format human` (default) renders a `Table` (`io.rs:68`) of `details[]`. Exit non-zero on `verdict == Refused`, via `anyhow::bail!` propagated by `try_main`/`e.die()` (structure map §5).

---

## 6. ggen-side consumption contract (external `wpm` oracle)

ggen invokes `wpm` as a **subprocess** (no link dependency beyond `ocel-core`), matching its Chicago-TDD doctrine (real external boundary, externalizable evidence). The contract:

```
# Proof A — conformance of the living-loop log against the declared model
wpm oracle conform .ggen/ocel/agent-edit-events.ocel.jsonl \
    --model .ggen/models/living-loop.dfg.json \
    --object-type episode --checker token --format json

# stdout (parsed by ggen):  OracleReport JSON (§4.1)
# exit 0  → Admitted (trace conforms)
# exit !0 → Refused  (ggen reads findings[] for the Andon reason)

# Proof B — discovered process vs declared (hidden loops / rework / shadow paths)
wpm oracle discover-diff .ggen/ocel/agent-edit-events.ocel.jsonl \
    --model .ggen/models/living-loop.dfg.json \
    --object-type episode --format json
```

ggen's side (replaces the PM code it deletes — `GGEN-NEEDS.md` §1):
- ggen builds the log via `intel/events.rs` (kept) and writes NDJSON (kept).
- ggen **deletes** `ocel/dfg.rs`, `ocel/conformance.rs`, and the mining/conformance bodies of `intel/mine.rs` / `intel/log.rs::read`.
- ggen's proof test changes from grepping `"activity":"DiagnosticRaised"` to: run `wpm oracle conform … --format json`, assert `verdict == "Admitted"` and `conformance.fitness == 1.0` and `conformance.deviating_traces == 0`. The serialized OCEL field names (`activity`, object `id`) still must round-trip through the importer (sibling spec 01's `#[serde(alias="activity")]`), so the existing on-disk JSONL is unchanged — only the *proof assertion* moves from string-grep to oracle-verdict. This is a coordinated ggen-side change, not a silent rename (`GGEN-NEEDS.md` §3.1).

**Negative-direction contract (Andon):** when ggen wants to prove its gate *catches* a bad trace, it emits a sabotaged episode (e.g. `ReceiptEmitted` before `GatePassed`) and asserts `wpm oracle conform` returns `verdict == "Refused"`, `andon_reason == "OrderingViolation"`, and a finding with `code == "ReceiptBeforeGate"`. This is the existing `expected-conform.json` `verdict: "AndonPull"` convention generalized to ggen's loop.

---

## 7. Fixtures (TO BE BUILT — follow the in-tree convention)

Add under `fixtures/real/` mirroring `trace-conform-agent-proof-lifecycle/` (structure map §6). Each dir holds the OCEL input + the `expected-*.json` the oracle must reproduce:

```
fixtures/real/ggen-living-loop-conform/
  agent-edit-events.ocel.jsonl     # 6-link episode, OCEL 2.C/2.D shape (activity/event_id/inline objects)
  living-loop.dfg.json             # declared DFG (the 5 edges of §3.1)
  expected-oracle-conform.json     # OracleReport: verdict Admitted, fitness 1.0, deviating_traces 0
fixtures/real/ggen-living-loop-receipt-before-gate/   # negative
  agent-edit-events.ocel.jsonl     # ReceiptEmitted before GatePassed
  living-loop.dfg.json
  expected-oracle-conform.json     # verdict Refused, andon_reason OrderingViolation, finding ReceiptBeforeGate
fixtures/real/ggen-living-loop-rework/                # negative
  agent-edit-events.ocel.jsonl     # back-edge GatePassed → RouteSelected across episodes
  living-loop.dfg.json
  expected-oracle-discover-diff.json  # verdict Refused, rework_edges non-empty, finding ReworkLoop
```

The positive fixture's `.ocel.jsonl` is generated by replaying ggen's real living-loop (the 6-link chain emitted by `intel/events.rs`) — **not hand-authored** — so the proof is over a real producer artifact (Chicago-TDD; `GGEN-NEEDS.md` §0).

---

## 8. Acceptance criteria (wasm4pm builders verify)

1. **B1 flatten:** `flatten_ocel_to_eventlog(&ocel, "episode")` on the positive fixture produces an `EventLog` with one `Trace` per episode whose `get_activity("concept:name")` sequence is `[DiagnosticRaised, RouteSelected, RepairSuggested, RepairApplied, GatePassed, ReceiptEmitted]`. Unit test in `wasm4pm-algos`.
2. **B2 mining fix:** `wpm mining conformance <log> <model.dfg.json> -f json` loads the **real** model (not `DFG::new()`) and prints a `ConformanceResult` JSON to stdout; a unit/CLI test proves `mining.rs:75` no longer constructs an empty DFG.
3. **Proof A positive:** `wpm oracle conform fixtures/real/ggen-living-loop-conform/agent-edit-events.ocel.jsonl --model …/living-loop.dfg.json --object-type episode -f json` exits `0`, `verdict == "Admitted"`, `conformance.fitness == 1.0`, `conformance.deviating_traces == 0`. Output equals `expected-oracle-conform.json`.
4. **Proof A negative (ordering):** the `receipt-before-gate` fixture exits non-zero, `verdict == "Refused"`, `andon_reason == "OrderingViolation"`, `findings[]` contains `code == "ReceiptBeforeGate"` with an `alignment` step.
5. **Proof B positive:** `wpm oracle discover-diff` on the clean fixture yields `discovery_diff.shadow_edges == [] && rework_edges == []`, `verdict == "Admitted"`.
6. **Proof B negative (rework):** the `rework` fixture yields non-empty `rework_edges` (the `GatePassed→RouteSelected` back-edge), `verdict == "Refused"`, `findings[]` contains `code == "ReworkLoop"`.
7. **Envelope stability:** `OracleReport` round-trips serde (`to_string` → `from_str` → equal); `report_version == "1"`; a schema test pins the field names ggen depends on (`verdict`, `conformance.fitness`, `conformance.deviating_traces`, `findings[].code`, `discovery_diff.rework_edges`).
8. **CLI convention:** `-f json` prints only the envelope to stdout; `Refused` → non-zero exit; `-f human` prints a `details[]` table. CLI tests in `crates/wasm4pm-cli/tests/cli_tests.rs` via `assert_cmd` + `predicates`, no mocks.
9. **Doctrine boundary:** the oracle reads OCEL + a model and emits a verdict; it does **not** mutate ggen files, and it links no wasm-bindgen (all logic in `wasm4pm-algos` + `wasm4pm-cli`, reachable without the engine `cdylib`).

---

## 9. Open questions for the build / sibling specs

1. **Object-type pivot:** is `episode` the canonical flattening object type, or should the oracle flatten on `file` (one trace per source file)? Per-`episode` gives the cleanest 6-link trace; per-`file` would interleave episodes and is the right pivot for *cross-checkpoint leakage* (sibling spec). **Defaulting to `episode`; needs confirmation from spec 02's model granularity.**
2. **Declared-model source of truth (spec 02):** does spec 02 serialize the checkpoint model as a `DFG`, a `PetriNet`, or a Declare model? The adapter (B7) and the `--checker` default (token vs alignment) depend on this. Token-replay needs a `DFG`; alignment needs a `PetriNet`.
3. **`precision`/`generalization`/`simplicity`:** `ConformanceResult` carries the fields but only `fitness` is computed (the `with_*` setters are unused, `conformance.rs:91-105`). Should the oracle compute precision for the verdict, or report `null` and gate on fitness + structural diff only? (Recommend the latter for v1 to avoid scope creep into structure map §8 #11.)
4. **Where does `OracleReport` physically live** — in `ocel-core` (so ggen can optionally deserialize it for typed assertions) or `wasm4pm-cli`-local (ggen treats stdout as opaque JSON)? `ocel-core` is cleaner but widens that crate's purpose beyond pure types.
5. **NDJSON importer dependency (sibling spec 01):** Proof A/B both require `import_ocel_ndjson` (`GGEN-NEEDS.md` §4a, structure map §3 — TO BE BUILT). This oracle is **blocked on spec 01** for live ggen logs; until then it can be exercised against whole-doc OCEL via `import_ocel_json` (`import/ocel/mod_ocel.rs:4`).

---

*Descriptive spec only. No Rust source, Cargo.toml, or existing file was modified. The single file written is `/Users/sac/wasm4pm/docs/ggen-oracle/03-conformance-and-discovery-oracle.md`.*
