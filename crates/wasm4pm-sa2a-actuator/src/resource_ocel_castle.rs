//! CastleOcel conformance for the actuator's [`ResourceOcelEvent`].
//!
//! The actuator emits exactly one ad-hoc event type,
//! `sa2a.resource.actuation`, with no vocabulary tie to beam4pm's closed
//! `BeamPM.CastleOcel` vocabulary. This module is its only lawful CastleOcel
//! projection and is fail-closed: any `event_type` other than the mapped one
//! is refused with a typed
//! `REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE` error, never passed through.
//!
//! Every projected event carries the fixed CastleOcel attributes
//! `"authority" => "none"` / `"provenance" => "observation_only"`: an
//! actuation observation is never execution authority.
//!
//! The shared vocabulary, mapping law and deliberate-non-mapping list live
//! in `docs/reference/castle-ocel-conformance.md` and in
//! `wasm4pm-planner::sa2a::ocel_castle` (identical golden wire shape).

use crate::resource_ocel::ResourceOcelEvent;
use serde::Serialize;

/// The mapped event type: the actuator's only emitted OCEL event type.
pub const ACTUATOR_EVENT_TYPE: &str = "sa2a.resource.actuation";

/// CastleOcel target: an observed actuation is the observation of an
/// activity milestone (`activity_finished`), never the authority that
/// produced it.
pub const CASTLE_TARGET: &str = "activity_finished";

/// Typed refusal: never silent, never a guess.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CastleOcelError {
    UnmappedEventType { event_type: String },
    MissingTime { event_type: String },
}

impl std::fmt::Display for CastleOcelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CastleOcelError::UnmappedEventType { event_type } => {
                write!(f, "REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:{event_type}")
            }
            CastleOcelError::MissingTime { event_type } => {
                write!(f, "REFUSED:CASTLE_OCEL_MISSING_TIME:{event_type}")
            }
        }
    }
}

impl std::error::Error for CastleOcelError {}

/// One projected CastleOcel event (identical wire shape to
/// `wasm4pm-planner::sa2a::ocel_castle::CastleOcelEvent`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CastleOcelEvent {
    pub event_id: String,
    pub event_type: String,
    pub event_time: String,
    pub attributes: CastleOcelAttributes,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CastleOcelAttributes {
    pub authority: String,  // always "none"
    pub provenance: String, // always "observation_only"
    pub allocation_id: String,
    pub effect_digest: String,
    pub replay_key: String,
    pub generation: u64,
    pub actuator_state: String,
}

/// Project a [`ResourceOcelEvent`] into the CastleOcel JSON shape.
///
/// Deterministic: `index` (1-based) derives the event id; `time` is
/// caller-supplied, never sampled. Object bindings follow CastleOcel's
/// `activity_finished` requirement (`container`, `gym_act_episode`);
/// the allocation identity is bound under each required type.
pub fn project(
    event: &ResourceOcelEvent,
    index: usize,
    time: &str,
) -> Result<CastleOcelEvent, CastleOcelError> {
    if event.event_type != ACTUATOR_EVENT_TYPE {
        return Err(CastleOcelError::UnmappedEventType {
            event_type: event.event_type.clone(),
        });
    }
    if time.is_empty() {
        return Err(CastleOcelError::MissingTime {
            event_type: event.event_type.clone(),
        });
    }
    Ok(CastleOcelEvent {
        event_id: format!("castle-{:04}-{}", index, CASTLE_TARGET),
        event_type: CASTLE_TARGET.to_string(),
        event_time: time.to_string(),
        attributes: CastleOcelAttributes {
            authority: "none".to_string(),
            provenance: "observation_only".to_string(),
            allocation_id: event.object_id.clone(),
            effect_digest: event.effect_digest.clone(),
            replay_key: event.replay_key.clone(),
            generation: event.generation,
            actuator_state: event.state.clone(),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event() -> ResourceOcelEvent {
        ResourceOcelEvent {
            event_type: ACTUATOR_EVENT_TYPE.to_string(),
            object_type: "ResourceAllocation".to_string(),
            object_id: "alloc-1".to_string(),
            effect_digest: "digest-1".to_string(),
            replay_key: "replay-1".to_string(),
            generation: 3,
            state: "executed".to_string(),
        }
    }

    #[test]
    fn the_only_emitted_event_type_maps_to_activity_finished() {
        let out = project(&event(), 1, "2026-10-13T00:00:00Z").unwrap();
        assert_eq!(out.event_type, "activity_finished");
        assert_eq!(out.event_id, "castle-0001-activity_finished");
        assert_eq!(out.attributes.authority, "none");
        assert_eq!(out.attributes.provenance, "observation_only");
        assert_eq!(out.attributes.allocation_id, "alloc-1");
        assert_eq!(out.attributes.generation, 3);
    }

    #[test]
    fn any_other_event_type_is_refused_typed_not_silent() {
        let mut e = event();
        e.event_type = "sa2a.resource.deployment".to_string();
        let err = project(&e, 1, "2026-10-13T00:00:00Z").unwrap_err();
        assert_eq!(
            err.to_string(),
            "REFUSED:CASTLE_OCEL_UNMAPPED_EVENT_TYPE:sa2a.resource.deployment"
        );
    }

    #[test]
    fn missing_time_is_refused() {
        let err = project(&event(), 1, "").unwrap_err();
        assert_eq!(
            err.to_string(),
            "REFUSED:CASTLE_OCEL_MISSING_TIME:sa2a.resource.actuation"
        );
    }
}
