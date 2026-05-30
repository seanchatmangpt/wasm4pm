# 01 — OCEL v2 Primitive

The canonical object-centric **evidence** surface of the wasm4pm kernel. Beyond OCEL v1
(events + flat object ids) this primitive implements the full OCEDO meta-model: typed
objects, **object-to-object relations with qualifiers**, **qualified event-object refs**,
**time-varying object attributes** (`oaval` per timestamp), and the **object-type
cardinality** (`min_count`/`max_count`, `created_by`/`terminated_by`, `schema`) used by the
exact-1.0 route admission gate.

## Paper grounding

- **OCEDO meta-model** — Latif, Latif & Rahman, *"Object-Centric Analysis of XES Event Logs:
  Integrating OCED Modeling with SPARQL Queries"* (Fig. 1). The meta-model has three regions:
  - **A (event side):** `event` has exactly one `time`, one `event type`, and `1..*`
    `event attribute value`s (each with a name).
  - **B (object side):** `object` has one `object type`, `1..*` `object attribute value`s, and
    `from/to` `object relation`s each carrying an `object relation type` (qualifier).
  - **C (E2O):** the dotted arc connecting `event` and `object` through a `qualifier`.
- **OCPQ Def. 2** — `L = (E, O, eval, oaval)`:
  - `E` = events, `O` = objects;
  - **every event has ≥ 1 qualified object reference** (E2O);
  - objects can carry **qualified O2O references**;
  - `type` and the `objects` (O2O wiring) are **time-stable**, while attribute values vary —
    `eval(e)` is the event-attribute map, `oaval(o, t)` is the object-attribute map *as of* `t`.

## Formal model → code

| Formal object | Code |
|---|---|
| `L = (E, O, eval, oaval)` | `OCEL` (`crates/ocel-core/src/lib.rs`) |
| `E` / `O` | `OCEL::event_set()` / `OCEL::object_set()` |
| `eval(e)` | `OCEL::eval(event_id)` → name→value map |
| `oaval(o, t)` | `OCEL::oaval(object_id, t)` → latest value with stamp ≤ `t` (time-varying) |
| temporal support of `oaval(o,·)` | `OCEL::object_attr_timeline(object_id)` |
| E2O qualified ref (arc C) | `OCEL::e2o(event_id)` → `(object_id, qualifier)` |
| O2O qualified ref (arc B `from/to`) | `OCEL::o2o(object_id)` → `(object_id, qualifier)` |
| object-type cardinality | `ObjectTypeCardinality { created_by, terminated_by, schema, min_count, max_count }` |

`oaval` is genuinely time-varying: for each attribute name it returns the **latest value
whose stamp is `≤ t`**; values first set after `t` are absent. This is the temporal
projection of the OCED `object attribute value` node, and the reason object attributes carry a
`time` field while object `type`/`relationships` do not (time-stable).

## API

### `crates/ocel-core` (the primitive)

- `validate::validate(ocel, cardinality) -> ValidationReport` — checks the OCEDO/OCPQ
  invariants and the object-type window. Distinct machine-stable error codes:
  `UNDECLARED_EVENT_TYPE`, `UNDECLARED_OBJECT_TYPE`, `E2O_EMPTY` (OCPQ Def. 2),
  `DANGLING_E2O`, `DANGLING_O2O`, `DUPLICATE_EVENT_ID`, `DUPLICATE_OBJECT_ID`,
  `CARDINALITY_MIN`, `CARDINALITY_MAX`.
- `flatten::flatten(ocel, object_type) -> FlatLog` — projection onto a chosen object type:
  each object of that type becomes a **case** whose trace is the time-ordered event-type
  labels of the events that qualified-reference it (convergent events appear in each case;
  divergent events are dropped). Deterministic: cases ordered by id, events by `(time, id)`.

### `wasm4pm/src/ocel_v2.rs` (`#[wasm_bindgen]` reachable surface)

All return a JSON **string** (caller does `JSON.parse`):

- `load_ocel_v2(json)` → normalized OCEL JSON (parse + re-serialize; errors on malformed).
- `validate_ocel_v2(json, cardinality_json)` → `ValidationReport { valid, errors[{code,message}] }`.
  `cardinality_json` is keyed by object-type name, each value `{created_by?, terminated_by?,
  schema?, min_count?, max_count?}` (the route `object_types` shape); `""`/`"{}"` = none.
- `flatten_ocel_v2(json, object_type)` → `FlatLog { object_type, cases[{case_id, trace, event_ids}] }`.

## Order-to-Cash fixture

`crates/ocel-core/tests/ocel_v2.rs` carries a complete 8-event / 8-object Order-to-Cash log
(Customer / Order / Item ×2 / Package / Invoice / Payment / Employee) with the O2O chain
`payment —settles→ invoice —bills→ order —contains→ item` and `order —placed_by→ customer`,
`package —packs→ item`. The Order `total` attribute changes `100 → 120` at two timestamps to
exercise `oaval`.

## Per-primitive ledger

```
Primitive:        OCEL v2 (object-centric evidence)
Paper grounding:  OCEDO meta-model (Latif et al., Fig. 1); OCPQ Def. 2  L=(E,O,eval,oaval)
Artifact:         crates/ocel-core/src/lib.rs   (formal layer: event_set/object_set/eval/
                                                  oaval/object_attr_timeline/e2o/o2o,
                                                  ObjectTypeCardinality)
                  crates/ocel-core/src/validate.rs (OCEDO/OCPQ + cardinality checks)
                  crates/ocel-core/src/flatten.rs  (projection to one object type)
                  wasm4pm/src/ocel_v2.rs           (load/validate/flatten_ocel_v2 wasm exports)
                  wasm4pm/src/lib.rs (module decl), Cargo.toml (ocel-core dep, gated by `ocel`)
Positive proof:   cargo test -p ocel-core  (21 pass: 2 baseline + 19 new) — esp.
                    ocpq_every_event_has_at_least_one_qualified_object_ref,
                    e2o_and_o2o_qualified_refs_resolve,
                    oaval_is_time_varying_latest_le_t,
                    lawful_with_cardinality_window_validates,
                    flatten_order_yields_one_case_with_full_order_trace,
                    flatten_item_yields_one_case_per_item_convergent_pack,
                    flatten_is_deterministic
                  cargo test -p wasm4pm --features ocel --test ocel_v2  (8 pass)
                  Node real-WASM smoke (no vi.mock): load/validate/flatten all PASS through
                    actual wasm32 build (wasm-pack --target nodejs --features ocel).
Negative proof:   event_without_object_ref_refuses_with_e2o_empty  -> E2O_EMPTY (OCPQ Def. 2)
                  dangling_e2o_refuses / dangling_o2o_refuses       -> referential integrity
                  cardinality_min_refuses / cardinality_max_refuses -> CARDINALITY_MIN/MAX
                  undeclared_object_type_refuses                    -> UNDECLARED_OBJECT_TYPE
                  flatten_ocel_v2_rejects_unknown_type              -> Err on unknown projection
Reachability:     Rust (ocel-core) | WASM (#[wasm_bindgen] in wasm4pm, verified via Node) | CLI*
Verdict:          ALIVE
```

\* CLI exposure (`wpm` subcommand wiring of these three WASM exports) is A9/reconciliation's
leg; the WASM exports they wrap are proven reachable here. Until the `wpm` subcommand lands the
*CLI* leg is PARTIAL while Rust + WASM are ALIVE.

## Notes / gotchas

- **Native serialization is null.** Per repo doctrine, `to_js_str` returns `JsValue::null()` on
  non-wasm32 targets, so `wasm4pm/tests/ocel_v2.rs` only asserts Ok/Err on native; JSON content
  correctness is proven by the `ocel-core` math-oracle tests and the Node WASM smoke check —
  **always validate WASM output via Node, not `cargo test`** for the export layer.
- **No FM-5.** Expected values in the tests come from the hand-authored Order-to-Cash story and
  the OCEDO/OCPQ definitions, never from calling the code under test. The WASM smoke path uses
  the real `wasm4pm.js`/wasm binary — no `vi.mock('init.js')`.
- The crate's existing `intake.rs` streaming projection (NDJSON, `ExtractionPlan`) is retained
  and complementary to the in-memory `flatten`.
