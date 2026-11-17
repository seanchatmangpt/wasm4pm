//! CastleOcel mapping totality + golden-fixture court for the actuator's
//! `ResourceOcelEvent` (`resource_ocel` / `resource_ocel_castle`).
//!
//! Totality law: the actuator emits exactly one event type
//! (`sa2a.resource.actuation`); the projection admits exactly that type and
//! refuses every other string. A second emitted event type added without a
//! mapping entry fails `new_event_type_must_extend_the_mapping`.

use serde_json::Value;
use wasm4pm_sa2a_actuator::resource_ocel::ResourceOcelEvent;
use wasm4pm_sa2a_actuator::resource_ocel_castle::{
    project, ACTUATOR_EVENT_TYPE, CASTLE_TARGET,
};

fn event(event_type: &str) -> ResourceOcelEvent {
    ResourceOcelEvent {
        event_type: event_type.to_string(),
        object_type: "ResourceAllocation".to_string(),
        object_id: "alloc-1".to_string(),
        effect_digest: "digest-1".to_string(),
        replay_key: "replay-1".to_string(),
        generation: 3,
        state: "executed".to_string(),
    }
}

/// The only event type the actuator emits maps to its documented CastleOcel
/// target and preserves the `authority => "none"` invariant.
#[test]
fn the_only_emitted_event_type_round_trips_with_authority_none() {
    assert_eq!(ACTUATOR_EVENT_TYPE, "sa2a.resource.actuation");
    assert_eq!(CASTLE_TARGET, "activity_finished");
    let out = project(&event(ACTUATOR_EVENT_TYPE), 1, "2026-10-13T00:00:00Z").unwrap();
    assert_eq!(out.event_type, CASTLE_TARGET);
    assert_eq!(out.attributes.authority, "none");
    let json = serde_json::to_value(&out).unwrap();
    assert_eq!(json["attributes"]["authority"], "none");
    assert_eq!(json["attributes"]["provenance"], "observation_only");
}

/// Sabotage twin: any event type other than the mapped one is refused with
/// the typed refusal, never silently passed through. If a new actuator
/// event type is introduced, this test forces an explicit mapping decision.
#[test]
fn new_event_type_must_extend_the_mapping() {
    for intruder in [
        "sa2a.resource.deployment",
        "sa2a.resource.actuation.v2",
        "activity_finished",
        "",
    ] {
        let err = project(&event(intruder), 1, "2026-10-13T00:00:00Z")
            .expect_err("unmapped actuator event type must refuse");
        assert_eq!(
            err.to_string(),
            format!("REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:{intruder}")
        );
    }
}

/// Golden fixture: actuation projection matches the shared CastleOcel wire
/// shape.
#[test]
fn golden_fixture_actuation() {
    let out = project(&event(ACTUATOR_EVENT_TYPE), 1, "2026-10-13T00:00:00Z").unwrap();
    let actual: Value = serde_json::to_value(&out).unwrap();
    let expected: Value = serde_json::from_str(include_str!(
        "resource_vectors_castle/actuation.golden.json"
    ))
    .unwrap();
    assert_eq!(actual, expected);
}
