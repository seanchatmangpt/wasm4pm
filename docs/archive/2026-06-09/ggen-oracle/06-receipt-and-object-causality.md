# 06 — Receipt Causality + Object-Centric Causality Queries

**Status:** Spec. Buildable by the wasm4pm agent system against version train `26.5.x`.
**Date:** 2026-05-30
**Capability area:** Receipt-as-process-law-witness; the cross-agent object graph; object-centric provenance/causality queries.
**Ground truth:** `docs/ggen-oracle/00-STRUCTURE-MAP.md`. Every wasm4pm claim below is cited `file:line` or `file:symbol`, read from `/Users/sac/wasm4pm`. ggen claims cited from `/Users/sac/ggen`. Capabilities that do not yet exist are marked **TO BE BUILT**.
**Boundary:** ggen emits the OCEL tape and asks; **wasm4pm adjudicates**. ggen links only `ocel-core` types; everything in this spec is consumed via the `wpm` CLI as an external oracle (subprocess → machine-readable JSON).

> **The leap this spec encodes.** Today wasm4pm can *traverse* a finished object graph (`query_provenance_traversal`, `ocel_io.rs:258`) and *judge a finished receipt envelope* (`ReceiptDoctor`, `receipt.rs:284+`). It cannot yet say: "this `ReceiptEmitted` has **no** `GatePassed` predecessor in its own episode" or "this `RepairApplied` carried **no** routed obligation" or "this receipt's residual diagnostic set was never preserved across the gate." This spec turns the receipt from a *log entry* into a **process-law witness** and provides the object-centric causality queries that make the cross-agent graph interrogable.

---

## 1. Purpose

Two halves, one engine:

1. **Receipt causality (the witness contract).** Bind each `ReceiptEmitted` event to its full process context — diagnostic key, route, pending repair, source surface, repair surface, residual diagnostic set, gate result, source-graph state, and commit/checkpoint identity — so the oracle can answer *lineage* and *missing-predecessor* questions and refuse receipts that witness an unlawful history.
2. **Object-centric causality queries.** Specify the cross-agent OCEL object graph (`agent → file → species → route → proof-lane → receipt → checkpoint → branch → commit`) using `ocel-core`'s `OCELRelationship`/`OCELObject` types, and a catalog of object-centric questions (which agent touched this route? which species loops most? which files repeatedly trip Andon? which receipt depends on which source-law repair?).

Both halves consume **one** artifact: ggen's append-only tape at `.ggen/ocel/agent-edit-events.ocel.jsonl`. Both are reachable through one new `wpm` subcommand surface.

---

## 2. EXISTS in wasm4pm (build on this) vs TO BE BUILT

### 2.1 EXISTS — reusable substrate (cited)

| Asset | Citation | Reuse for this spec |
|---|---|---|
| Object-graph traversal engine | `wasm4pm/src/ocel_io.rs:258` `query_provenance_traversal(ocel_handle, query_json)`; `ProvenanceQuery` (`:228`), `TraversalStep{ObjectToEvent,EventToObject,ObjectToObject}` (`:204`), `PathNode{Object,Event}` (`:237`), `ProvenanceQueryResult{paths}` (`:252`) | The **lineage / object-causality query engine already exists.** It walks object→event→object and object→object(forward/reverse/both) over the  OCEL (shape 2.B). The object-causality catalog (§6) is expressed as `ProvenanceQuery` programs. Logic is pure Rust inside the `with_object` closure — extract to a pure fn for CLI reuse. |
| Per-object temporal-order check | `ocel_io.rs:413` `validate_ocel_object_lifecycles(&OCEL)->Vec<LifecycleViolation>`; `LifecycleViolation{object_id,event_a_id,event_b_id,timestamp_a_ms,timestamp_b_ms}` (`:399`); ISO-8601 parse `parse_ts_ms` (`:419`) | Seed of receipt-causality. It already detects "event B for an object appears later but is timestamped earlier." The 6-link ordering law (§4) is a *semantic* layer on top of this raw temporal check. |
| Receipt refusal architecture | `wasm4pm/src/receipt.rs`: `OCELReceiptLinter::lint` (`:287`), `ReceiptDoctor::audit`/`verify_with_audience` (cited in 00-MAP §4.3). Findings types live in **`crates/ocel-core/src/intake.rs`**: `ReceiptTruthRefusal` (`:33`), `FindingSeverity{Deny,Warning}` (`:56`), `ReceiptFinding{code,json_path,message,severity}` (`:63`), `ReceiptDoctorState{Admitted,Refused}` (`:71`), `ReceiptDoctorReport{state,findings,admitted}` (`:78`) | **Copy this shape exactly** for the new oracle verdict. The finding/refusal pattern is already in the link-safe `ocel-core` crate — the new receipt-causality refusals extend the same family. |
| OCEL object & relationship types | `crates/ocel-core/src/lib.rs`: `OCELObject{id,object_type,attributes,relationships}` (`:58`), `OCELRelationship{object_id,qualifier}` (`:51`), `OCELEvent{id,event_type,time,attributes,relationships}` (`:39`) | The cross-agent object graph (§5) is declared in these types. ggen's `objects: Vec<OcelObjectRef{id,type,qualifier}>` maps onto event `relationships`. |
| NDJSON intake | `crates/ocel-core/src/intake.rs:41` `NDJsonStream<R: BufRead>` (yields `OCELRecord{Event,Object}`), `ExtractionPlan` (`:14`) | Reads ggen's `.ocel.jsonl` directly, one record/line, tolerant of filters. This is the front door for the oracle. (The 00-MAP marked NDJSON "TO BE BUILT" — it now **EXISTS** in `ocel-core`. Confirm against `intake.rs` before re-implementing.) |
|  OCEL graph fields the traversal needs | `wasm4pm/src/models.rs`: `OCELObjectRelation{source_id,target_id,qualifier}` (`:631`), `OCELObject.embedded_relations: Vec<OCELObjectRelRef>` (`:707`), `OCEL.object_relations` (`:727`), `OCELEvent.object_refs` (`:659`), `all_object_ids()` (`:664`) | `query_provenance_traversal` reads these (`ocel_io.rs:296-305` merges global + embedded O2O). The object-causality queries depend on object→object edges existing — see §5.3 for what ggen must emit. |
| BLAKE3 / canonical hashing | `ocel-core/src/intake.rs:164` `compute_blake3_hash`; truex `canonical_stringify` (`crates/wasm4pm-algos/src/truex/canonicalize.rs:3`) | Receipt-lineage chaining (`previous_receipt_id`) and tape-integrity hashing align with ggen's existing BLAKE3 `event_id`/`receipt_id` derivation (`ggen .../intel/events.rs:81,92`). |

### 2.2 TO BE BUILT (this spec defines them)

| # | Capability | Why it does not exist | Home |
|---|---|---|---|
| B1 | **6-link activity-ordering law checker** — per-episode, enforce `DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted` | Only raw temporal monotonicity exists (`validate_ocel_object_lifecycles`), no activity-precedence law. `DeclareModel`/`DeclareConstraint` *types* exist (`models.rs:555/573`) but no Declare checker. | `wasm4pm-algos` (pure) |
| B2 | **Receipt-causality oracle** — for each `ReceiptEmitted`, verify required predecessors present in its episode, in order, with no missing/duplicate links | No predecessor enforcement exists on a live trace. | `wasm4pm-algos` |
| B3 | **Receipt witness-binding check** — every binding field (§3) present and internally consistent (gate result matches `GatePassed`, route matches `RouteSelected`, residual set preserved). | No notion of a receipt's "binding contract." | `wasm4pm-algos` |
| B4 | **Residual-preservation check** — residual diagnostic set declared at the gate must be the set the receipt witnesses; a receipt may not "shrink" residuals it did not resolve. | No residual concept anywhere in wasm4pm. | `wasm4pm-algos` |
| B5 | **Object-causality query catalog** — named, parameterized `ProvenanceQuery` programs for the §6 questions, with aggregation (counts/loops). | Engine exists; the *catalog* and *aggregation* do not. | `wasm4pm-algos` + thin CLI |
| B6 | **`wpm oracle` CLI surface** — `receipt-causality`, `object-causality`, `attest` subcommands emitting one versioned JSON envelope; non-zero exit on refusal. | No oracle command; `wpm mining conformance` is mocked (`mining.rs:75 DFG::new()`). | `wasm4pm-cli` |
| B7 | **ggen-side emission additions** (§5.3, §7) so the queries are answerable — checkpoint/branch/commit objects, proof-lane object, residual attribute, receipt-lineage attribute, source/repair surface qualifiers. | ggen emits file/diag/episode/route/receipt/agent only (`intel/events.rs:38-52`). | ggen (coordinated) |

**Tally for this area: 6 reusable assets EXIST · 7 items TO BE BUILT (B1–B7).**

---

## 3. The receipt witness contract

A `ReceiptEmitted` event is a *witness* that a lawful episode closed. Today ggen's `receipt_emitted` (`ggen .../intel/events.rs:300`) carries only `receipt_id` (attribute) + a `receipt` object + the standard episode objects (`file`, `diagnostic_code`, `episode`). That is insufficient to adjudicate process law. The witness contract below is the **target binding** the oracle checks; §5.3/§7 say what ggen must add.

### 3.1 Binding fields (what a `ReceiptEmitted` must witness)

| Binding | Carried as | Source in the 6-link chain | Oracle uses it for |
|---|---|---|---|
| **diagnostic key** | `relationship` to `diagnostic_code` object (qualifier `diag`) + `episode` object (qualifier `episode`) | `DiagnosticRaised` | lineage root; missing → orphan receipt |
| **route** | attribute `route` + `relationship` to `repair_route` object (qualifier `route`) | `RouteSelected` | B3 route-consistency |
| **pending repair** | `relationship` chain through `RepairSuggested`/`RepairApplied` in same episode | `RepairSuggested`→`RepairApplied` | B2 predecessor; repair-without-route refusal |
| **source surface** | attribute `source_surface` (the law-surface file/URI the diagnostic was raised on) + relationship to `file` with qualifier `source` | `DiagnosticRaised`.objects | object-causality slicing; cross-surface checks |
| **repair surface** | attribute `repair_surface` + relationship to `file` with qualifier `repair` (may equal source surface) | `RepairApplied`.objects | B3; detect repair landing on wrong surface |
| **residual diagnostic set** | attribute `residual` = sorted list of codes still open after the gate (JSON array string) | `GatePassed`/`GateFailed` | **B4** residual-preservation |
| **gate result** | attribute `gate_result` ∈ {`passed`,`failed`} + `error_count` | `GatePassed`/`GateFailed` | B3 gate-consistency; a `passed` receipt with non-empty unrelated residuals is suspect |
| **source-graph state** | attribute `source_graph_hash` (BLAKE3 of the RDF/source graph the gate ran against) | gate run | drift detection; receipt witnesses *which* graph state |
| **commit / checkpoint identity** | `relationship`s to `checkpoint`, `branch`, `commit` objects (qualifiers `checkpoint`,`branch`,`commit`) | session/CI context | **cross-checkpoint leakage** (sibling spec) + lineage |
| **receipt lineage** | attribute `previous_receipt_id` (BLAKE3, or `""` for episode-genesis) | prior `ReceiptEmitted` in same checkpoint | B2 lineage chain |

> **Serialized-name constraint (GGEN-NEEDS §3.1).** New fields are **additive** — they are extra `attributes` keys and extra entries in `objects`/`relationships`. They do **not** rename `"activity"`, the object `id`, or the code, so ggen's Gall proof greps (`"activity":"ReceiptEmitted"`, the `item.tera` id substring, `GGEN-TPL-001`) keep passing. ggen must coordinate adding the new keys/objects (§7) but no existing assertion breaks.

### 3.2 Receipt witness schema (oracle-side view, derived from the tape)

The oracle materializes one `ReceiptWitness` per `ReceiptEmitted` event by walking the episode. **TO BE BUILT** in `wasm4pm-algos`:

```rust
// crates/wasm4pm-algos/src/oracle/receipt_witness.rs   (TO BE BUILT)
#[derive(serde::Serialize)]
pub struct ReceiptWitness {
    pub receipt_id: String,
    pub episode_id: String,
    pub diagnostic_code: String,
    pub route: Option<String>,
    pub source_surface: Option<String>,
    pub repair_surface: Option<String>,
    pub residual: Vec<String>,            // codes still open per the gate
    pub gate_result: Option<String>,      // "passed" | "failed"
    pub error_count: Option<u64>,
    pub source_graph_hash: Option<String>,
    pub checkpoint: Option<String>,
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub previous_receipt_id: Option<String>,
    pub predecessors: Vec<String>,        // ordered activity names found in-episode
    pub event_id: String,                 // the ReceiptEmitted event id
}
```

`ReceiptWitness` is built deterministically from `ocel-core::OCEL` (after NDJSON intake) by grouping events on the `episode` object id and collecting per-binding fields. It is the input to every receipt-causality check.

---

## 4. The 6-link activity-ordering law (B1)

Encode the chain as a precedence relation over activities, scoped per **episode** (the case id = ggen's `episode` object, `blake3(file‖code‖run_id)`, `intel/events.rs:92`).

```
REQUIRED_CHAIN = [
  DiagnosticRaised, RouteSelected, RepairSuggested,
  RepairApplied, GatePassed, ReceiptEmitted
]
```

Law (each clause is a `DeclareConstraint`-style rule; `models.rs:573` provides the type, the *checker* is B1):

| Rule | Statement | Refusal if violated |
|---|---|---|
| **R1 Precedence** | `ReceiptEmitted` may occur only if a `GatePassed` for the same episode precedes it (by timestamp **and** arrival order). | `ReceiptBeforeGatePassed` |
| **R2 RouteBeforeRepair** | `RepairApplied` may occur only if a `RouteSelected` for the same episode precedes it. | `RepairWithoutRoute` |
| **R3 SuggestBeforeApply** | `RepairApplied` requires a prior `RepairSuggested` (same route, same episode). | `RepairWithoutSuggestion` |
| **R4 RootedInDiagnostic** | every episode containing any link event must begin with `DiagnosticRaised`. | `EpisodeNotRootedInDiagnostic` |
| **R5 GateAfterRepair** | a `GatePassed`/`GateFailed` must follow a `RepairApplied` *or* be the genesis gate of the episode (re-observation). | `GateWithoutRepair` (Warning when re-observation) |
| **R6 NoForbiddenSkip** | no `ReceiptEmitted` without the full predecessor set `{DiagnosticRaised, RouteSelected, RepairApplied, GatePassed}` present in-episode. | `ReceiptMissingPredecessor` (carries the missing set) |

`RefusalEmitted` (`intel/events.rs:343`) and `GateFailed` are **lawful terminals** — an episode may close on refusal/failure with **no** `ReceiptEmitted`; that is admitted, not a violation. The law only constrains episodes that *do* emit a receipt.

`#[ignore]`-free pure-Rust signature (B1):

```rust
// crates/wasm4pm-algos/src/oracle/ordering_law.rs   (TO BE BUILT)
pub struct OrderingViolation { pub episode_id: String, pub rule: &'static str,
                               pub refusal: OracleRefusal, pub detail: String }
pub fn check_ordering_law(ocel: &wasm4pm_compat::ocel::OCEL) -> Vec<OrderingViolation>;
```

---

## 5. The cross-agent object graph

### 5.1 Object types (declared in the tape's `objectTypes`)

| Object type | ggen status | Carrier |
|---|---|---|
| `agent` | EXISTS | `intel/events.rs:38`, attached by `attach_attribution` (`:213`) |
| `file` | EXISTS | `intel/events.rs:42`, `file_ref` (`:116`) |
| `diagnostic_code` (the **species**) | EXISTS | `intel/events.rs:43`, `diag_ref` (`:100`) |
| `episode` | EXISTS | `intel/events.rs:47`, `episode_ref` (`:108`) |
| `repair_route` | EXISTS | `intel/events.rs:49`, `route_ref` (`:133`) |
| `receipt` | EXISTS | `intel/events.rs:51`, in `receipt_emitted` (`:306`) |
| **`proof_lane`** | **TO BE BUILT (B7)** | the transport/lane (`lsp`/`mcp`/`a2a`/`headless`) as a first-class object, not just the `transport` attribute |
| **`checkpoint`** | **TO BE BUILT (B7)** | Gall checkpoint identity (e.g. `001`, `001B`) |
| **`branch`** | **TO BE BUILT (B7)** | git branch |
| **`commit`** | **TO BE BUILT (B7)** | git commit sha |

> **"species" = `diagnostic_code`.** ggen's diagnostic species (E00XX / `GGEN-TPL-001`) is the `diagnostic_code` object. No new type needed; the queries in §6 simply name it "species."

### 5.2 The graph (object→event→object via `relationships`; object→object via `object_relations`)

```
agent ──(authors)──▶ episode ──(rooted_in)──▶ diagnostic_code   (= species)
  │                     │
  │                     ├──(on)────────────▶ file (source surface, qual="source")
  │                     ├──(lands_on)──────▶ file (repair surface, qual="repair")
  │                     ├──(routed_by)─────▶ repair_route
  │                     ├──(via)───────────▶ proof_lane
  │                     └──(closed_by)─────▶ receipt
  │                                            │
  │                                            ├──(follows)──▶ receipt (previous_receipt_id)  [O2O]
  │                                            └──(witnessed_in)──▶ checkpoint ──(on)──▶ branch ──(at)──▶ commit  [O2O]
```

- **Event→object** edges are ggen's `OcelObjectRef`/`relationships` (one `relationships` entry per object, with a qualifier).
- **Object→object** edges (`receipt follows receipt`, `episode in checkpoint`, `checkpoint on branch`, `branch at commit`) must be emitted into the tape's `objectTypes`/object `relationships` so `query_provenance_traversal`'s `ObjectToObject` step (`ocel_io.rs:348`) can walk them. ggen currently emits **no** object→object relations. **This is the single biggest emission gap (B7).**

### 5.3 What ggen MUST ADD for queries to be answerable (B7, coordinated)

Additive only; no rename (§3.1). Concretely, in `ggen .../crates/ggen-lsp/src/intel/events.rs`:

1. **New object types + refs:** `proof_lane`, `checkpoint`, `branch`, `commit` (mirror `route_ref`/`diag_ref` builders).
2. **Object→object relations:** when emitting `ReceiptEmitted`, also emit (into the object table / `embedded_relations`):
   - `receipt --follows--> previous_receipt` (qualifier `follows`),
   - `episode --witnessed_in--> checkpoint` (qualifier `checkpoint`),
   - `checkpoint --on--> branch`, `branch --at--> commit`.
   These land in `OCEL.object_relations` (`models.rs:727`) on intake so traversal reads them.
3. **Surface qualifiers:** split today's single `file` ref (qualifier `"file"`, `events.rs:121`) into `source`/`repair` qualifiers on the relevant events so `source_surface`/`repair_surface` are derivable.
4. **Residual attribute:** on `GatePassed`/`GateFailed` (and copied onto `ReceiptEmitted`), add `residual` = sorted JSON array of still-open codes. `gate_result` already partially present via `error_count` (`events.rs:331`); add explicit `gate_result` and `residual`.
5. **Source-graph hash + lineage:** add `source_graph_hash` and `previous_receipt_id` attributes to `ReceiptEmitted`.

Each addition is an extra `attributes` key or extra `objects`/relation entry. The builder MUST land these in ggen and update ggen's tape fixtures in the **same** change, citing GGEN-NEEDS §3.1.

---

## 6. Object-centric causality query catalog (B5)

Each query is a named `ProvenanceQuery` (`ocel_io.rs:228`) program plus an aggregation. The traversal engine already exists; B5 = the catalog + counting. Queries run over the materialized  `OCEL` (2.B) after intake.

### 6.1 Lineage / receipt-causality queries

| Name | Question | Program (sketch) | Output |
|---|---|---|---|
| `receipt-lineage` | full ancestry of a receipt | start `receipt`{id} → O2O `follows` reverse* (chain of prior receipts) ; → `EventToObject` to its `episode` → `diagnostic_code`, `repair_route`, `file` | path list `receipt←receipt…`, plus the binding objects |
| `receipt-without-gate` | which receipts lack a `GatePassed` predecessor in-episode | for each `ReceiptEmitted`, group on `episode`; assert presence+order of `GatePassed` | `Vec<ReceiptFinding{ReceiptBeforeGatePassed}>` (B2/R1) |
| `gate-without-residual` | which gates declare no `residual` (drift) | scan `GatePassed`/`GateFailed`, missing `residual` attr | findings `MissingResidualSet` |
| `repair-without-route` | which `RepairApplied` lack a prior `RouteSelected` | per-episode order check | findings `RepairWithoutRoute` (R2) |
| `missing-predecessor` | any link event whose required predecessors are absent | apply §4 R1–R6 | `Vec<OrderingViolation>` |
| `residual-not-preserved` | a receipt whose `residual` differs from its gate's `residual` without an intervening repair | compare gate.residual vs receipt.residual | findings `ResidualNotPreserved` (B4) |
| `receipt-depends-on-repair` | which receipt depends on which source-law repair | start `receipt`{id} → episode → `RepairApplied` event → `repair_route` + `source_surface` | the repair(s) the receipt witnesses |

### 6.2 Cross-agent object questions

| Name | Question | Program (sketch) | Output |
|---|---|---|---|
| `agents-touched-route` | which agents touched this route? | start `repair_route`{id} → `EventToObject`(reverse via events referencing route) → `agent` | distinct agent ids |
| `species-repair-loops` | which species has the highest repair-loop count? | for each `diagnostic_code`, count episodes with >1 `RepairApplied` before a `GatePassed` (rework loops) | ranked `{code, loop_count}` |
| `files-causing-andon` | which files repeatedly cause Andon? | for each `file` (source qualifier), count `GateFailed`+`RefusalEmitted` events | ranked `{file, andon_count}` |
| `route-success-by-lane` | per route, success rate sliced by proof_lane | group `RouteSelected`→episode→(`ReceiptEmitted` vs `RefusalEmitted`) by `proof_lane` | matrix `{route, lane, success_rate}` |
| `checkpoint-receipts` | which receipts were witnessed in checkpoint N? | start `checkpoint`{id} → O2O reverse `witnessed_in` → `episode` → `closed_by` → `receipt` | receipt set (feeds cross-checkpoint-leakage sibling spec) |

Aggregation lives in B5 as small pure fns returning serde structs; the *walking* delegates to the existing traversal.

```rust
// crates/wasm4pm-algos/src/oracle/object_causality.rs   (TO BE BUILT)
pub struct LoopRank { pub diagnostic_code: String, pub loop_count: u64 }
pub struct AndonRank { pub file: String, pub andon_count: u64 }
pub fn species_repair_loops(ocel: &wasm4pm_compat::ocel::OCEL) -> Vec<LoopRank>;     // ranked desc
pub fn files_causing_andon(ocel: &wasm4pm_compat::ocel::OCEL) -> Vec<AndonRank>;     // ranked desc
pub fn agents_touched_route(ocel: &wasm4pm_compat::ocel::OCEL, route_id: &str) -> Vec<String>;
```

---

## 7. Mapping onto crates + the `wpm` CLI

### 7.1 Crate placement

- **`ocel-core`** (`crates/ocel-core/`): no change beyond what GGEN-NEEDS §2 already landed. The findings vocabulary (`ReceiptFinding`/`FindingSeverity`/`ReceiptDoctorState`) already lives in `ocel-core/src/intake.rs:33-82` — **add the new oracle refusal variants there** so they stay link-safe and ggen-readable.
- **`wasm4pm-algos`** (`crates/wasm4pm-algos/`): new pure module `oracle/` holding `receipt_witness.rs` (§3.2), `ordering_law.rs` (§4 / B1), `receipt_causality.rs` (B2/B3/B4), `object_causality.rs` (§6 / B5). Pure Rust, no `wasm-bindgen` → CLI-callable. Re-uses `wasm4pm_compat::ocel` types and the traversal logic **extracted** from `ocel_io.rs:258` into a pure `query_provenance(ocel: &OCEL, q: &ProvenanceQuery) -> ProvenanceQueryResult` (today it is trapped inside a `#[wasm_bindgen]` `with_object` closure; lift the body, leave the JS bridge calling it).
- **`wasm4pm-cli`** (`crates/wasm4pm-cli/`): new `wpm oracle` command (B6), wired in `src/main.rs` `Commands` enum (mirror `Receipt(...)` at `main.rs:68`), implemented in `src/commands/oracle.rs`.

### 7.2 New oracle refusal variants (extend `ocel-core/src/intake.rs::ReceiptTruthRefusal`, `:33`)

```rust
// additions to crates/ocel-core/src/intake.rs  (TO BE BUILT — additive enum variants)
//   ReceiptBeforeGatePassed,
//   ReceiptMissingPredecessor,
//   RepairWithoutRoute,
//   RepairWithoutSuggestion,
//   EpisodeNotRootedInDiagnostic,
//   GateWithoutRepair,
//   MissingResidualSet,
//   ResidualNotPreserved,
//   OrphanReceipt,                 // receipt with no episode/diagnostic
//   ReceiptLineageBroken,          // previous_receipt_id points nowhere
//   ReceiptGraphStateMissing,      // no source_graph_hash
```

### 7.3 `wpm oracle` command tree (B6)

```
wpm oracle
├── receipt-causality <tape.ocel.jsonl>   [--episode <id>] [--receipt <id>]
│       run §4 ordering law + §3 binding checks + §6.1 lineage; emit verdict
├── object-causality   <tape.ocel.jsonl>  --query <name> [--arg k=v ...] [--top N]
│       run a §6 named query; emit ranked / path JSON
└── attest             <tape.ocel.jsonl>  [--strict]
        run BOTH halves over the whole tape; single Admitted/Refused verdict
```

All accept `--format json` (default `json` for the oracle, unlike `wpm receipt`'s `human` default at `receipt.rs:49` — the oracle is machine-first). Exit **non-zero** on any `Deny` finding (mirrors `receipt.rs:186` `has_findings → Err`). This is the externalizable evidence ggen's Chicago-TDD subprocess tests assert on.

> **Smallest first win:** B6 `wpm oracle receipt-causality` + B1/B2 unblocks GGEN-NEEDS §7 proof obligation #6 *without* touching the mocked `wpm mining conformance` (`mining.rs:75`). The two are independent; do the oracle first.

### 7.4 The oracle JSON report envelope (one stable, versioned shape)

```json
{
  "report_version": "26.5.x",
  "tape": ".ggen/ocel/agent-edit-events.ocel.jsonl",
  "command": "oracle.receipt-causality",
  "state": "Refused",
  "admitted": false,
  "summary": { "episodes": 12, "receipts": 7, "findings_deny": 1, "findings_warn": 2 },
  "findings": [
    { "code": "ReceiptBeforeGatePassed",
      "severity": "Deny",
      "json_path": "$.events[receipt e0a1].episode[bf9c]",
      "message": "ReceiptEmitted at 2026-05-30T12:00:01Z precedes any GatePassed in episode bf9c (rule R1)." }
  ],
  "witnesses": [
    { "receipt_id": "…", "episode_id": "bf9c", "diagnostic_code": "GGEN-TPL-001",
      "route": "tpl.declare-var", "gate_result": "passed", "residual": [],
      "predecessors": ["DiagnosticRaised","RouteSelected","RepairSuggested","RepairApplied","GatePassed"],
      "previous_receipt_id": "" }
  ]
}
```

`findings[]` reuses `ReceiptFinding{code,severity,json_path,message}` verbatim (`ocel-core/intake.rs:63`). `state`/`admitted` reuse `ReceiptDoctorState`/`ReceiptDoctorReport` (`:71/:78`). For `object-causality`, replace `witnesses`/`findings` with `results` (ranked structs from §6.2 or `ProvenanceQueryResult.paths`).

---

## 8. ggen-side consumption contract

ggen never links this logic. It:

1. **Emits** the enriched tape (§5.3 / B7 additions) at `.ggen/ocel/agent-edit-events.ocel.jsonl` — additive, proof-grep-safe.
2. **Invokes** the oracle as a subprocess and parses stdout JSON:

```bash
wpm oracle attest .ggen/ocel/agent-edit-events.ocel.jsonl --format json
# exit 0  → Admitted ; exit !=0 → Refused (findings explain why)
```

3. **Asserts** (Chicago-TDD, real boundary, externalizable evidence): a green 6-link episode yields `state":"Admitted"` and a `witnesses[]` entry whose `predecessors` contain all six activities in order; an episode with a fabricated `ReceiptEmitted` (no `GatePassed`) yields exit≠0 and a `ReceiptBeforeGatePassed` Deny finding. These are the negative/positive proofs ggen keeps after deleting its own `conformance.rs`/`self_audit.rs`.

The only linked dependency remains `ocel-core` (types + finding enums), per GGEN-NEEDS §5. Everything in §3–§6 is reached via `wpm`.

---

## 9. Fixtures

Reuse the convention in `fixtures/real/<scenario>/` (00-MAP §6). The `trace-conform-agent-proof-lifecycle` fixture (`collect_evidence→verify_evidence→emit_receipt`) is the structural sibling of the 6-link chain — clone it.

**TO BE BUILT** fixture pair under `fixtures/real/ggen-receipt-causality/`:

`tape-admitted.ocel.jsonl` (one lawful episode, NDJSON, shape matching `ocel-core` + ggen aliases):

```json
{"id":"d0","type":"diagnostic_code","attributes":[]}
{"id":"bf9c","type":"episode","attributes":[]}
{"id":"e0","type":"DiagnosticRaised","time":"2026-05-30T12:00:00Z","relationships":[{"objectId":"item.tera","qualifier":"source"},{"objectId":"d0","qualifier":"diag"},{"objectId":"bf9c","qualifier":"episode"}],"attributes":[{"name":"code","value":"GGEN-TPL-001"}]}
{"id":"e1","type":"RouteSelected","time":"2026-05-30T12:00:00.1Z","relationships":[{"objectId":"bf9c","qualifier":"episode"},{"objectId":"tpl.declare-var","qualifier":"route"}],"attributes":[{"name":"route","value":"tpl.declare-var"}]}
{"id":"e2","type":"RepairSuggested","time":"2026-05-30T12:00:00.2Z","relationships":[{"objectId":"bf9c","qualifier":"episode"},{"objectId":"tpl.declare-var","qualifier":"route"}],"attributes":[]}
{"id":"e3","type":"RepairApplied","time":"2026-05-30T12:00:00.3Z","relationships":[{"objectId":"bf9c","qualifier":"episode"},{"objectId":"tpl.declare-var","qualifier":"route"}],"attributes":[]}
{"id":"e4","type":"GatePassed","time":"2026-05-30T12:00:00.4Z","relationships":[{"objectId":"bf9c","qualifier":"episode"}],"attributes":[{"name":"gate_result","value":"passed"},{"name":"residual","value":"[]"},{"name":"error_count","value":"0"}]}
{"id":"e5","type":"ReceiptEmitted","time":"2026-05-30T12:00:00.5Z","relationships":[{"objectId":"bf9c","qualifier":"episode"},{"objectId":"r-bf9c","qualifier":"receipt"}],"attributes":[{"name":"receipt_id","value":"r-bf9c"},{"name":"previous_receipt_id","value":""},{"name":"residual","value":"[]"},{"name":"gate_result","value":"passed"}]}
```

`tape-refused-receipt-before-gate.ocel.jsonl`: identical but **delete `e4` (GatePassed)** → oracle must emit `ReceiptBeforeGatePassed`/`ReceiptMissingPredecessor` Deny and exit≠0.

> **Bad-trace corpus (00-MAP §6, vision #12).** This refused fixture is the first impossible-OCEL fixture in the repo. Add siblings: `repair-without-route` (delete `e1`), `orphan-receipt` (drop the `episode` relationship from `e5`), `residual-not-preserved` (`e4.residual=[]` but `e5.residual=["GGEN-TPL-002"]` with no intervening repair).

---

## 10. Acceptance criteria (wasm4pm builders verify)

1. **B1** `check_ordering_law` exists in `wasm4pm-algos/src/oracle/ordering_law.rs`, pure Rust, no `wasm-bindgen`; unit-tested with real `wasm4pm_compat::ocel::OCEL` values (no mocks) covering R1–R6.
2. **Traversal lift:** `query_provenance(&OCEL,&ProvenanceQuery)->ProvenanceQueryResult` callable from `wasm4pm-algos`/CLI without WASM; the `#[wasm_bindgen]` `query_provenance_traversal` (`ocel_io.rs:258`) delegates to it; existing wasm tests stay green.
3. **B2/B3/B4** `ReceiptWitness` materialization + the three checks produce `ReceiptFinding`s using the `ocel-core` finding types; new refusal variants added to `ReceiptTruthRefusal` (`intake.rs:33`); full wasm4pm suite green.
4. **B5** §6.1/§6.2 queries return deterministic, ranked results on the §9 admitted fixture.
5. **B6** `wpm oracle {receipt-causality,object-causality,attest}` exist (wired in `main.rs` like `Receipt`), default `--format json`, exit **0** on the admitted fixture and **non-zero** with a `ReceiptBeforeGatePassed` Deny on the refused fixture. CLI integration tests in `crates/wasm4pm-cli/tests/cli_tests.rs` via `assert_cmd` (the existing convention), asserting stdout JSON + exit code.
6. **JSON envelope** (§7.4) is versioned (`report_version`) and stable across the three subcommands (shared serializer fn).
7. **Fixtures** (§9): admitted + at least the `receipt-before-gate` refused fixture committed under `fixtures/real/ggen-receipt-causality/`.
8. **ggen coordination (B7):** the emission additions (§5.3) are specified back to ggen as a single coordinated change citing GGEN-NEEDS §3.1; until ggen ships them, the oracle degrades gracefully — absent `checkpoint`/`branch`/`commit`/`residual` produce **Warning** findings (`MissingResidualSet`, etc.), never panics, so the oracle is useful on today's tape and stricter as ggen enriches it.
9. **Round-trip:** `wpm oracle attest` over ggen's *real* `.ocel.jsonl` (the GGEN-NEEDS §7 #6 proof) returns `Admitted` for a genuine green 6-link run — demonstrating ggen no longer needs its own `conformance.rs`/`self_audit.rs`.

---

*Descriptive spec only. No Rust source, Cargo.toml, or existing file was modified. The single file written is `/Users/sac/wasm4pm/docs/ggen-oracle/06-receipt-and-object-causality.md`.*
