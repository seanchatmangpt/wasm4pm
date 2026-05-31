# GGEN-NEEDS — what ggen needs from wasm4pm

**Status:** Requirements spec (authored by ggen's conductor). A separate agent system builds against this.
**Date:** 2026-05-30
**Authority direction:** wasm4pm is the process-mining authority. ggen is an OCEL *producer*, not a PM system.

---

## 0. The doctrine (why this exists)

> ggen **emits** OCEL (the living-LSP diagnostic lifecycle). wasm4pm **parses, mines, conforms, and IO's** it.

ggen currently reimplements a full process-mining stack that duplicates wasm4pm. That duplication must collapse onto wasm4pm via **one lightweight, shared OCEL-types crate** plus **wasm4pm-provided parsing / IO / discovery / conformance**. After this lands, ggen keeps only its *domain event builders* and the living-LSP nerve; it deletes every PM algorithm it carries.

This is the interchangeable-parts contract: ggen is a part that produces a standard artifact (an OCEL log); wasm4pm is the part that consumes/analyzes it. They meet at a shared type crate.

---

## 1. What ggen reimplements today (the duplication to retire)

Evidence from the ggen repo (`/Users/sac/ggen`), all to be **deleted or replaced by wasm4pm calls**:

| ggen surface | File(s) | wasm4pm replacement |
|---|---|---|
| OCEL types | `crates/ggen-graph/src/ocel/ocel_types.rs` (`OcelLog`, `OcelObject`, `OcelEvent`, `OcelObjectRef`) | **the new shared crate (§2)** |
| DFG discovery | `crates/ggen-graph/src/ocel/dfg.rs` (`discover_dfg`, `DfgEdge`) | `wasm4pm-algos` discovery (dfg + 60 algos) |
| Conformance | `crates/ggen-graph/src/ocel/conformance.rs` (`check_guard`, `check_lifecycle_order`) | `wasm4pm-algos::conformance::{check_conformance_token_replay, check_conformance_alignment}` |
| Mining orchestration | `crates/ggen-lsp/src/intel/mine.rs` (`mine()` → DFG + SPARQL conformance → mined routes) | wasm4pm discovery + conformance |
| OCEL log IO (read/parse) | `crates/ggen-lsp/src/intel/log.rs` (`IntelLog::read`) | wasm4pm import (§4) |
| Projection / coverage / self-audit | `crates/ggen-graph/src/ocel/{projection,coverage,self_audit,gall_projection}.rs` | wasm4pm analytics (assess per-item; some may be ggen-domain and stay — see §6) |

**ggen keeps** (domain producer, NOT PM):
- `crates/ggen-lsp/src/intel/events.rs` — the OCEL event *builders* (`diagnostic_raised`, `route_selected`, `repair_suggested`, `repair_applied`, `gate_result`, `receipt_emitted`, `attach_attribution`). These construct events using the **shared types**.
- `crates/ggen-lsp/src/intel/log.rs` *append/emit* path only (ggen writes its own log). Read/parse delegates to wasm4pm.

---

## 2. NEED #1 — a lightweight shared OCEL-types crate

**Ask:** extract wasm4pm's OCEL 2.0 types out of the heavy `wasm4pm-types` crate into a new minimal crate so **both** `wasm4pm-types` and ggen depend on it without pulling the whole engine.

**Proposed crate:** `ocel-core` (name negotiable; suggest publishing under the wasm4pm version train `26.5.x`).

**Contents (move from `crates/wasm4pm-types/src/ocel.rs`):**
`OCEL`, `OCELType`, `OCELTypeAttribute`, `OCELEvent`, `OCELEventAttribute`, `OCELObject`, `OCELObjectAttribute`, `OCELRelationship`, `OCELAttributeValue` (+ its `Display`).

**Constraints:**
- Dependencies limited to `serde`, `serde_json`, `chrono`. (`AttributeValue` currently comes from `crate::event_log` — either inline what's needed or move that too; the crate must not transitively pull `wasm4pm-algos`.)
- `no_std`-friendly if cheap; otherwise std is acceptable — "lightweight" means *few deps*, not no_std at any cost.
- `wasm4pm-types` then re-exports from `ocel-core` so no wasm4pm call sites break.
- Versioned and resolvable cross-repo by ggen (see §5).

**Acceptance:** `wasm4pm-types` compiles re-exporting `ocel-core`; the full wasm4pm test suite stays green; `ocel-core` builds with only serde/serde_json/chrono in its dependency tree.

---

## 3. NEED #2 — type reconciliation (ggen's shape → OCEL 2.0)

ggen's current types are a **lossy, non-standard subset**. The shared crate is OCEL 2.0; ggen must converge onto it. This table is the migration contract:

| Concept | ggen today (`ocel_types.rs`) | OCEL 2.0 (`ocel-core`) | Action |
|---|---|---|---|
| Event kind | `activity: String` | `event_type` (serde `"type"`) | ggen maps activity → event_type; **see §3.1 serialized-name constraint** |
| Time | `timestamp: DateTime<Utc>` | `time: DateTime<FixedOffset>` | widen ggen to FixedOffset (Utc is a subset) |
| Object refs | inline `objects: Vec<OcelObjectRef{id,type,qualifier}>` | `relationships: Vec<OCELRelationship{object_id,qualifier}>` + separate `objects` table with `OCELType` decls | ggen emits relationships + registers object/event types |
| Attributes | `HashMap<String,String>` | `Vec<OCELEventAttribute{name, value: OCELAttributeValue}>` (typed) | ggen attrs become typed `OCELAttributeValue::String` (lossless) |
| Type decls | *(none)* | `event_types: Vec<OCELType>`, `object_types: Vec<OCELType>` | ggen must declare its activities + object types |

### 3.1 CRITICAL serialized-name constraint (do not break ggen's proofs)

ggen's living-LSP proof tests read the **on-disk JSONL** and assert substrings on the serialized field names. These are load-bearing receipts (Gall checkpoints 001/001B/001C):

- `crates/ggen-lsp/tests/ggen_tpl_001_stale_clear.rs` and `..._living_loop.rs` grep for `"activity":"DiagnosticRaised"`, the object `id` substring (`item.tera`), and the code `GGEN-TPL-001`.
- The episode model: events carry objects `file`, `diagnostic_code`, `episode` (+ an agent object); event ids are BLAKE3-derived (`intel/events.rs::event_id`); receipt ids BLAKE3 of `file|code|run_id`.

**Requirement:** the migration must either (a) preserve these serialized names (e.g. keep an `activity` alias, keep object `id`s discoverable), **or** (b) update ggen's emission AND its proof assertions together in one change. The builder must call this out as a coordinated ggen-side change, not a silent rename. **The 6-link chain (`DiagnosticRaised → RouteSelected → RepairSuggested → RepairApplied → GatePassed → ReceiptEmitted`) must remain mineable from the emitted log after migration.**

---

## 4. NEED #3 — parsing / IO from wasm4pm

ggen must stop owning OCEL read/parse. wasm4pm provides import; ggen calls it.

**Current wasm4pm import surface:** `crates/wasm4pm-types/src/import/ocel/mod_ocel.rs` → `import_ocel_json(&str)`, `import_ocel_json_slice(&[u8])` (whole-document OCEL 2.0 JSON).

**Gap — NDJSON:** ggen writes an **append-only NDJSON** log at `.ggen/ocel/agent-edit-events.ocel.jsonl` (one `OcelEvent` per line; see `crates/ggen-lsp/src/intel/log.rs`). wasm4pm currently imports whole-doc JSON, not line-delimited event streams.

**Ask — pick one and build it:**
- **(4a)** Add an NDJSON / event-stream reader to wasm4pm: `import_ocel_ndjson(reader) -> OCEL` that folds one-event-per-line into an `OCEL` (synthesizing `event_types`/`object_types` from the stream). *(Preferred — ggen's append-only emit stays cheap and crash-safe; partial last line tolerated, matching ggen's existing `read()` behavior.)*
- **(4b)** Provide a shared serializer in `ocel-core` that ggen uses to emit a form wasm4pm already reads.

**Acceptance:** given ggen's real log file, `wpm`/the library produces an `OCEL` with all events, correct relationships, and recovered type declarations; a truncated final line is tolerated (ggen appends concurrently).

---

## 5. NEED #4 — cross-repo dependency mechanism

ggen (`github.com/seanchatmangpt/ggen`, 15-crate workspace) and wasm4pm (`github.com/seanchatmangpt/wasm4pm`) are separate repos.

**Ask:** make `ocel-core` consumable by ggen. Options for the builder to choose:
- **git dependency** (preferred): `ocel-core = { git = "https://github.com/seanchatmangpt/wasm4pm", tag = "ocel-core-vX" }` — clean, no local path coupling.
- **crates.io publish** of `ocel-core` (cleanest long-term; needs release plumbing).
- path dependency — rejected (fragile across two repo roots).

For the discovery/conformance capabilities (§1), ggen consumes wasm4pm as an **external CLI oracle** (`wpm mining conformance`, `wpm run`) invoked as a subprocess — *not* a linked dependency. This keeps ggen's workspace light and matches ggen's Chicago-TDD doctrine (real external boundary, externalizable evidence). Only `ocel-core` is a linked dependency.

---

## 6. Non-goals / what stays in ggen

- The **living-LSP nerve** (analyzers, route registry, diagnostic species, `analyze_and_observe` seam, headless gate) — ggen domain, untouched.
- The **event builders** (`intel/events.rs`) — ggen domain; they produce `ocel-core` events.
- The **append/emit** of ggen's own log — ggen is the producer; it may keep appending NDJSON. Only *read/parse/mine/conform* leave.
- Decide per-file for `projection.rs` / `coverage.rs` / `self_audit.rs` / `gall_projection.rs`: if a function is **ggen-domain RDF projection** (ggen↔RDF), it stays; if it is **generic PM analytics**, it moves to wasm4pm. The builder should classify each and flag ambiguous ones back to ggen.

---

## 7. Acceptance criteria (definition of done for the build)

1. `ocel-core` crate exists, lightweight (serde/serde_json/chrono only), `wasm4pm-types` re-exports it, full wasm4pm suite green.
2. A documented type-mapping + a migration note for ggen (§3) including the serialized-name constraint (§3.1).
3. An NDJSON/event-stream importer (§4a) **or** a shared serializer (§4b) that round-trips ggen's real `.ocel.jsonl` log.
4. A consumable dependency path for ggen (§5).
5. A short ggen-migration checklist: which ggen files to delete (`ocel_types.rs`, `dfg.rs`, `conformance.rs`, parts of `mine.rs`/`log.rs`) and which call sites to repoint (`intel/events.rs`, anything importing `ggen_graph::ocel::*`).
6. **Proof obligation:** demonstrate ggen's emitted 6-link living-loop log mines into a conforming process via `wpm` (the external-oracle direction), proving ggen no longer needs its own conformance code.

---

## 8. Reference — exact current shapes (so the builder need not re-discover)

**ggen** (`crates/ggen-graph/src/ocel/ocel_types.rs`):
```rust
struct OcelLog { objects: Vec<OcelObject>, events: Vec<OcelEvent> }
struct OcelObject { id: String, r#type: String, attributes: HashMap<String,String> }
struct OcelEvent { id: String, activity: String, timestamp: DateTime<Utc>,
                   objects: Vec<OcelObjectRef>, attributes: HashMap<String,String> }
struct OcelObjectRef { id: String, r#type: String, qualifier: Option<String> }
```
ggen-graph re-exports + PM primitives to retire: `discover_dfg`, `DfgEdge`, `check_guard`, `check_lifecycle_order`, `EvidenceProjector`, coverage/self-audit.

**wasm4pm** (`crates/wasm4pm-types/src/ocel.rs`): `OCEL{event_types,object_types,events,objects}`, `OCELEvent{id, type, time: FixedOffset, attributes: Vec<OCELEventAttribute>, relationships: Vec<OCELRelationship>}`, `OCELObject{id,type,attributes,relationships}`, `OCELRelationship{object_id,qualifier}`, `OCELAttributeValue` (untagged: Integer/Float/Boolean/Time/String/Null). Import: `import_ocel_json`, `import_ocel_json_slice`. Conformance: `check_conformance_token_replay`, `check_conformance_alignment`.

---

*ggen-side contact point: the living-LSP OCEL emission is owned by `ggen-lsp`; the types by `ggen-graph`. Coordinate the serialized-name constraint (§3.1) with whoever holds the Gall-checkpoint receipts before renaming any field.*
