# CastleOcel Conformance (wasm4pm -> beam4pm CastleOcel)

Wasm4pm emits ad-hoc OCEL events at two boundaries. beam4pm's
`BeamPM.CastleOcel` owns a CLOSED 10-event vocabulary, a fixed per-event
object binding, and the invariant attributes `"authority" => "none"` /
`"provenance" => "observation_only"` on every event. The conformance layer
described here is the only lawful path from a wasm4pm event into that
vocabulary, and it is fail-closed: an event type without an explicit
mapping entry is REFUSED with a typed error, never silently passed
through.

## Implementations

| Crate | Module | Input |
|---|---|---|
| `wasm4pm-planner` | `wasm4pm_planner::sa2a::ocel_castle` | `sa2a::ocel::OcelEvent` (free-form `event_type: &str`) |
| `wasm4pm-sa2a-actuator` | `wasm4pm_sa2a_actuator::resource_ocel_castle` | `resource_ocel::ResourceOcelEvent` (`event_type: String`) |

Both modules serialize to the same OCEL 2.0 event map shape beam4pm's
`BeamPM.Ocel.encode/1` emits and `BeamPM.Ocel.decode/1` reads:
`{event_id, event_type, event_time, attributes}`. Event ids are derived
from the 1-based trace position (deterministic, no clock); `event_time`
is caller-supplied, never sampled.

## Mapping table

### `wasm4pm-planner::sa2a::ocel_castle` (planner `OcelEvent`)

| wasm4pm event_type | CastleOcel event name | Notes |
|---|---|---|
| `system_bootstrapped` | `system_bootstrapped` | identity |
| `pod_provisioned` | `pod_provisioned` | identity |
| `container_started` | `container_started` | identity |
| `ggen_sync_observed` | `ggen_sync_observed` | identity |
| `activity_started` | `activity_started` | identity |
| `activity_finished` | `activity_finished` | identity |
| `episode_recorded` | `episode_recorded` | identity |
| `evidence_admitted` | `evidence_admitted` | identity |
| `episode_receipt_sealed` | `episode_receipt_sealed` | identity |
| `refused_observation` | `refused_observation` | identity |
| any other string | **UNMAPPED** | refused: `REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:<type>` |

The planner boundary's `event_type` is caller-supplied free-form text, so
the mapping admits exactly the closed CastleOcel vocabulary (identity)
and refuses everything else. Provenance fields (`subject`, `effect_id`,
`provider`, `outcome`) travel as observation-only attributes; `subject`
is bound under each object type the mapped CastleOcel event requires
(single-witness convention — the SA2A boundary carries exactly one
identity per event).

### `wasm4pm-sa2a-actuator::resource_ocel_castle` (`ResourceOcelEvent`)

| wasm4pm event_type | CastleOcel event name | Notes |
|---|---|---|
| `sa2a.resource.actuation` | `activity_finished` | the actuator's only emitted event type |
| any other string | **UNMAPPED** | refused: `REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:<type>` |

An actuation observation is the observation of an activity milestone,
never the authority that produced it. Allocation provenance
(`allocation_id`, `effect_digest`, `replay_key`, `generation`,
`actuator_state`) travels as observation-only attributes.

## Deliberate non-mappings

| Event source | Event types | Status |
|---|---|---|
| `wasm4pm-planner::sa2a::telemetry::Event` | `kind: &str` — free-form, no fixed literal vocabulary in the codebase | UNMAPPED by construction: no string to map; any concrete kind must gain an explicit mapping entry before CastleOcel projection |
| `wasm4pm-cognition::ocel::derive_ocel` | `run-start`, `run-end`, per-step `kind` strings | OUT OF SCOPE for this lane (separate cognition OCEL surface with its own wire shape); no CastleOcel mapping exists and none is claimed |
| `wasm4pm-testing::receipt_to_ocel_event` | test-harness receipt projection | OUT OF SCOPE (test-only surface) |
| `wasm4pm-sa2a-actuator` | any `event_type` other than `sa2a.resource.actuation` | refused at the actuator boundary |

## Invariants preserved

- `attributes.authority == "none"` on EVERY projected event: no event is,
  carries, or implies execution authority. Enforced by
  `sa2a_ocel_castle_totality.rs` (planner) and
  `resource_ocel_castle_totality.rs` (actuator).
- `attributes.provenance == "observation_only"`: an event named
  `evidence_admitted` records that an admission transition was OBSERVED,
  not that the evidence is true.
- Fail-closed totality: removing any mapping entry fails the totality
  court; a newly introduced event type without a mapping entry fails the
  totality/refusal courts.

## Golden fixtures

- `crates/wasm4pm-planner/tests/fixtures/castle_ocel/evidence_admitted.golden.json`
- `crates/wasm4pm-planner/tests/fixtures/castle_ocel/refused_observation.golden.json`
- `crates/wasm4pm-sa2a-actuator/tests/resource_vectors_castle/actuation.golden.json`

## Reference vocabulary

`BeamPM.CastleOcel` (beam4pm `lib/beam4pm_castle_ocel.ex`): event names
`system_bootstrapped`, `pod_provisioned`, `container_started`,
`ggen_sync_observed`, `activity_started`, `activity_finished`,
`episode_recorded`, `evidence_admitted`, `episode_receipt_sealed`,
`refused_observation`; object types `system`, `pod`, `container`,
`gym_act_episode`.
