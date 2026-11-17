//! CastleOcel mapping totality + golden-fixture court for the SA2A
//! planner-boundary OCEL events (`sa2a::ocel` / `sa2a::ocel_castle`).
//!
//! Totality law: the mapping table (`MAPPING`) must cover the entire
//! enumerated wasm4pm event-type domain. Removing ANY mapping entry makes a
//! CastleOcel name unmapped, and this court fails (sabotage twin by
//! construction). Adding a new event type without a mapping entry fails the
//! vocabulary-membership and refusal courts below.

use serde_json::Value;
use wasm4pm_planner::sa2a::ocel::OcelEvent;
use wasm4pm_planner::sa2a::ocel_castle::{
    map_event_type, project, CASTLE_EVENT_NAMES, MAPPING, REQUIRED_OBJECTS, UNMAPPED_EVENT_TYPES,
};

fn event(event_type: &str) -> OcelEvent<'_> {
    OcelEvent {
        event_type,
        subject: "subj-1",
        effect_id: "eff-1",
        provider: "prov-1",
        outcome: "succeeded",
    }
}

/// Every CastleOcel name has exactly one identity mapping entry. Removing a
/// mapping entry (sabotage twin) leaves that name unmapped and this test
/// fails.
#[test]
fn totality_mapping_covers_the_closed_vocabulary_exactly() {
    assert_eq!(
        MAPPING.len(),
        CASTLE_EVENT_NAMES.len(),
        "mapping table size must equal the closed vocabulary size"
    );
    for name in CASTLE_EVENT_NAMES {
        let entries: Vec<_> = MAPPING
            .iter()
            .filter(|(from, _)| *from == name)
            .collect();
        assert_eq!(
            entries.len(),
            1,
            "CastleOcel name `{name}` must have exactly one mapping entry"
        );
        assert_eq!(entries[0].1, name, "`{name}` maps to itself (identity)");
    }
}

/// Every CastleOcel name has a non-empty required-object binding.
#[test]
fn totality_object_bindings_cover_the_closed_vocabulary() {
    for name in CASTLE_EVENT_NAMES {
        let entry = REQUIRED_OBJECTS
            .iter()
            .find(|(n, _)| *n == name)
            .unwrap_or_else(|| panic!("no object binding for `{name}`"));
        assert!(!entry.1.is_empty(), "empty object binding for `{name}`");
        for object_type in entry.1 {
            assert!(
                [
                    "system",
                    "pod",
                    "container",
                    "gym_act_episode"
                ]
                .contains(object_type),
                "object type `{object_type}` is not a CastleOcel object type"
            );
        }
    }
}

/// Every mapping entry round-trips through real projection + real
/// serialization with the `authority => "none"` invariant intact.
#[test]
fn every_mapped_event_type_round_trips_with_authority_none() {
    for (index, (from, to)) in MAPPING.iter().enumerate() {
        let out = project(&event(from), index + 1, "2026-10-13T00:00:00Z")
            .unwrap_or_else(|e| panic!("mapping entry `{from}` failed projection: {e}"));
        assert_eq!(out.event_type, *to);
        assert_eq!(out.attributes.authority, "none");
        assert_eq!(out.attributes.provenance, "observation_only");
        let json = serde_json::to_value(&out).unwrap();
        assert_eq!(json["attributes"]["authority"], "none");
        assert_eq!(json["attributes"]["provenance"], "observation_only");
    }
}

/// Deliberate non-mappings are refused with the exact typed refusal string.
#[test]
fn deliberate_non_mappings_are_refused_not_guessed() {
    for event_type in UNMAPPED_EVENT_TYPES {
        let err = map_event_type(event_type).expect_err("unmapped type must refuse");
        assert_eq!(
            err.to_string(),
            format!("REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:{event_type}")
        );
    }
    // Arbitrary free-form strings refuse too.
    let err = map_event_type("planner.candidate.selected").unwrap_err();
    assert!(err.to_string().starts_with("REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:"));
}

/// Golden fixture: evidence_admitted projection is byte-shaped like
/// beam4pm's `BeamPM.Ocel` OCEL 2.0 event maps.
#[test]
fn golden_fixture_evidence_admitted() {
    let out = project(&event("evidence_admitted"), 1, "2026-10-13T00:00:00Z").unwrap();
    let actual: Value = serde_json::to_value(&out).unwrap();
    let expected: Value = serde_json::from_str(
        include_str!("fixtures/castle_ocel/evidence_admitted.golden.json"),
    )
    .unwrap();
    assert_eq!(actual, expected);
}

/// Golden fixture: refused_observation projection.
#[test]
fn golden_fixture_refused_observation() {
    let refused = OcelEvent {
        event_type: "refused_observation",
        subject: "subj-1",
        effect_id: "eff-1",
        provider: "prov-1",
        outcome: "refused",
    };
    let out = project(&refused, 2, "2026-10-13T00:00:00Z").unwrap();
    let actual: Value = serde_json::to_value(&out).unwrap();
    let expected: Value = serde_json::from_str(
        include_str!("fixtures/castle_ocel/refused_observation.golden.json"),
    )
    .unwrap();
    assert_eq!(actual, expected);
}
