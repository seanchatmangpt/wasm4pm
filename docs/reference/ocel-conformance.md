<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/ocel-conformance.md; source-sha256: e61519bc35644b09acf17da833ae114404c3bf9e9b00aada2dc168034963566d; reason: canonical Diátaxis or ADR surface -->

# Reference: OCEL 2.0 Conformance Surface

This document is the type-level reference for the OCEL 2.0 conformance surface as
implemented: the relational/JSON log model, the conformance-checking API, the typed
admission boundary, and the shared-fixture contract with beam4pm. Every item cites
its defining source at `file:line`. All `compat` citations are against
`wasm4pm-compat` v26.8.7, pinned in the workspace root `Cargo.toml:34` with
`features = ["formats", "strict", "wasm4pm"]`; the crate is an external workspace
dependency (source in the cargo registry), not vendored under `crates/`. The OCPQ
conformance/query crate lives in-repo at `crates/ocpq/src/lib.rs`.

## The OCEL 2.0 log model (`wasm4pm_compat::ocel`)

The relational model is the object-centric event data `L = (E, O, eval, oaval)`
(mapped in `crates/ocpq/src/lib.rs:10-12`). JSON serialization uses the OCEL 2.0
camelCase keys (`eventTypes`, `objectTypes`, `objectId`, `type`).

Types (compat `src/ocel.rs`):

| Type | Fields (Rust name; JSON key) | Source |
|---|---|---|
| `OCEL` | `event_types` (`eventTypes`), `object_types` (`objectTypes`), `events`, `objects` | compat `src/ocel.rs:32-39` |
| `OCELType` | `name`, `attributes: Vec<OCELTypeAttribute>` | compat `src/ocel.rs:44-48` |
| `OCELTypeAttribute` | `name`, `value_type` (`type`) | compat `src/ocel.rs:51-54` |
| `OCELEventAttribute` | `name`, `value: OCELAttributeValue` | compat `src/ocel.rs:58-61` |
| `OCELEvent` | `id`, `event_type` (`type`), `time: DateTime<FixedOffset>`, `attributes`, `relationships` | compat `src/ocel.rs:64-72` |
| `OCELRelationship` | `object_id` (`objectId`), `qualifier` | compat `src/ocel.rs:76-79` |
| `OCELObject` | `id`, `object_type` (`type`), `attributes`, `relationships` | compat `src/ocel.rs:83-88` |
| `OCELObjectAttribute` | `name`, `value`, `time` | compat `src/ocel.rs:94-98` |
| `OCELAttributeValue` | untagged enum: `Integer(i64)`, `Float(f64)`, `Boolean(bool)`, `Time`, `String`, `Null` (default) | compat `src/ocel.rs:103-113` |

Relation accessors on `impl OCEL` (compat `src/ocel.rs`): `event_set()` (:195),
`object_set()` (:213), `eval(event_id)` (:238), `oaval(...)` (:280),
`object_attr_timeline(object_id)` (:333), `e2o(event_id) -> Vec<(object_id, qualifier)>`
(:363), `o2o(object_id) -> Vec<(object_id, qualifier)>` (:395),
`count_objects_of_type(object_type)` (:427). Builders: `OCELEvent::new`
(:436)/`with_attribute` (:445), `OCELEventAttribute::{string, integer}` (:452, :458),
`OCELObject::new` (:467), `OCELRelationship::new` (:486)/`qualified` (:492).

## Conformance-checking API (`wasm4pm_compat::conformance`)

Token-based replay and the quality dimensions, compat `src/conformance.rs`:

| Item | Signature / fields | Source |
|---|---|---|
| `SimdMarking` | SIMD marking with `fire_transitions(input_mask, output_mask)` | compat `src/conformance.rs:26,43` |
| `TokenReplayResult` | `fitness`, `produced_tokens`, `consumed_tokens`, `missing_tokens`, `remaining_tokens` | compat `src/conformance.rs:50-57` |
| `TokenReplayResult::calculate_fitness(produced, consumed, missing, remaining) -> f64` | closed-form `(consumed - missing) / (produced + remaining)`, NaN-safe, clamped to `[0, 1]` | compat `src/conformance.rs:87-101` |
| `ConformanceResult` | replay result + precision/generalization/simplicity; `with_precision` (:159), `with_generalization` (:175), `with_simplicity` (:187), `conformance_rate()` (:202) | compat `src/conformance.rs:121-160` |
| `SyncMove` / `LogOnlyMove` / `ModelOnlyMove` | alignment move markers | compat `src/conformance.rs:306-316` |
| `Deviation` | `position`, `label` | compat `src/conformance.rs:322` |
| `ConformanceVerdict` | deviation list; `is_perfect()` | compat `src/conformance.rs:348,363` |
| `ConformanceRefusal` | typed refusal enum | compat `src/conformance.rs:372` |
| `QualityDimension`, `Metric<const KIND, NUM, DEN>`, `QualityProfile` | compile-time rational metrics | compat `src/conformance.rs:405-577` |

## Object-centric conformance claims (`wasm4pm_compat::object_centric_conformance`)

A flat conformance triple over object-centric data is refused by construction —
claims must be scoped per object type (compat `src/object_centric_conformance.rs`):

- `ObjectTypeConformance { object_type, triple: ConformanceTriple }` — :37-41
- `ObjectCentricConformanceClaim { per_type, log_ref }` with `new` (:62),
  `is_grounded` (:79), `admit_flat()` (:102)
- `ObjectCentricConformanceRefusal` — `UngroundedClaim`, `NoObjectTypesScoped`,
  `UnscopedObjectType` (:122)

## OCPQ query/constraint crate (`crates/ocpq`)

Faithful implementation of Küsters & van der Aalst, "OCPQ: Object-Centric Process
Querying & Constraints" (arXiv:2506.11541v1, 2025). All citations
`crates/ocpq/src/lib.rs`:

| Item | Formal object | Source |
|---|---|---|
| `VarKind` (`Event` / `Object`) | the disjoint variable universes of Def. 1 | `lib.rs:39-44` |
| `VarDecl { name, kind, types }` + `admits_type` | `Var` (Def. 6) | `lib.rs:53-61,67` |
| `Binding { map: BTreeMap<String,String> }` + `empty/get/with` | `b ∈ B_L` (Def. 3) | `lib.rs:82-105` |
| `Binding::refines` | `⊑_L` parent-child (Def. 4) | `lib.rs:112-117` |
| `BasicPredicate::{E2O, O2O, Tbe}` + `holds` | `BASIC_L` (Def. 5) | `lib.rs:128-168,177` |
| `BindingBox { vars, preds }` + `satisfied_by` / `output` / `refines` | `b_L = (Var, Pred)` (Def. 6), `out_L` (Def. 6), `⪯_L` (Def. 7) | `lib.rs:260-267,276,316,371` |
| `ChildSet { edge, n_min, n_max }` | `CHILD SET_u^T (A, n_min, n_max)` (Sect. 4) | `lib.rs:401-410` |
| `ConstraintPredicate::{Basic, ChildSet}` | `constr(v)` mixes (Fig. 6) | `lib.rs:417-422` |
| `Edge { label, child }`, `Node { id, bbox, children, constr }` | tree edges/nodes (Def. 9) | `lib.rs:431-456` |
| `QueryTree { root, nodes }` | `T = (V, F, r, l, box)` (Def. 9) | `lib.rs:465-470` |
| `BindingVerdict`, `ConstraintResult` | satisfied/violated classification (Fig. 6) | `lib.rs:523-543` |
| `evaluate_constraint(tree, log)` | root `constr` evaluation (Fig. 6) | `lib.rs:553` |
| `evaluate_node_constraint(tree, node_id, log)` | generalized evaluation | `lib.rs:565` |
| `evaluate_query(tree, node_id, log)` | raw `out_L(box(node_id))` | `lib.rs:602` |
| `ocpq_eval_json(query_json, ocel_json)` / `ocpq_eval` (wasm) | JSON/WASM entry points | `lib.rs:616,630` |

## Typed admission surface (`wasm4pm_compat::admission` + `witness`)

The boundary verdict is a type, not a boolean (compat `src/admission.rs`,
`src/witness.rs`):

- `Admission<T, W> { value: T, witness: PhantomData<W> }` — holding one is
  type-level proof that an `Admit` impl accepted `value` against witness `W`;
  `new` (:60) and `into_evidence()` (:88) seal it into `state::Admitted` evidence —
  compat `src/admission.rs:37-43,60,88`
- `Refusal<T, W>` — the typed, named counterpart (e.g. `Refusal::new("DanglingEventObjectLink")`) — compat `src/admission.rs:120,171`
- `Admit` trait — `type Witness`; admits produce `Admission` or a named `Refusal` — compat `src/admission.rs:193-206`
- Witness types are zero-cost branded markers so `Admission<T, Ocel20>` cannot be
  mistaken for another format's admission: `Ocel20` with `KEY = "ocel-2.0"`,
`TITLE = "OCEL 2.0"`, `YEAR = Some(2023)`, `FAMILY = WitnessFamily::Standard` —
  compat `src/witness.rs:69-74,119`; finer-grained witnesses (e.g. per
  event/object-type) exist alongside it (`src/witness.rs:337-370`)

## Shared-fixture contract with beam4pm

wasm4pm owns the fixture corpus; beam4pm consumes it through its ingest/bridge
layer (no code dependency in the other direction).

Positive log fixtures — `fixtures/shared/`: `receipt.xes`, `running-example.xes`,
`small-example.xes`, `PermitLog.xes`, `InternationalDeclarations.xes`,
`bpi2020_travel.xes`, `roadtraffic100traces.xes`. Consumers:

- beam4pm RF2 conformance oracle court:
  `~/beam4pm/test/beam4pm_rf2_conformance_test.exs:15` runs a real conformance
  check against the absolute path `/Users/sac/wasm4pm/fixtures/shared/receipt.xes`.
- beam4pm RF3 OCEL oracle: `~/beam4pm/native/rf3-ocel-oracle/src/main.rs:4`
  (documented in `~/beam4pm/native/rf3-ocel-oracle/README.md`).
- in-repo real-data validation: `wasm4pm/tests/real_data_algo_validation.rs:146-147`
  (falls back from the pm4py copy to `tests/fixtures/receipt.xes`).

Negative / sabotage corpus — `fixtures/negative/` (14 fixtures `N01`–`N14` plus
`manifest.json`). Each entry is an invalid trace/model that MUST be refused by a
named primitive with a named refusal (`expected_refusal` maps to canonical
`AndonPull`/`AndonReason` variants: `RouteConformanceGap`, `IllegalRouteMotion`,
`LifecycleNotTerminated`, `ObjectLifecycleViolation`); each records its
`minimal_counterexample`, proving the fixture isolates exactly one defect.
Consumers:

- `wasm4pm/tests/negative_corpus.rs` (loads the manifest; absolute path rooted at
  `CARGO_MANIFEST_DIR`, `negative_corpus.rs:50`)
- beam4pm RF3 OCEL oracle: `~/beam4pm/native/rf3-ocel-oracle/src/main.rs:4`

Contract stability rule: changing any file under `fixtures/shared/` or
`fixtures/negative/` (including `manifest.json` schema) can break the beam4pm
courts that read it cross-repo; treat fixture edits as a cross-repo transition and
re-run `beam4pm_rf2_conformance_test.exs` and the RF3 oracle after any change.
