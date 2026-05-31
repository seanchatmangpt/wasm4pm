# 07 — OCPQ: Object-Centric Process-Law Query Language

**Status:** Spec. Capability area: a small Object-Centric Process Query (OCPQ) language that **wasm4pm owns** and **ggen consumes via `wpm` as an external oracle** (ggen asks, wasm4pm adjudicates — NOT linked into ggen).
**Date:** 2026-05-30
**Version train:** `26.5.x` (workspace `26.5.29`, `Cargo.toml:7`).
**Authored by:** OCPQ spec author. Every "EXISTS" claim is cited to a real file/symbol read from `/Users/sac/wasm4pm`. Everything else is marked **TO BE BUILT**.

> **The leap:** wasm4pm today can replay a finished trace and audit a finished receipt. OCPQ is how ggen asks wasm4pm a *law* question — "REQUIRE `RouteSelected` BEFORE `RepairApplied`", "FORBID `ReceiptEmitted` WITHOUT `GatePassed`" — and gets back a machine-readable verdict (`Admitted`/`Refused`) with per-violation findings. OCPQ is the **declarative front-end** to the semantic-ordering / prefix / negative checks specced by the sibling docs; it is **not** a new mining engine. It compiles to `DeclareModel` constraints (which already exist) and to the live-trace evaluator (which is TO BE BUILT).

---

## 1. Purpose

ggen's living-LSP nerve emits a 6-link OCEL chain per repair episode:

```
DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted
```

(emitted by `/Users/sac/ggen/crates/ggen-lsp/src/intel/events.rs`). ggen knows **local** law. It does not — and per the boundary doctrine, must not — own **process** law. OCPQ is the contract by which ggen states a process law as a query string, ships its `.ocel.jsonl` tape, and `wpm` returns a verdict.

OCPQ deliberately covers a *small* operator set chosen to express exactly the living-loop law and its negatives:

| Operator | Plain meaning | Maps to |
|---|---|---|
| `REQUIRE A BEFORE B` | Every `B` for an object must be preceded by an `A` for that object. | Declare `Precedence(A,B)` (EXISTS, §3) |
| `FORBID B WITHOUT A` | A `B` may not occur unless some `A` occurred earlier in the same scope. | Declare `Precedence(A,B)` with refusal framing |
| `RESPONSE A THEN B` | Every `A` must eventually be followed by a `B`. | Declare `Response(A,B)` (EXISTS, §3) |
| `PRESERVE <set> ON <event>` | The named object-set must be present (re-observed) on `<event>` — used for "this URI must be re-observed". | OCEL relationship presence check (**TO BE BUILT**) |
| `FORBID X_GLOBAL_ACTIVE BEFORE Y_ALIVE` | A global/cross-checkpoint event may not precede the object reaching its ALIVE/terminal state — the "future checkpoint leaked into current gate" Andon. | Prefix/window scope + ordering (**TO BE BUILT**, depends on prefix spec) |
| `FOR checkpoint = "..."` | Scope clause: restrict evaluation to the window of one checkpoint. | Checkpoint scoping (**TO BE BUILT**, depends on cross-checkpoint-leakage spec) |

The verdict envelope mirrors the **existing** `ReceiptDoctor` refusal architecture (`wasm4pm/src/receipt.rs:62` `ReceiptFinding { code, json_path, message, severity }`, `:78` `ReceiptDoctorReport { state, findings, admitted }`) so the oracle's output shape is consistent across `wpm receipt` and `wpm ocpq`.

---

## 2. What EXISTS in wasm4pm to build on (cited) vs. TO BE BUILT

### 2.1 EXISTS — strong substrates

| Asset | Cite | What it gives OCPQ |
|---|---|---|
| **Declare conformance checker** | `wasm4pm/src/declare_conformance.rs:27` `check_declare_conformance(log_handle, declare_handle, activity_key)` | A working per-trace template evaluator. Supports **`Response`** (`:54`), **`Existence`** (`:70`), **`Absence`** (`:74`), **`Init`** (`:78`), **`Precedence`** (`:82`). `REQUIRE … BEFORE`, `FORBID … WITHOUT`, `RESPONSE … THEN` compile directly onto these. Returns per-constraint `{template, activities, support, violations, fitness}` + `avg_fitness` (`:136`). **NOTE: structure-map 00 said "no Declare checker found" — that is wrong; it exists.** |
| `DeclareModel` / `DeclareConstraint` | `crates/wasm4pm-types/src/models.rs:573` / `:555` `DeclareConstraint { constraint_type, activities, condition }`, serde-serializable | The **IR** OCPQ compiles to. (Field is `constraint_type`, not `template` — see §6.1 reconciliation note.) |
| **Object-graph query engine** | `wasm4pm/src/ocel_io.rs:258` `query_provenance_traversal(ocel_handle, query_json)`; `ProvenanceQuery` (`:228`), `TraversalStep` enum `ObjectToEvent`/`EventToObject`/`ObjectToObject` (`:204`), `PathNode` (`:237`), `ProvenanceQueryResult { paths }` (`:252`) | **The only existing OCEL query facility.** A JSON-driven object→event→object path walker. `PRESERVE <set> ON <event>` reuses its relationship/qualifier matching. The OCPQ JSON-AST should be a *sibling* of this serde-tagged-enum convention (`#[serde(tag="step_type")]`, `:203`). |
| Per-object temporal-order check | `wasm4pm/src/ocel_io.rs:413` `validate_ocel_object_lifecycles(&OCEL) -> Vec<LifecycleViolation>`; `LifecycleViolation` (`:399`) | Pure Rust. Detects "event B appears later for an object but has an earlier timestamp." The raw substrate under `BEFORE` ordering when evaluated by timestamp rather than log order. |
| Object-centric conformance (per-type fitness) | `wasm4pm/src/oc_conformance.rs:26` `oc_conformance_check_inner(&OCEL) -> Result<serde_json::Value,String>` | Pure-Rust, JSON-returning. Feeds the optional `conformance` block in the OCPQ report. |
| Flatten OCEL → per-type EventLog | `wasm4pm/src/oc_petri_net.rs:102` `flatten_ocel_to_eventlog_for_type` | The bridge that lets the trace-based Declare checker run over an OCEL log (Declare checker takes XES `EventLog`, not OCEL). |
| Refusal-finding report shape | `wasm4pm/src/receipt.rs:56`/`:62`/`:78` `FindingSeverity{Deny,Warning}`, `ReceiptFinding{code,json_path,message,severity}`, `ReceiptDoctorReport{state,findings,admitted}` | The **verdict envelope template** — copy it. |
| `wpm` CLI command tree + JSON convention | `crates/wasm4pm-cli/src/main.rs:27` `enum Commands`; `Autoprocess` uses `-f/--format human|json` (`:49`); `wpm receipt` returns JSON and exits non-zero on refusal (`receipt.rs:140`,`:186`) | The host for a new `wpm ocpq` subcommand and the exit-code/JSON convention to copy. |
| prolog8 bounded rule kernel | `crates/prolog8/src/lib.rs:48` `Kernel`, `Decision`, `QueryResult`; `replay` (`:49`) | **Optional future host** for OCPQ-as-rules with replayable proof receipts. Not required for v1 — noted as the long-term home if OCPQ grows past the fixed operator set (its byte-cap doctrine, `lib.rs:9-16`, suits a small operator set well). |

### 2.2 TO BE BUILT

| # | Capability | Why not covered today |
|---|---|---|
| T1 | **OCPQ grammar + parser** (EBNF → JSON-AST) | No query language exists. `ProvenanceQuery` is hand-authored JSON, not a surface syntax. |
| T2 | **`OcpqQuery` JSON-AST + compiler to `DeclareModel`** | No translation layer from operator clauses to `DeclareConstraint`. |
| T3 | **Object-scoped (not just trace-scoped) `BEFORE`/`WITHOUT` evaluation** | `check_declare_conformance` flattens to a *single* XES trace per log and checks activity order in that flat sequence. ggen's law is **per-object** (per `episode`/`file`), so the evaluator must group events by an OCPQ-named object type before applying the template. |
| T4 | **`PRESERVE <set> ON <event>`** | No "this event must carry these object refs" check. Built on `query_provenance_traversal` relationship matching. |
| T5 | **Checkpoint scoping `FOR checkpoint = "..."`** | No checkpoint/window concept. Depends on sibling **cross-checkpoint-leakage** spec for the windowing primitive. |
| T6 | **`FORBID X_GLOBAL_ACTIVE BEFORE Y_ALIVE`** | Requires both checkpoint scope (T5) and a notion of object terminal/ALIVE state. Depends on sibling **prefix/negative-conformance** spec for "ALIVE". |
| T7 | **`wpm ocpq` CLI subcommand + versioned JSON report envelope** | `wpm mining conformance` is mocked (`mining.rs` loads `DFG::new()`); there is no oracle subcommand. |
| T8 | **OCPQ refusal-code enum + findings** | `ReceiptTruthRefusal` is receipt-specific; OCPQ needs its own `OcpqRefusal` enum in the same shape. |

**Counts: EXISTS-to-build-on = 9 cited assets; TO BE BUILT = 8 capabilities (T1–T8).** No operator is fully built today; three (`REQUIRE/BEFORE`, `FORBID/WITHOUT`, `RESPONSE/THEN`) are *mostly* covered by the Declare checker once object-scoping (T3) is added.

---

## 3. The grammar (EBNF) — TO BE BUILT (T1)

A query is a list of clauses joined by an implicit AND. A query is `Admitted` iff every clause holds for every in-scope object. Surface syntax is whitespace-insensitive; identifiers are activity names (event types) or object-type names; string literals are double-quoted.

```ebnf
query            = clause , { ";" , clause } , [ ";" ] ;

clause           = scoped_clause | bare_clause ;
scoped_clause    = bare_clause , "FOR" , scope ;          (* FOR checkpoint = "C001" *)
scope            = "checkpoint" , "=" , string ;          (* T5 — checkpoint window *)

bare_clause      = require_before
                 | forbid_without
                 | response_then
                 | preserve_on
                 | forbid_global_before ;

require_before        = "REQUIRE" , activity , "BEFORE" , activity ;
forbid_without        = "FORBID"  , activity , "WITHOUT" , activity ;
response_then         = "RESPONSE", activity , "THEN"   , activity ;
preserve_on           = "PRESERVE", object_set , "ON" , activity ;
forbid_global_before  = "FORBID"  , global_marker , "BEFORE" , alive_marker ;

object_set       = object_type , { "," , object_type } ;
global_marker    = activity , "_GLOBAL_ACTIVE" ;          (* convention: a global/cross-window event *)
alive_marker     = object_type , "_ALIVE" ;               (* object reached terminal/ALIVE state *)

activity         = ident | string ;                       (* event type, e.g. RepairApplied *)
object_type      = ident | string ;                       (* OCEL object type, e.g. episode *)
ident            = letter , { letter | digit | "_" | "-" } ;
string           = '"' , { any_char_except_quote } , '"' ;
letter           = "A".."Z" | "a".."z" ;
digit            = "0".."9" ;
```

**Optional scope-binding** (which OCEL object type defines an "object" for `BEFORE`/`WITHOUT`): defaults to `episode` (ggen's per-repair object) and is overridable on the CLI via `--object-type` (§5), keeping the surface grammar minimal. This default is correct for the living-loop law because all 6 links share the same `episode` object.

---

## 4. JSON-AST + IR + evaluation semantics

### 4.1 JSON-AST (`OcpqQuery`) — TO BE BUILT (T2)

The parser lowers the surface grammar to this serde-tagged AST (convention copied from `TraversalStep`'s `#[serde(tag="step_type")]`, `ocel_io.rs:203`). Tools may also author this directly (skipping the parser):

```json
{
  "ocpq_version": "1.0",
  "object_type": "episode",
  "clauses": [
    { "op": "RequireBefore",  "a": "RouteSelected",  "b": "RepairApplied" },
    { "op": "ForbidWithout",  "b": "ReceiptEmitted", "a": "GatePassed" },
    { "op": "ResponseThen",   "a": "DiagnosticRaised","b": "ReceiptEmitted" },
    { "op": "PreserveOn",     "object_set": ["file","diagnostic_code"], "on": "RepairApplied" },
    { "op": "ForbidGlobalBefore", "global": "GateActivated", "alive": "episode",
      "scope": { "checkpoint": "GGEN-TPL-001" } }
  ]
}
```

### 4.2 IR — compile to `DeclareModel` where possible (T2)

`RequireBefore`/`ForbidWithout` → `DeclareConstraint { constraint_type: "Precedence", activities: [a,b], condition: "" }`.
`ResponseThen` → `DeclareConstraint { constraint_type: "Response", activities: [a,b], condition: "" }`.
(`DeclareConstraint` is `models.rs:555`; the existing checker keys on `template` while the type field is `constraint_type` — see §6.1.)

`PreserveOn`, `ForbidGlobalBefore` have **no Declare template** and are evaluated by the native OCPQ evaluator (T4/T6).

### 4.3 Evaluation semantics over an OCEL log + checkpoint scope — TO BE BUILT (T3–T6)

Input: an `OCEL` (canonical shape 2.A from structure-map §2.A, produced by the NDJSON importer specced in sibling doc 03/04). Evaluation is **object-scoped**, unlike the existing trace-flattening checker.

**Step 0 — scope.** If a clause carries `scope.checkpoint = "C"`, restrict the event set to events whose checkpoint attribute equals `"C"` (ggen tags events with the diagnostic code, e.g. `GGEN-TPL-001`, which serves as the checkpoint key). The windowing primitive comes from the cross-checkpoint-leakage sibling spec (T5).

**Step 1 — partition.** Group in-scope events by their relationship to objects of `object_type` (default `episode`). For each such object *o*, build its **event projection** `E(o)` = the in-scope events that reference *o*, ordered by `(time, log-arrival-index)`. Order is `time`-primary (using `validate_ocel_object_lifecycles` parsing, `ocel_io.rs:419`) with arrival index as deterministic tie-break; an out-of-order timestamp is itself reported (see T3 caveat below).

**Step 2 — evaluate clauses against each `E(o)`:**

| Clause | Holds for object *o* iff … | Violation finding |
|---|---|---|
| `RequireBefore(a,b)` | for every `b` at index *i* in `E(o)`, some `a` occurs at index `< i`. | `code=RequireBeforeViolated`, `json_path=$.objects['<o>'].events[<i>]` |
| `ForbidWithout(b,a)` | identical predicate to `RequireBefore(a,b)` but framed as a prohibition (no `b` without a prior `a`). | `code=ForbidWithoutViolated` |
| `ResponseThen(a,b)` | for every `a` at index *i*, some `b` occurs at index `> i`. | `code=ResponseUnfulfilled` |
| `PreserveOn(set,on)` | every event of type `on` in `E(o)` carries a relationship to **every** object type in `set`. | `code=PreserveSetMissing`, `json_path=$.events[<id>].relationships` |
| `ForbidGlobalBefore(g,alive)` | no event of type `g` occurs before the object reaches its `alive` (terminal) state. "Terminal/ALIVE" is supplied by the prefix sibling spec; absent that, v1 treats the object's last in-scope event as ALIVE and reports `g` after it as a leak. | `code=GlobalBeforeAliveLeak` |

**Step 3 — verdict.** A query is `Admitted` iff `findings` contains zero `Deny`-severity findings. `Warning` findings (e.g. a `ResponseThen` unfulfilled only because the trace is a live *prefix* still in progress — see §6.2) do not refuse. The aggregate `Admitted/Refused` matches `ReceiptDoctorState` (`receipt.rs:71`).

> **T3 caveat (object-scoping is the real new work):** the existing `check_declare_conformance` (`declare_conformance.rs:45`) iterates `log.traces`, treating each trace as one flat activity sequence. ggen's OCEL is one log with many `episode` objects interleaved. The evaluator must therefore **flatten per object** (reuse `flatten_ocel_to_eventlog_for_type`, `oc_petri_net.rs:102`, with `object_type=episode`) and then either (a) feed each per-object trace to the existing Declare checker, or (b) implement the four-line predicates directly in pure Rust in `wasm4pm-algos`. Option (b) is recommended for `PreserveOn`/`ForbidGlobalBefore` which have no Declare template anyway.

---

## 5. The `wpm` CLI surface + JSON report schema — TO BE BUILT (T7/T8)

A new subcommand under `Commands` (`main.rs:27`), following the `Autoprocess` `-f/--format` convention (`main.rs:49`) and the `wpm receipt` exit-code convention (non-zero on refusal, `receipt.rs:186`).

```text
wpm ocpq [OPTIONS] -i <LOG.ocel.jsonl>
  -q, --query <STR>           Inline OCPQ query string (surface grammar §3).
  -Q, --query-file <PATH>     OCPQ query from file (string) or JSON-AST (.json).
  -i, --input <PATH>          OCEL log: .ocel.jsonl (NDJSON) or .json (whole-doc).
      --object-type <TYPE>    Object type that scopes BEFORE/WITHOUT (default: episode).
      --checkpoint <STR>      Override/limit evaluation to one checkpoint window.
  -f, --format <human|json>   Default human; ggen always passes json.
      --strict                Treat Warning findings as Deny (refuse on prefix gaps too).
```

Argument shape mirrors `MiningCommands::Conformance { log, model, activity_key }` (`mining.rs:30`). Implementation lives in `crates/wasm4pm-cli/src/commands/ocpq.rs`; the evaluator core lives in **`wasm4pm-algos`** (pure Rust, link-safe — structure-map §1) so it is callable without the `wasm-bindgen` engine.

### 5.1 JSON report envelope (one stable, versioned shape)

```json
{
  "ocpq_report_version": "1.0",
  "engine": "wasm4pm",
  "engine_version": "26.5.29",
  "query": { "source": "REQUIRE RouteSelected BEFORE RepairApplied", "object_type": "episode" },
  "input": { "path": ".ggen/ocel/agent-edit-events.ocel.jsonl", "events": 6, "objects": 4 },
  "state": "Refused",
  "admitted": false,
  "findings": [
    {
      "code": "ForbidWithoutViolated",
      "severity": "Deny",
      "json_path": "$.objects['episode:GGEN-TPL-001#1'].events[4]",
      "message": "ReceiptEmitted occurred for episode 'GGEN-TPL-001#1' with no preceding GatePassed",
      "object_id": "episode:GGEN-TPL-001#1",
      "offending_event_id": "<blake3-event-id>",
      "clause": { "op": "ForbidWithout", "b": "ReceiptEmitted", "a": "GatePassed" }
    }
  ],
  "summary": { "objects_evaluated": 4, "clauses": 3, "deny": 1, "warning": 0 }
}
```

`state`/`admitted` reuse `ReceiptDoctorState`/`ReceiptDoctorReport` semantics (`receipt.rs:71`/`:78`). `findings[].{code,severity,json_path,message}` reuse `ReceiptFinding` (`receipt.rs:62`) plus three OCPQ-specific fields (`object_id`, `offending_event_id`, `clause`). Exit code: `0` when `admitted=true`, non-zero when refused (so ggen's Chicago-TDD subprocess oracle can rely on exit-code *and* parse stdout JSON).

### 5.2 Refusal-code enum (T8)

```rust
// proposed: wasm4pm-algos::ocpq::OcpqRefusal  (mirrors receipt.rs:33 ReceiptTruthRefusal)
pub enum OcpqRefusal {
    RequireBeforeViolated,   // an A->B precedence broken for an object
    ForbidWithoutViolated,   // a B occurred with no prior A
    ResponseUnfulfilled,     // an A never followed by a B (Deny only with --strict / completed object)
    PreserveSetMissing,      // PRESERVE set not carried on the named event
    GlobalBeforeAliveLeak,   // a global/future event preceded ALIVE — the checkpoint-leak Andon
    ParseError,              // OCPQ query failed to parse
    UnknownActivity,         // clause names an activity absent from the log's event types
    EmptyScope,              // FOR checkpoint matched no events
}
```

---

## 6. Worked queries — the living-loop law verbatim

Object type for all of these is `episode` (ggen's per-repair object; the 6-link chain shares one `episode`). Activity names are ggen's verbatim event types from `intel/events.rs`.

### Q1 — Full chain ordering (the core law)

```text
REQUIRE DiagnosticRaised BEFORE RouteSelected;
REQUIRE RouteSelected    BEFORE RepairSuggested;
REQUIRE RepairSuggested  BEFORE RepairApplied;
REQUIRE RepairApplied    BEFORE GatePassed;
REQUIRE GatePassed       BEFORE ReceiptEmitted
```
Compiles to five `Precedence` `DeclareConstraint`s. `Admitted` iff every `episode` walks the chain in order. This is the positive form of the living-loop law.

### Q2 — No receipt without a passed gate (the receipt-causality Andon)

```text
FORBID ReceiptEmitted WITHOUT GatePassed
```
Refuses with `ForbidWithoutViolated` if a `ReceiptEmitted` event exists for an `episode` that never saw `GatePassed` — i.e. "ReceiptEmitted before GatePassed". Directly answers the user's vision item *"ReceiptEmitted before GatePassed"*.

### Q3 — No repair without a routed obligation

```text
FORBID RepairApplied WITHOUT RouteSelected
```
Refuses with `ForbidWithoutViolated` for the *"repair without routed obligation"* case: a `RepairApplied` with no preceding `RouteSelected` for that episode.

### Q4 — Every diagnostic must eventually close (response), and re-observe its evidence

```text
RESPONSE DiagnosticRaised THEN ReceiptEmitted;
PRESERVE file, diagnostic_code ON RepairApplied
```
`ResponseThen` ⇒ every raised diagnostic eventually emits a receipt (a completed, in-history episode; for a live prefix this is a `Warning` not a `Deny` unless `--strict`). `PreserveOn` ⇒ the `RepairApplied` event must carry relationships to both the `file` and `diagnostic_code` objects ("this URI must be re-observed"), exercising T4 over the `query_provenance_traversal` relationship matcher.

### Q5 — No future checkpoint may leak into the current gate

```text
FORBID Gate_GLOBAL_ACTIVE BEFORE episode_ALIVE FOR checkpoint = "GGEN-TPL-001"
```
Scopes evaluation to the `GGEN-TPL-001` checkpoint window (T5), then refuses with `GlobalBeforeAliveLeak` if a global/cross-window gate event appears before the episode reaches ALIVE — the *"future checkpoint event polluted current gate"* Andon. This clause depends on the prefix sibling spec for the ALIVE definition and the leakage sibling spec for the window primitive; until those land, v1 evaluates ALIVE as the episode's last in-scope event (documented degraded mode).

---

## 7. Mapping onto existing crates + `wpm`

| Layer | Home | Rationale |
|---|---|---|
| Grammar/parser (T1), JSON-AST `OcpqQuery` (T2), evaluator (T3–T6), `OcpqRefusal` (T8) | **new module `wasm4pm-algos::ocpq`** | `wasm4pm-algos` is pure Rust, no `wasm-bindgen` (structure-map §1) → reachable from the CLI subprocess. Re-exports `wasm4pm_types` already (`algos/lib.rs:18`), giving it `DeclareModel`/`OCEL`. |
| Compile-to-Declare + reuse of templates | call existing `DeclareConstraint` (`models.rs:555`); optionally reuse the predicate bodies from `declare_conformance.rs:54-98` | Avoids reimplementing Precedence/Response logic. |
| Per-object flatten | `flatten_ocel_to_eventlog_for_type` (`oc_petri_net.rs:102`) — needs a pure-Rust seam if currently `JsValue`-bound | The object-scoping bridge (T3). |
| PRESERVE relationship matching | pattern from `query_provenance_traversal` (`ocel_io.rs:258`) | Reuse, don't reinvent, OCEL relationship/qualifier traversal. |
| ALIVE / prefix-completability, checkpoint window | **sibling specs** (prefix/negative; cross-checkpoint-leakage) | OCPQ consumes their primitives; does not own them. |
| CLI `wpm ocpq` (T7) | `crates/wasm4pm-cli/src/commands/ocpq.rs` + arm in `main.rs:27` | Mirrors `Autoprocess` `-f json` + `wpm receipt` exit convention. |
| Tests | `crates/wasm4pm-cli/tests/cli_tests.rs` (`assert_cmd` + `predicates`, structure-map §6) | Chicago-style subprocess tests. |

### 6.1 Reconciliation notes (must be honored)
- **`template` vs `constraint_type`:** `check_declare_conformance` matches on `constraint.template` (`declare_conformance.rs:53`) but the type field is `DeclareConstraint.constraint_type` (`models.rs:556`). This is an existing in-tree inconsistency; the OCPQ compiler must populate whichever field the chosen checker path reads, and the builder should resolve the mismatch in one coordinated patch (do not paper over it).
- **`wasm-bindgen` seam:** `check_declare_conformance`, `flatten_ocel_to_eventlog_for_type`, and `query_provenance_traversal` are `#[wasm_bindgen]` and `JsValue`-returning. OCPQ must NOT call them through wasm; the builder extracts pure-Rust `*_inner` seams (precedent: `oc_conformance_check_inner`, `oc_conformance.rs:26`) or reimplements the four small predicates in `wasm4pm-algos::ocpq` directly. Reimplementing is acceptable and likely cleaner for the fixed operator set.
- **Serialized-name constraint:** OCPQ reads ggen's emitted `activity` field as the event type. The evaluator must accept either `"type"` (canonical 2.A) or `"activity"` (ggen/2.C) — same `#[serde(alias="activity")]` reconciliation recommended in structure-map §9.2. The worked queries above use ggen's verbatim activity strings (`DiagnosticRaised`, …) so the grep-based ggen proof tests (GGEN-NEEDS §3.1) remain valid.

---

## 8. ggen-side consumption contract (external `wpm` oracle)

ggen does **not** link OCPQ. It invokes `wpm ocpq` as a subprocess and parses stdout JSON:

```text
$ wpm ocpq \
    -q 'FORBID ReceiptEmitted WITHOUT GatePassed' \
    -i .ggen/ocel/agent-edit-events.ocel.jsonl \
    --object-type episode \
    -f json
# stdout: §5.1 report envelope; exit 0 if admitted, non-zero if refused.
```

- ggen holds the **query strings** (they encode ggen's local law) and ships the **OCEL tape**. wasm4pm holds the **evaluator** and returns the **verdict**. ggen asks; wasm4pm adjudicates.
- ggen consumes only: the exit code (fast Andon STOP/GO) and the parsed `findings[]` (which `episode`/event violated which clause, for surfacing as an LSP diagnostic).
- This honors GGEN-NEEDS §5: only `ocel-core` is a *linked* dependency; everything else (including OCPQ) is the external `wpm` oracle, matching ggen's Chicago-TDD doctrine (real external boundary, externalizable JSON evidence).

---

## 9. Fixtures — TO BE BUILT (place in `fixtures/real/ocpq-living-loop/`)

Reuse the `fixtures/real/<scenario>/` convention (structure-map §6). The existing `trace-conform-agent-proof-lifecycle` fixture is a structural sibling (`collect_evidence→verify_evidence→emit_receipt`); add an OCPQ scenario:

**`query.ocpq`** (surface):
```text
REQUIRE GatePassed BEFORE ReceiptEmitted;
FORBID  ReceiptEmitted WITHOUT GatePassed
```

**`good.ocel.jsonl`** (admitted — one well-formed episode, ggen's 2.D/2.C shape):
```jsonl
{"ocel_version":"2.0","event_id":"e0","activity":"DiagnosticRaised","timestamp":"2026-05-30T10:00:00Z","objects":[{"id":"episode:GGEN-TPL-001#1","type":"episode"},{"id":"item.tera","type":"file"},{"id":"GGEN-TPL-001","type":"diagnostic_code"}],"attributes":{"code":"GGEN-TPL-001"}}
{"event_id":"e1","activity":"RouteSelected","timestamp":"2026-05-30T10:00:01Z","objects":[{"id":"episode:GGEN-TPL-001#1","type":"episode"}],"attributes":{}}
{"event_id":"e2","activity":"RepairSuggested","timestamp":"2026-05-30T10:00:02Z","objects":[{"id":"episode:GGEN-TPL-001#1","type":"episode"}],"attributes":{}}
{"event_id":"e3","activity":"RepairApplied","timestamp":"2026-05-30T10:00:03Z","objects":[{"id":"episode:GGEN-TPL-001#1","type":"episode"},{"id":"item.tera","type":"file"},{"id":"GGEN-TPL-001","type":"diagnostic_code"}],"attributes":{}}
{"event_id":"e4","activity":"GatePassed","timestamp":"2026-05-30T10:00:04Z","objects":[{"id":"episode:GGEN-TPL-001#1","type":"episode"}],"attributes":{}}
{"event_id":"e5","activity":"ReceiptEmitted","timestamp":"2026-05-30T10:00:05Z","objects":[{"id":"episode:GGEN-TPL-001#1","type":"episode"}],"attributes":{}}
```

**`bad-receipt-before-gate.ocel.jsonl`** (refused — `ReceiptEmitted` with no `GatePassed`): same as `good` but with `e4` (`GatePassed`) removed. Expected `state:"Refused"`, one `ForbidWithoutViolated` Deny finding on `e5`.

**`expected-good.json`** / **`expected-bad.json`**: the §5.1 report envelopes the CLI must produce for each input.

---

## 10. Acceptance criteria (wasm4pm builders can verify)

1. **Grammar/parser (T1):** `wasm4pm-algos::ocpq` parses all five operators in §3; a malformed query yields `OcpqRefusal::ParseError`, never a panic. Unit tests in the module (no mocks, real strings).
2. **Compiler (T2):** `RequireBefore/ForbidWithout/ResponseThen` compile to the correct `DeclareConstraint{constraint_type, activities}`; round-trips through serde.
3. **Object-scoped evaluation (T3):** given `good.ocel.jsonl`, Q1+Q2 return `state:"Admitted"`, `findings:[]`. Given `bad-receipt-before-gate.ocel.jsonl`, Q2 returns `state:"Refused"` with exactly one `ForbidWithoutViolated` Deny finding naming `episode:GGEN-TPL-001#1` and event `e5`.
4. **PRESERVE (T4):** Q4's `PRESERVE file, diagnostic_code ON RepairApplied` passes on `good` (`e3` carries both) and refuses on a mutant where `e3` drops the `file` relationship.
5. **CLI (T7) + envelope (§5.1):** `wpm ocpq -q '…' -i good.ocel.jsonl -f json` exits 0 and prints a report matching `expected-good.json`; the bad input exits non-zero and matches `expected-bad.json`. Verified by `assert_cmd` in `crates/wasm4pm-cli/tests/cli_tests.rs`.
6. **Refusal-code stability (T8):** `OcpqRefusal` serializes to the exact code strings in §5.2; ggen pins these strings.
7. **No-wasm seam:** `wasm4pm-algos::ocpq` compiles and the CLI runs without the `wasm-bindgen` engine crate in the dependency path (link-safe), confirming OCPQ is reachable as a pure-Rust subprocess oracle.
8. **Proof obligation (closes GGEN-NEEDS §7 #6 for the law direction):** ggen's real `.ggen/ocel/agent-edit-events.ocel.jsonl` 6-link tape, run through Q1+Q2+Q3 via `wpm ocpq`, returns `Admitted` — proving the living-loop law holds and ggen needs no local ordering checker.
9. **Scoping/leak (T5/T6) — staged:** Q5 evaluates without panic in degraded mode (ALIVE = last in-scope event); marked `Warning` (not gating) until the prefix + leakage sibling specs land, at which point Q5 must produce `GlobalBeforeAliveLeak` on a fixture where a global gate event precedes ALIVE.
10. **No regressions:** existing `wpm` commands and the full wasm4pm suite stay green; new crate/module uses `version.workspace = true` (structure-map §7 drift warning).

---

## 11. Open questions (for ggen / sibling-spec authors)

1. **ALIVE definition** (blocks Q5 fully): the prefix/negative sibling spec must define when an `episode` is terminal/ALIVE. Is `ReceiptEmitted` the terminal event, or is there a distinct ALIVE marker?
2. **Checkpoint key:** confirm ggen tags every event with the diagnostic code (`GGEN-TPL-001`) as the checkpoint discriminator, or whether a separate checkpoint object/attribute is emitted. The `FOR checkpoint=` scope (T5) keys on this.
3. **`template` vs `constraint_type`:** which field should the OCPQ compiler populate? (§6.1) — needs a one-shot reconciliation decision from the wasm4pm builders.
4. **Live-prefix vs completed-history:** should `ResponseThen` refuse on an in-progress episode (no receipt yet), or only `Warn`? Spec defaults to `Warn` unless `--strict`; confirm this matches ggen's Andon expectation.
5. **prolog8 future:** is OCPQ-as-prolog8-rules (replayable proof receipts, `prolog8::Kernel`) a desired v2, or does the fixed operator set stay hardcoded in `wasm4pm-algos::ocpq`?
