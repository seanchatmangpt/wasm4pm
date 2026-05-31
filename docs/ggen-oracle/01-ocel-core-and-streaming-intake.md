# 01 — `ocel-core` + Streaming NDJSON Intake (the foundation)

**Status:** Spec. Authored 2026-05-30. Grounds GGEN-NEEDS §2, §3, §3.1, §4 and Structure-Map §2, §3, §9.
**Authority direction:** wasm4pm consumes ggen's OCEL tape. ggen *links* only `ocel-core`; everything else is an external `wpm` oracle.
**Evidence rule honored:** every "EXISTS" claim below is cited to a real file:symbol read from `/Users/sac/wasm4pm`. Everything else is marked **TO BE BUILT** or **TO BE FIXED**.

> **Headline finding (read before building):** `ocel-core` and a first `import_ocel_ndjson` already exist on disk — but neither is complete against GGEN-NEEDS. The crate has a **version-train drift** (`26.5.30` vs workspace `26.5.29`), there are **two divergent NDJSON code paths** that disagree, the **serialized-name constraint (GGEN-NEEDS §3.1) is entirely unmet** (no `activity`/`timestamp`/inline-`objects` aliases anywhere), and ggen's **lossy subset cannot deserialize** into today's `OCELEvent`. This spec turns those partial assets into a buildable foundation.

---

## 1. Purpose

Give ggen one tiny, link-safe types crate (`ocel-core`: `serde`+`serde_json`+`chrono` only) and one tolerant stream reader that folds ggen's append-only NDJSON tape (`/Users/sac/ggen/.ggen/ocel/agent-edit-events.ocel.jsonl`, one `OcelEvent` per line) into a canonical `OCEL` 2.0 value — **without breaking ggen's on-disk proof greps** (`"activity":"DiagnosticRaised"`, the object-id substring, `GGEN-TPL-001`). This is the load-bearing layer every sibling oracle spec (conformance, prefix-completability, receipt-causality) parses through.

---

## 2. What EXISTS vs. TO BE BUILT (cited)

### 2.1 EXISTS — the `ocel-core` crate (already carved)

The carve GGEN-NEEDS §2 asks for is **already done**, not pending:

| Asset | Citation | Notes |
|---|---|---|
| `ocel-core` crate is a workspace member | `/Users/sac/wasm4pm/Cargo.toml:4` (`members = [ ..., "crates/ocel-core"]`) | Leaf crate below `wasm4pm-types` as Structure-Map §1 requires. |
| All 9 OCEL 2.0 types defined | `crates/ocel-core/src/lib.rs:8-100` | `OCEL`, `OCELType`, `OCELTypeAttribute`, `OCELEventAttribute`, `OCELEvent`, `OCELRelationship`, `OCELObject`, `OCELObjectAttribute`, `OCELAttributeValue` + `Display` (`lib.rs:88`). Matches GGEN-NEEDS §2 contents list exactly. |
| Dep tree is minimal | `crates/ocel-core/Cargo.toml` | Only `serde` (derive), `serde_json`, `chrono` (serde). No `hashbrown`/`uuid`/`wasm-bindgen`. Satisfies GGEN-NEEDS §2 "serde/serde_json/chrono only". |
| `wasm4pm-types` re-exports it | `crates/wasm4pm-types/src/ocel.rs:6-9` (`pub use ocel_core::{OCEL, OCELAttributeValue, OCELEvent, OCELEventAttribute, OCELObject, OCELObjectAttribute, OCELRelationship, OCELType, OCELTypeAttribute};`) | Full re-export set — fixes Structure-Map §9.1's "incomplete re-export" warning (that warning is now stale; `OCELType`/`OCELRelationship`/`OCELAttributeValue` ARE re-exported). |
| The `From<event_log::AttributeValue>` coupling stays behind | `crates/wasm4pm-types/src/ocel.rs:11-38` | Bidirectional `From` impls live in `wasm4pm-types` (which owns `event_log`/`uuid`), NOT in `ocel-core` — exactly the boundary Structure-Map §2.A demands. **No change needed.** |
| `wasm4pm-types` declares the path dep | `crates/wasm4pm-types/Cargo.toml:12` (`ocel-core = { path = "../ocel-core" }`) | |

### 2.2 EXISTS — two NDJSON readers (that disagree)

| Reader | Citation | Shape | Verdict |
|---|---|---|---|
| `import_ocel_ndjson(&str) -> Result<OCEL, String>` | `crates/wasm4pm-types/src/import/ocel/mod_ocel.rs:17-74` | Whole-string, `serde_json::Value`-probed by presence of `"time"` / `"name"`; synthesizes `event_types`/`object_types`; tolerates a truncated last line by silently dropping unparseable lines. | **Folds into an `OCEL`** (what GGEN-NEEDS §4a wants) but has a **dead `"name"` branch** (`mod_ocel.rs:37-42` parses an `OCELType` then discards it — `if let Ok(ocel_type)` binds and does nothing) and **silently swallows malformed mid-stream lines** (can't distinguish "truncated tail" from "corrupt middle"). |
| `ocel_core::intake::NDJsonStream<R: BufRead>` | `crates/ocel-core/src/intake.rs:41-108` | Lazy `Iterator<Item = Result<OCELRecord, String>>` over a `BufRead`; `OCELRecord = untagged{Event,Object}` (`intake.rs:7-12`); applies an `ExtractionPlan` (`intake.rs:14-39`) with referential-integrity drop of dangling relationships. | **Better engine** (lazy, crash-safe-ish, filter-capable) but **does NOT fold into an `OCEL`** and **returns `Err` on the truncated final line** (`intake.rs:99-101`) instead of tolerating it — violates GGEN-NEEDS §4 acceptance ("truncated final line is tolerated"). |

These two paths duplicate intent and disagree on truncation policy. **The spec unifies them (§5).**

### 2.3 TO BE BUILT / TO BE FIXED

| # | Gap | Evidence it's missing | Owner stage |
|---|---|---|---|
| G1 | **Serialized-name reconciliation unmet** (GGEN-NEEDS §3.1) | `grep 'alias = "activity"'` over `crates/ocel-core/src/` returns nothing. `OCELEvent.event_type` is `#[serde(rename="type")]` only (`lib.rs:42-43`); `time` has no alias (`lib.rs:44`); there is no inline-`objects` ingestion. ggen emits `activity`/`timestamp`/`objects` (`/Users/sac/ggen/crates/ggen-graph/src/ocel/ocel_types.rs:37,39,41`) → **ggen lines fail to deserialize into `OCELEvent` today.** | `ocel-core` types (§4) |
| G2 | **`Utc` → `FixedOffset` ingestion** | ggen `timestamp: DateTime<Utc>` (`ocel_types.rs:39`); ocel-core `time: DateTime<FixedOffset>` (`lib.rs:44`). `Utc` serializes as RFC-3339 `...Z`, which `DateTime<FixedOffset>` parses — but only **once the field is named `time`** (blocked by G1). | `ocel-core` types (§4) |
| G3 | **Inline `objects` → `relationships` mapping** | ggen emits `objects: Vec<OcelObjectRef{id,type,qualifier:Option<String>}>` per event (`ocel_types.rs:41,48-55`); ocel-core has only `relationships: Vec<OCELRelationship{object_id,qualifier}>` (`lib.rs:48,51-56`). No deserialization bridge. ggen's `type` (object type) is **dropped** in OCEL relationships (which carry only `objectId`+`qualifier`) — must be recovered into the `objects` table. | `ocel-core` types + folder (§4, §5) |
| G4 | **`HashMap<String,String>` attrs → typed `Vec<OCELEventAttribute>`** | ggen `attributes: HashMap<String,String>` (`ocel_types.rs:43`); ocel-core wants `Vec<OCELEventAttribute{name, value: OCELAttributeValue}>` (`lib.rs:46,34-37`). Map-vs-array shape mismatch; no `From` bridge. | `ocel-core` folder (§5) |
| G5 | **Object-type recovery from event lines** | ggen's append-only tape may carry objects only *inline inside events* (no standalone object lines guaranteed). The folder must synthesize `OCELObject`s + `object_types` from event relationships. `import_ocel_ndjson` only registers objects from standalone object lines (`mod_ocel.rs:43-48`). | folder (§5) |
| G6 | **Truncated-tail tolerance, but corrupt-middle rejection** | `import_ocel_ndjson` tolerates by dropping ALL bad lines (`mod_ocel.rs:31` `if let Ok`); `NDJsonStream` rejects ALL bad lines (`intake.rs:99`). Neither implements "tolerate ONLY the final line" (GGEN-NEEDS §4 acceptance). | folder (§5) |
| G7 | **Version drift** | `ocel-core/Cargo.toml` pins `version = "26.5.30"` and `edition` literals, not `version.workspace = true`. Workspace is `26.5.29` (`Cargo.toml:7`). Structure-Map §7 warns against exactly this. | manifest (§3) |
| G8 | **No fixture proving ggen's real tape round-trips** | `fixtures/real/` has `trace-conform-agent-proof-lifecycle` (shape 2.C `activity`/`event_id`) but **no ggen-living-loop `.ocel.jsonl` fixture** with the 6-link chain. | fixtures (§7) |

**Count:** EXISTS = 2 areas (crate carve, two readers). TO BE FIXED/BUILT = 8 items (G1–G8).

---

## 3. `ocel-core` Cargo manifest — TO BE FIXED (G7)

Current (`crates/ocel-core/Cargo.toml`) hard-codes a drifting version and does not inherit the workspace `serde_json` `preserve_order` feature (needed for truex canonical hashing per Structure-Map §4.4, §7). Replace with:

```toml
# crates/ocel-core/Cargo.toml — TO BE FIXED
[package]
name = "ocel-core"
version.workspace = true          # FIX G7: was "26.5.30"; track workspace 26.5.29
edition.workspace = true          # was "2021" literal
license.workspace = true
authors.workspace = true
repository.workspace = true
description = "Lightweight OCEL 2.0 types + tolerant NDJSON intake (link-safe; serde/serde_json/chrono only)."

[dependencies]
serde       = { workspace = true }   # inherits derive
serde_json  = { workspace = true }   # inherits preserve_order — required for canonical hashing
chrono      = { workspace = true }   # inherits serde
```

**Cross-repo consumption (GGEN-NEEDS §5).** ggen links ONLY this crate. Because `ocel-core` inherits `version.workspace`, a published tag is the clean path:

```toml
# ggen-side Cargo.toml (NOT written by this spec — contract only)
ocel-core = { git = "https://github.com/seanchatmangpt/wasm4pm", tag = "ocel-core-v26.5.29" }
```

> **Builder note:** to keep `ocel-core` git-linkable in isolation, it must not transitively require the workspace `[workspace.package]` table when consumed from another repo. If `version.workspace = true` blocks standalone git resolution, fall back to a literal `version = "26.5.29"` synced to the train — but **never** leave `26.5.30`. (OPEN-Q1.)

---

## 4. `ocel-core` types — TO BE FIXED for the serialized-name constraint (G1–G3)

The reconciliation honors GGEN-NEEDS §3.1 via **serde aliases on the canonical types** — chosen because Structure-Map §9.2 shows `activity` is consistent with wasm4pm's own fixture corpus (2.C), and because aliasing lets ggen keep its proof greps **and** its append-only emitter unchanged. The canonical *serialized* name stays OCEL-2.0 (`type`/`time`); the aliases make ggen's tape *readable*. Aliases affect deserialization only — re-serialization still writes OCEL-2.0 names, so wasm4pm's own outputs stay standard.

```rust
// crates/ocel-core/src/lib.rs — TO BE FIXED (additive: aliases only; no field removed)

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OCELEvent {
    #[serde(alias = "event_id")]                 // FIX: ggen/2.C use "event_id" too
    pub id: String,
    #[serde(rename = "type", alias = "activity")] // FIX G1: ggen emits "activity"
    pub event_type: String,
    #[serde(alias = "timestamp")]                 // FIX G2: ggen emits "timestamp" (Utc → FixedOffset OK)
    pub time: DateTime<FixedOffset>,
    #[serde(default, alias = "attrs")]
    pub attributes: Vec<OCELEventAttribute>,      // see §5 for HashMap-form ingestion (G4)
    #[serde(default, alias = "objects")]          // FIX G3: ggen emits inline "objects"
    pub relationships: Vec<OCELRelationship>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct OCELRelationship {
    #[serde(rename = "objectId", alias = "id")]   // FIX G3: ggen's OcelObjectRef uses "id"
    pub object_id: String,
    #[serde(default)]
    pub qualifier: String,                         // ggen qualifier is Option<String>; see §5 default
    // NOTE: ggen's inline object ref ALSO carries "type" (object type). serde aliasing alone
    // cannot route a sibling field into the objects table — that recovery is the folder's job (§5, G5).
}
```

**Why aliases on `relationships` are not sufficient alone.** ggen's inline `objects` entry is `{id, type, qualifier}` (`ocel_types.rs:48-55`); an `OCELRelationship` is `{objectId, qualifier}`. The `type` is structurally homeless in a relationship. Two clean options — **the folder (§5) must do this, not serde**:

- **Recover** the object `type` into the synthesized `objects` table (preferred — lossless, GGEN-NEEDS §3 "ggen emits relationships + registers object/event types").
- A custom `Deserialize` on a transitional `GgenObjectRef{id,type,qualifier:Option<String>}` that splits into `(OCELRelationship, OCELObject)`.

> **Constraint check (GGEN-NEEDS §3.1):** After this fix, a ggen line
> `{"id":"e0","activity":"DiagnosticRaised","timestamp":"2026-05-30T12:00:00Z","objects":[{"id":"item.tera","type":"file","qualifier":"subject"}],"attributes":{"code":"GGEN-TPL-001"}}`
> deserializes into an `OCELEvent{ id:"e0", event_type:"DiagnosticRaised", time:…, relationships:[{object_id:"item.tera", qualifier:"subject"}] }` — and on the *wire* the file is unchanged, so ggen's greps for `"activity":"DiagnosticRaised"`, `item.tera`, and `GGEN-TPL-001` still pass. **No coordinated ggen rename required.** (This is GGEN-NEEDS §3.1 option (a).)

---

## 5. The folder — `fold_ndjson` (TO BE BUILT, unifies G4–G6)

Unify the two readers (§2.2) into one tolerant fold living in `ocel-core::intake`, reusing the existing `NDJsonStream` engine but adding (a) HashMap-attr ingestion, (b) object-table synthesis, (c) final-line-only tolerance.

### 5.1 Public API (additive to `crates/ocel-core/src/intake.rs`)

```rust
// crates/ocel-core/src/intake.rs — TO BE BUILT (additive)

/// How to treat unparseable lines.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TailPolicy {
    /// Tolerate a single trailing unparseable line (ggen appends concurrently); reject any
    /// unparseable line that is NOT the last byte-run. GGEN-NEEDS §4 acceptance. (FIX G6)
    TolerateTruncatedTail,
    /// Reject the first unparseable line. (Strict mode for finished logs.)
    Strict,
}

/// Diagnostics from a fold, so callers (and the oracle) can report *why* a line was dropped.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct FoldReport {
    pub events_folded: usize,
    pub objects_folded: usize,
    pub event_types_synthesized: usize,
    pub object_types_synthesized: usize,
    pub tail_truncated: bool,             // true iff a trailing partial line was tolerated
    pub dropped_lines: Vec<DroppedLine>,  // mid-stream parse failures (Strict: also the fatal one)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DroppedLine { pub line_number: usize, pub reason: String }

/// Fold an NDJSON OCEL tape into one OCEL value, synthesizing event_types/object_types
/// and recovering inline-object types into the objects table.
///
/// EXISTS to reuse: NDJsonStream<R> (intake.rs:41) + ExtractionPlan (intake.rs:14).
/// TO BE BUILT: this fold + HashMap-attr ingestion + object-table synthesis + TailPolicy.
pub fn fold_ndjson<R: BufRead>(
    reader: R,
    plan: ExtractionPlan,
    tail: TailPolicy,
) -> Result<(OCEL, FoldReport), String>;

/// Convenience for ggen's whole-file case (replaces the divergent mod_ocel.rs path).
pub fn fold_ndjson_str(s: &str, plan: ExtractionPlan, tail: TailPolicy)
    -> Result<(OCEL, FoldReport), String> {
    fold_ndjson(s.as_bytes(), plan, tail)
}
```

### 5.2 HashMap-attribute ingestion (G4)

ggen emits `"attributes":{"code":"GGEN-TPL-001"}` (a JSON object), ocel-core wants an array. Add a serde shim so BOTH shapes deserialize:

```rust
// crates/ocel-core/src/intake.rs — TO BE BUILT
// Accept attributes as EITHER the canonical array OR ggen's {name: value} map.
#[derive(Deserialize)]
#[serde(untagged)]
enum AttrsRepr {
    Array(Vec<OCELEventAttribute>),
    Map(std::collections::BTreeMap<String, serde_json::Value>), // BTreeMap = deterministic order
}
// Map values fold to OCELAttributeValue (String/Integer/Float/Boolean), per ggen's String map
// they land as OCELAttributeValue::String losslessly (GGEN-NEEDS §3 "lossless").
```

This is the cleanest place because changing `OCELEvent.attributes` to a custom-deser field keeps the canonical type honest (still `Vec<OCELEventAttribute>`) while accepting ggen's map at the boundary. If a custom `Deserialize` on `OCELEvent` is undesirable, do the map→array conversion inside `fold_ndjson` after probing the raw `serde_json::Value` (the `import_ocel_ndjson` value-probe pattern at `mod_ocel.rs:31` is the precedent). (OPEN-Q2.)

### 5.3 Object-table synthesis + type recovery (G5)

For every event relationship whose `object_id` was never seen as a standalone object line, synthesize an `OCELObject{ id, object_type: <recovered from ggen inline type, else "unknown">, attributes: [], relationships: [] }`. Collect distinct event/object type names into `event_types`/`object_types` (reuse the `OCELType{name, attributes:vec![]}` synthesis already in `mod_ocel.rs:52-66`). For ggen, the inline `objects[].type` (e.g. `file`, `diagnostic_code`, `episode`, agent) is the recovery source — this is exactly the `file`/`diagnostic_code`/`episode`/agent object model from GGEN-NEEDS §3.1.

### 5.4 Final-line-only tolerance (G6)

Buffer the trailing partial run: read line-by-line via the existing `NDJsonStream`; on a parse `Err`, peek whether more bytes follow. If the failing line is the last line and `tail == TolerateTruncatedTail`, set `report.tail_truncated = true` and stop. If it is NOT last (bytes/newline follow) → it is a corrupt-middle line: push to `dropped_lines` and continue (lenient) or `return Err` (Strict). This is the precise semantics `import_ocel_ndjson` (drops everything) and `NDJsonStream` (rejects everything) both miss.

### 5.5 Retire the divergent path

Once `fold_ndjson` lands, `import_ocel_ndjson` (`mod_ocel.rs:17`) should delegate to it (one-liner: `ocel_core::intake::fold_ndjson_str(s, ExtractionPlan::default(), TailPolicy::TolerateTruncatedTail).map(|(o,_)| o)`), and its dead `"name"` branch (`mod_ocel.rs:37-42`) deleted. This removes the two-readers-disagree hazard (G6) without breaking `wasm4pm-types`' API.

---

## 6. How it maps onto crates + the `wpm` CLI

| Concern | Home | Why |
|---|---|---|
| Types (`OCEL*`) + aliases (§4) | `ocel-core` | Leaf, link-safe; ggen links this and nothing else (GGEN-NEEDS §5). |
| `fold_ndjson` / `TailPolicy` / `FoldReport` (§5) | `ocel-core::intake` | Pure (`serde`+`serde_json`+`std::io::BufRead` only); reuses `NDJsonStream`. Keeps the engine `wasm-bindgen`-free so the oracle subprocess can use it. |
| Re-export | `wasm4pm-types` via `ocel.rs:6` | Already wired; add `pub use ocel_core::intake::{fold_ndjson, TailPolicy, FoldReport};` so engine call sites get it. |
| CLI surface | `wpm` — extend `wpm mining` or add `wpm oracle ingest` | A thin command that reads a `.ocel.jsonl`, calls `fold_ndjson`, and prints `FoldReport` + `OCEL` summary as JSON. This is the intake half of the oracle the sibling specs (conformance/prefix) consume. Tests in `crates/wasm4pm-cli/tests/cli_tests.rs` (`assert_cmd`, Structure-Map §6). |

This spec defines **intake only**. Conformance / prefix-completability / receipt-causality consume the `OCEL` that `fold_ndjson` produces and are specced in sibling files.

---

## 7. The ggen-side consumption contract (external `wpm` oracle, JSON report)

ggen does **not** call `fold_ndjson` for analysis — it links `ocel-core` only for the **types** (so `intel/events.rs` builders construct `OCELEvent`/`OCELObject`/`OCELRelationship` directly) and to **emit** the tape. For *parsing/mining* ggen shells out to `wpm` (GGEN-NEEDS §5, Chicago-TDD external boundary). The intake report contract:

```jsonc
// `wpm oracle ingest --format json /Users/sac/ggen/.ggen/ocel/agent-edit-events.ocel.jsonl`
// stdout (single versioned envelope; exit 0 = ingested, non-zero = fatal parse in Strict mode)
{
  "report_kind": "ocel.ingest",
  "report_version": "1",                 // stable; bump on schema change
  "source": ".ggen/ocel/agent-edit-events.ocel.jsonl",
  "fold": {
    "events_folded": 6,
    "objects_folded": 4,                 // file, diagnostic_code, episode, agent
    "event_types_synthesized": 6,        // the 6-link chain
    "object_types_synthesized": 4,
    "tail_truncated": true,              // ggen was mid-append; tolerated
    "dropped_lines": []
  },
  "event_types": ["DiagnosticRaised","RouteSelected","RepairSuggested",
                  "RepairApplied","GatePassed","ReceiptEmitted"],
  "object_types": ["file","diagnostic_code","episode","agent"]
}
```

ggen asserts on this JSON (Chicago-TDD: real subprocess, externalizable evidence) that all six chain activities and the four object types are recovered from its real tape — proving ggen no longer needs its own `IntelLog::read`/`dfg`/`conformance` (GGEN-NEEDS §1, §7 proof obligation #6, the half this spec unblocks).

---

## 8. Fixtures — TO BE BUILT (G8)

Add a ggen-living-loop fixture mirroring `fixtures/real/trace-conform-agent-proof-lifecycle/` (Structure-Map §6 — itself a `collect_evidence→verify_evidence→emit_receipt` sibling of the 6-link chain):

```
fixtures/real/ggen-living-loop-6link/
  agent-edit-events.ocel.jsonl   # ggen's NATIVE shape (activity/timestamp/inline objects/map attrs)
  expected-ocel.json             # canonical OCEL 2.0 after fold (type/time/relationships)
  expected-ingest.json           # the §7 FoldReport envelope
  truncated-tail.ocel.jsonl      # same, last line cut mid-token → must still fold 6 events
```

`agent-edit-events.ocel.jsonl` (the input fixture, ggen's real wire shape):

```jsonl
{"id":"<blake3>","activity":"DiagnosticRaised","timestamp":"2026-05-30T12:00:00Z","objects":[{"id":"crates/x/item.tera","type":"file","qualifier":"subject"},{"id":"GGEN-TPL-001","type":"diagnostic_code","qualifier":"code"},{"id":"ep-1","type":"episode","qualifier":"episode"}],"attributes":{"code":"GGEN-TPL-001"}}
{"id":"<blake3>","activity":"RouteSelected","timestamp":"2026-05-30T12:00:01Z","objects":[{"id":"ep-1","type":"episode","qualifier":"episode"},{"id":"agent-7","type":"agent","qualifier":"actor"}],"attributes":{}}
{"id":"<blake3>","activity":"RepairSuggested","timestamp":"2026-05-30T12:00:02Z","objects":[{"id":"ep-1","type":"episode","qualifier":"episode"}],"attributes":{}}
{"id":"<blake3>","activity":"RepairApplied","timestamp":"2026-05-30T12:00:03Z","objects":[{"id":"ep-1","type":"episode","qualifier":"episode"}],"attributes":{}}
{"id":"<blake3>","activity":"GatePassed","timestamp":"2026-05-30T12:00:04Z","objects":[{"id":"ep-1","type":"episode","qualifier":"episode"}],"attributes":{}}
{"id":"<blake3>","activity":"ReceiptEmitted","timestamp":"2026-05-30T12:00:05Z","objects":[{"id":"ep-1","type":"episode","qualifier":"episode"}],"attributes":{"receipt_id":"<blake3>"}}
```

> The `<blake3>` placeholders stand for ggen's BLAKE3-derived `event_id`/`receipt_id` (GGEN-NEEDS §3.1; ggen `intel/events.rs::event_id`). Builders substitute real digests when capturing from a live ggen run; the fold/ingest assertions do not depend on their values, only on the activity/object recovery.

---

## 9. Acceptance criteria (wasm4pm builders can verify)

| # | Criterion | How to verify |
|---|---|---|
| A1 | `ocel-core` version = workspace train (G7) | `grep version.workspace crates/ocel-core/Cargo.toml`; `cargo metadata` shows `26.5.29`, not `26.5.30`. |
| A2 | ggen's native line deserializes into `OCELEvent` (G1–G4) | Unit test in `ocel-core`: `serde_json::from_str::<OCELEvent>(ggen_line)` yields `event_type=="DiagnosticRaised"`, `relationships[0].object_id=="crates/x/item.tera"`. |
| A3 | Re-serialization stays OCEL-2.0 (no leakage of `activity`) | `serde_json::to_string(&event)` contains `"type":"DiagnosticRaised"`, NOT `"activity"`. (Aliases are read-only.) |
| A4 | ggen's on-disk grep constraint holds (GGEN-NEEDS §3.1) | The fixture `agent-edit-events.ocel.jsonl` (unchanged on disk) still matches `"activity":"DiagnosticRaised"`, `item.tera`, `GGEN-TPL-001`. |
| A5 | `fold_ndjson` recovers all 6 activities + 4 object types from the fixture | `cargo test -p ocel-core fold_six_link`. |
| A6 | Truncated final line tolerated; corrupt-middle rejected (G6) | `truncated-tail.ocel.jsonl` folds 6 events with `tail_truncated==true`; a fixture with a corrupt line #3 under `Strict` returns `Err`, under lenient pushes one `DroppedLine`. |
| A7 | `import_ocel_ndjson` delegates; dead `"name"` branch gone (§5.5) | `mod_ocel.rs` body is the one-line delegation; `wasm4pm-types` suite green. |
| A8 | Full wasm4pm suite green (GGEN-NEEDS §2 acceptance) | `cargo test --workspace`. |
| A9 | `wpm oracle ingest` emits the §7 envelope; exit 0 on truncated tail | `cli_tests.rs` with `assert_cmd` + `predicates` on stdout JSON. |
| A10 | ggen consumes via subprocess (proof obligation #6, intake half) | ggen-side Chicago-TDD test runs `wpm oracle ingest` on its real tape, asserts the 6 event types in the JSON envelope. |

---

## 10. Open questions (flag to ggen / sibling specs)

- **OQ1 (manifest):** Does `version.workspace = true` resolve when `ocel-core` is git-depended from ggen's separate repo? If not, pin a literal `26.5.29` synced to the train. (G7 / GGEN-NEEDS §5.)
- **OQ2 (attrs shim):** Custom `Deserialize` on `OCELEvent.attributes` vs. value-probe inside `fold_ndjson`? The former keeps one code path; the latter keeps the type derive clean. Recommend the untagged `AttrsRepr` field-level shim (§5.2). (G4.)
- **OQ3 (qualifier default):** ggen's `OcelObjectRef.qualifier` is `Option<String>`; `OCELRelationship.qualifier` is non-optional `String`. When ggen emits `null`/absent, fold to `""` or `"rel"`? Recommend `""` (matches `#[serde(default)]`). Confirm with ggen so mined qualifiers stay stable.
- **OQ4 (object lines):** Does ggen's tape ever emit standalone object lines, or only inline-in-events? §5.3 synthesis assumes inline-only is possible. ggen to confirm `IntelLog` append format.
- **OQ5 (CLI placement):** `wpm oracle ingest` (new noun) vs. fold inside `wpm mining`? Sibling conformance spec should co-locate; this spec defers the noun choice to the oracle-CLI spec.

---

*Descriptive only. No Rust source, `Cargo.toml`, or existing file was modified by authoring this spec. The single file written is `/Users/sac/wasm4pm/docs/ggen-oracle/01-ocel-core-and-streaming-intake.md`.*
