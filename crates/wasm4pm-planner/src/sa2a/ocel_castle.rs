//! CastleOcel conformance layer for the portable SA2A boundary's ad-hoc OCEL
//! events ([`OcelEvent`]).
//!
//! beam4pm's `BeamPM.CastleOcel` owns a closed 10-event vocabulary
//! (`system_bootstrapped`, `pod_provisioned`, `container_started`,
//! `ggen_sync_observed`, `activity_started`, `activity_finished`,
//! `episode_recorded`, `evidence_admitted`, `episode_receipt_sealed`,
//! `refused_observation`), a fixed per-event-type object binding
//! ([`REQUIRED_OBJECTS`]), and the fixed attribute pair
//! `"authority" => "none"` / `"provenance" => "observation_only"` on every
//! projected event.
//!
//! The SA2A boundary's [`OcelEvent`] carries a free-form `event_type`
//! string. This module is the only lawful path from that free-form string
//! into the CastleOcel vocabulary, and it is fail-closed: an event type
//! without an explicit mapping entry is refused with a typed
//! [`CastleOcelError::UnmappedEventType`], never silently passed through.
//!
//! Full mapping table and the deliberate-non-mapping list live in
//! `docs/reference/castle-ocel-conformance.md`.

use serde::Serialize;

use super::ocel::OcelEvent;

/// The closed CastleOcel event vocabulary, in lifecycle order (exact name
/// strings from `BeamPM.CastleOcel.event_names/0`).
pub const CASTLE_EVENT_NAMES: [&str; 10] = [
    "system_bootstrapped",
    "pod_provisioned",
    "container_started",
    "ggen_sync_observed",
    "activity_started",
    "activity_finished",
    "episode_recorded",
    "evidence_admitted",
    "episode_receipt_sealed",
    "refused_observation",
];

/// CastleOcel's per-event-type object binding (event name -> required object
/// types, canonical order of `BeamPM.CastleOcel.required_objects/0`).
pub const REQUIRED_OBJECTS: [(&str, &[&str]); 10] = [
    ("system_bootstrapped", &["system"]),
    ("pod_provisioned", &["system", "pod"]),
    ("container_started", &["pod", "container"]),
    ("ggen_sync_observed", &["container"]),
    ("activity_started", &["container", "gym_act_episode"]),
    ("activity_finished", &["container", "gym_act_episode"]),
    ("episode_recorded", &["gym_act_episode"]),
    ("evidence_admitted", &["gym_act_episode"]),
    ("episode_receipt_sealed", &["gym_act_episode"]),
    ("refused_observation", &["system"]),
];

/// The mapping table: every wasm4pm `event_type` string with a CastleOcel
/// mapping. Identity entries cover the CastleOcel names themselves (a
/// planner observation already carrying a CastleOcel name is admitted
/// unchanged); every other string is refused, not guessed.
pub const MAPPING: [(&str, &str); 10] = [
    ("system_bootstrapped", "system_bootstrapped"),
    ("pod_provisioned", "pod_provisioned"),
    ("container_started", "container_started"),
    ("ggen_sync_observed", "ggen_sync_observed"),
    ("activity_started", "activity_started"),
    ("activity_finished", "activity_finished"),
    ("episode_recorded", "episode_recorded"),
    ("evidence_admitted", "evidence_admitted"),
    ("episode_receipt_sealed", "episode_receipt_sealed"),
    ("refused_observation", "refused_observation"),
];

/// wasm4pm event-type strings deliberately NOT mapped here. Today exactly
/// one: the actuator's `sa2a.resource.actuation` is mapped at its own
/// boundary (`wasm4pm-sa2a-actuator::resource_ocel_castle`), not guessed at
/// the planner boundary. Free-form caller strings that are neither
/// CastleOcel names nor mapped at an owning boundary carry no entry and are
/// refused.
pub const UNMAPPED_EVENT_TYPES: [&str; 1] = ["sa2a.resource.actuation"];

/// Typed refusal: never silent, never a guess.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CastleOcelError {
    /// The event type has no mapping entry. Refused, not passed through.
    UnmappedEventType { event_type: String },
    /// A required CastleOcel object identity was absent.
    MissingObjectIdentity {
        event_type: String,
        object_type: String,
    },
    /// A caller-supplied time was required but absent/empty.
    MissingTime { event_type: String },
}

impl std::fmt::Display for CastleOcelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CastleOcelError::UnmappedEventType { event_type } => {
                write!(f, "REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:{event_type}")
            }
            CastleOcelError::MissingObjectIdentity {
                event_type,
                object_type,
            } => write!(
                f,
                "REFUSED:CASTLE_OCEL_MISSING_OBJECT_IDENTITY:{event_type}:{object_type}"
            ),
            CastleOcelError::MissingTime { event_type } => {
                write!(f, "REFUSED:CASTLE_OCEL_MISSING_TIME:{event_type}")
            }
        }
    }
}

impl std::error::Error for CastleOcelError {}

/// One projected CastleOcel event in the repo's OCEL 2.0 wire shape
/// (`{event_id, event_type, event_time, attributes}`), the same shape
/// beam4pm's `BeamPM.Ocel.encode/1` emits and `BeamPM.Ocel.decode/1` reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CastleOcelEvent {
    pub event_id: String,
    pub event_type: String,
    pub event_time: String,
    pub attributes: CastleOcelAttributes,
}

/// Fixed CastleOcel attributes plus observation-only provenance carried over
/// from the wasm4pm event. `authority` is INVARIANTLY `"none"`: no event in
/// this log is, carries, or implies execution authority.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CastleOcelAttributes {
    pub authority: String,   // always "none"
    pub provenance: String,  // always "observation_only"
    pub subject: String,
    pub effect_id: String,
    pub provider: String,
    pub outcome: String,
}

/// Map a wasm4pm `event_type` string to its CastleOcel event name.
/// Fail-closed: unknown strings are [`CastleOcelError::UnmappedEventType`].
pub fn map_event_type(event_type: &str) -> Result<&'static str, CastleOcelError> {
    MAPPING
        .iter()
        .find(|(from, _)| *from == event_type)
        .map(|(_, to)| *to)
        .ok_or_else(|| CastleOcelError::UnmappedEventType {
            event_type: event_type.to_string(),
        })
}

/// Project a wasm4pm [`OcelEvent`] into the CastleOcel JSON shape.
///
/// Deterministic: `index` (1-based trace position) derives the event id, no
/// clock reads anywhere; `time` is caller-supplied, never sampled.
/// `subject` is bound under each object type this CastleOcel event requires
/// ([`REQUIRED_OBJECTS`]) — the single-witness convention: the SA2A boundary
/// carries exactly one identity per event.
pub fn project(
    event: &OcelEvent,
    index: usize,
    time: &str,
) -> Result<CastleOcelEvent, CastleOcelError> {
    let castle_name = map_event_type(event.event_type)?;

    if time.is_empty() {
        return Err(CastleOcelError::MissingTime {
            event_type: event.event_type.to_string(),
        });
    }

    if event.subject.is_empty() {
        return Err(CastleOcelError::MissingObjectIdentity {
            event_type: event.event_type.to_string(),
            object_type: "subject".to_string(),
        });
    }

    Ok(CastleOcelEvent {
        event_id: format!("castle-{:04}-{}", index, castle_name),
        event_type: castle_name.to_string(),
        event_time: time.to_string(),
        attributes: CastleOcelAttributes {
            authority: "none".to_string(),
            provenance: "observation_only".to_string(),
            subject: event.subject.to_string(),
            effect_id: event.effect_id.to_string(),
            provider: event.provider.to_string(),
            outcome: event.outcome.to_string(),
        },
    })
}

/// The object bindings a projected event carries: one relationship per
/// required CastleOcel object type, all bound to the event's `subject`
/// (single-witness convention).
pub fn object_bindings(castle_name: &str) -> &'static [&'static str] {
    REQUIRED_OBJECTS
        .iter()
        .find(|(name, _)| *name == castle_name)
        .map(|(_, types)| *types)
        .unwrap_or(&[])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(event_type: &str) -> OcelEvent<'_> {
        OcelEvent {
            event_type,
            subject: "subj-1",
            effect_id: "eff-1",
            provider: "prov-1",
            outcome: "succeeded",
        }
    }

    #[test]
    fn every_mapping_entry_targets_the_closed_vocabulary() {
        for (from, to) in MAPPING {
            assert!(
                CASTLE_EVENT_NAMES.contains(&to),
                "mapping target `{to}` (from `{from}`) is outside the closed CastleOcel vocabulary"
            );
        }
    }

    #[test]
    fn mapping_is_total_over_the_closed_vocabulary() {
        for name in CASTLE_EVENT_NAMES {
            assert_eq!(
                map_event_type(name).unwrap(),
                name,
                "CastleOcel name `{name}` has no identity mapping entry"
            );
        }
        assert_eq!(MAPPING.len(), CASTLE_EVENT_NAMES.len());
    }

    #[test]
    fn required_objects_cover_every_vocabulary_member() {
        for name in CASTLE_EVENT_NAMES {
            assert!(
                REQUIRED_OBJECTS.iter().any(|(n, _)| *n == name),
                "no object binding for `{name}`"
            );
            assert!(
                !object_bindings(name).is_empty(),
                "empty object binding for `{name}`"
            );
        }
    }

    #[test]
    fn unmapped_event_type_is_refused_typed_not_silent() {
        let err = map_event_type("sa2a.resource.actuation").unwrap_err();
        assert_eq!(
            err.to_string(),
            "REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:sa2a.resource.actuation"
        );
        let err = map_event_type("planner.candidate.selected").unwrap_err();
        assert!(matches!(err, CastleOcelError::UnmappedEventType { .. }));
    }

    #[test]
    fn projection_preserves_authority_none_invariant() {
        let out = project(&event("evidence_admitted"), 1, "2026-10-13T00:00:00Z").unwrap();
        assert_eq!(out.attributes.authority, "none");
        assert_eq!(out.attributes.provenance, "observation_only");
        assert_eq!(out.event_type, "evidence_admitted");
        assert_eq!(out.event_id, "castle-0001-evidence_admitted");
        assert_eq!(object_bindings("evidence_admitted"), &["gym_act_episode"]);
    }

    #[test]
    fn missing_time_is_refused() {
        let err = project(&event("evidence_admitted"), 1, "").unwrap_err();
        assert_eq!(
            err.to_string(),
            "REFUSED:CASTLE_OCEL_MISSING_TIME:evidence_admitted"
        );
    }
}
