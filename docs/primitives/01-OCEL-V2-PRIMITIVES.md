# Agent 2 — OCEL v2 Primitive Agent

## Mission
Make OCEL v2 the canonical object-centric evidence surface. Build or harden primitives
for object types, event types, event-object relations, flattened projections, OCEL JSON
import/export.

## Status
Implemented. Core I/O, validation, flatten, lifecycle check, OC-DFG discovery, and
NDJSON streaming are all present and tested against real data. Object-centric Petri net
and Declare discovery are feature-gated (`feature = "ocel"`).

---

## Paper / Specification Grounding

- **OCEL 2.0 Standard** — IEEE Task Force on Process Mining (2023).
  `https://www.ocel-standard.org/`
- **Ghahfarokhi et al., "OCEL: A Standard for Object-Centric Event Logs"**, ICPM 2021.
- **van der Aalst, "Object-Centric Process Mining"**, ATAED 2019.
- **Berti & van der Aalst, "OC-DFG"**, ICPM 2023 — multi-typed directly-follows graph.

---

## Implementation Files

| File | Role |
|---|---|
| `wasm4pm/src/ocel_io.rs` | JSON load/export, NDJSON streaming, lifecycle validation, provenance traversal |
| `wasm4pm/src/ocel_flatten.rs` | Object-type projection to flat `EventLog`, flattening-loss measurement |
| `wasm4pm/src/models.rs` (lines 593–772) | `OCEL`, `OCELEvent`, `OCELObject`, `OCELObjectRelation` structs |
| `wasm4pm/src/advanced/ocdfg.rs` | Per-type OC-DFG discovery |
| `wasm4pm/src/oc_petri_net.rs` | Object-centric Petri net discovery (feature-gated) |
| `wasm4pm/src/advanced/oc_declare.rs` | OC-Declare constraint mining (feature-gated) |
| `wasm4pm/src/advanced/ocla.rs` | Object-centric log analytics |
| `wasm4pm/src/testing/ocel_exporter.rs` | Test-harness OCEL generation utilities |
| `wasm4pm/src/powl/discovery/ocel.rs` | POWL discovery from OCEL via OC-DFG |

---

## WASM Exports

| Export | Signature | Notes |
|---|---|---|
| `load_ocel2_from_json` | `(content: &str) → Result<String, JsValue>` | Returns handle |
| `export_ocel2_to_json` | `(handle: &str) → Result<String, JsValue>` | Pretty-printed |
| `load_ocel2_from_ndjson` | `(ndjson: &str) → Result<String, JsValue>` | Streaming NDJSON |
| `validate_ocel` | `(handle: &str) → Result<JsValue, JsValue>` | Referential integrity |
| `list_ocel_object_types` | `(ocel_handle: &str) → Result<JsValue, JsValue>` | Unique type list |
| `get_ocel_type_statistics` | `(ocel_handle: &str) → Result<JsValue, JsValue>` | Per-type counts |
| `flatten_ocel_to_eventlog` | `(ocel_handle: &str, object_type: &str) → Result<String, JsValue>` | Projection |
| `query_provenance_traversal` | `(ocel_handle: &str, query_json: &str) → Result<String, JsValue>` | Causal query |

---

## Test Suite

| Test File | Coverage |
|---|---|
| `wasm4pm/tests/ocel_real_data_tests.rs` | Lifecycle validation, flattening loss, OC-DFG on `ocel20_example.jsonocel` |
| `wasm4pm/tests/ocel_object_centric_audit.rs` | 5 audit dimensions: loading, OC discovery, multi-perspective conformance, lifecycle, coverage |
| `wasm4pm/tests/ocel_many_to_many_tests.rs` | Many-to-many event-object relation correctness |
| `wasm4pm/tests/ocel_lifecycle_wasm_export_tests.rs` | WASM export round-trips for lifecycle operations |
| `wasm4pm/tests/ocel_dfg_discovery_tests.rs` | Per-type OC-DFG discovery with edge-count assertions |
| `wasm4pm/tests/ocel_process_evidence_tests.rs` | Process evidence: event log derivation from OCEL |
| `wasm4pm/src/ocel_tests.rs` | Inline unit tests for OCEL struct methods |

---

## Verification Criteria

1. **Referential integrity** — `validate_ocel` rejects any event referencing a non-existent
   object ID. Error list must be empty for a valid OCEL.
2. **Lifecycle ordering** — `validate_ocel_object_lifecycles` enforces monotonic timestamp
   ordering per object across its events.
3. **Flattening completeness** — `flatten_ocel_to_eventlog` preserves all events involving
   the selected object type. `measure_flattening_loss` reports information discarded.
4. **Round-trip fidelity** — `export_ocel2_to_json(load_ocel2_from_json(s))` produces a
   structurally equivalent OCEL (same event/object counts).
5. **Feature gate** — All `#[cfg(feature = "ocel")]` blocks compile and the kernel-registered
   OCEL algorithms (`ocel_dfg`, `ocel_petri_net`, `ocel_oc_declare`) pass parity tests.

---

## Key Data Structures

```rust
// wasm4pm/src/models.rs:643
pub struct OCELEvent {
    pub id: String,
    pub event_type: String,
    pub timestamp: String,        // ISO-8601
    pub object_ids: Vec<String>,  // flat relation
    pub object_refs: Vec<OCELEventObjectRef>,  // qualified relation
    pub attributes: Vec<OCELEventAttribute>,
}

// wasm4pm/src/models.rs:694
pub struct OCELObject {
    pub id: String,
    pub object_type: String,
    pub attributes: Vec<OCELObjectAttribute>,
    pub attribute_changes: Vec<OCELObjectAttributeChange>,
    pub embedded_relations: Vec<OCELObjectRelRef>,
}

// wasm4pm/src/models.rs:713
pub struct OCEL {
    pub event_types: Vec<String>,
    pub object_types: Vec<String>,
    pub events: Vec<OCELEvent>,
    pub objects: Vec<OCELObject>,
    pub object_relations: Vec<OCELObjectRelation>,
}
```

---

## Planned / Not Yet Implemented

- **OCEL SQLite import** — The OCEL 2.0 standard also defines a SQLite format; only JSON
  and NDJSON are currently supported.
- **Object-to-object DFG** — OC-DFG per object-relation qualifier (not per event type).
- **OCEL diff / merge** — Comparing two OCEL logs or merging partial captures.
