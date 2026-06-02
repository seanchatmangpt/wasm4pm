//! OCEL-v2 flattening / projection to a single object type.
//!
//! Flattening an object-centric log to a chosen object type `ot` turns each
//! object `o` of type `ot` into a *case*, whose trace is the time-ordered
//! sequence of (event-type) labels of the events that qualified-reference `o`
//! (the E2O `C` arc of the OCEDO meta-model). This is the projection used to
//! recover a classical XES-style single-case log from an OCEL, and the standard
//! lossy step preceding control-flow discovery (van der Aalst, OCEL flattening).
//!
//! The projection is *deterministic*: cases are ordered by object id, events
//! within a case by `(time, event id)`. An event that references several objects
//! of the chosen type is duplicated into each (convergence); events referencing
//! no object of the chosen type are dropped (divergence boundary).

use crate::OCEL;

/// A flattened case: one object instance of the projected type and its trace.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct FlatCase {
    /// The object id that defines this case.
    pub case_id: String,
    /// Time-ordered event-type labels (the control-flow trace).
    pub trace: Vec<String>,
    /// Event ids backing the trace, parallel to `trace` (for replay/provenance).
    pub event_ids: Vec<String>,
}

/// A flattened event log: the projection of an OCEL onto one object type.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct FlatLog {
    /// The object type this log was flattened to.
    pub object_type: String,
    /// One case per object of `object_type`, ordered by case id.
    pub cases: Vec<FlatCase>,
}

/// Flatten `ocel` onto `object_type`, returning one deterministic case per
/// object of that type.
///
/// Returns `Err` if `object_type` is not declared in `ocel.object_types`.
pub fn flatten(ocel: &OCEL, object_type: &str) -> Result<FlatLog, String> {
    if !ocel.object_types.iter().any(|t| t.name == object_type) {
        return Err(format!(
            "object type '{object_type}' is not declared in objectTypes"
        ));
    }

    // Collect target object ids (ordered by id for determinism).
    let mut target_ids: Vec<&str> = ocel
        .objects
        .iter()
        .filter(|o| o.object_type == object_type)
        .map(|o| o.id.as_str())
        .collect();
    target_ids.sort_unstable();

    // For each target object, gather (time, event_id, event_type) of referencing events.
    let mut cases = Vec::with_capacity(target_ids.len());
    for oid in target_ids {
        let mut rows: Vec<(chrono::DateTime<chrono::FixedOffset>, &str, &str)> = ocel
            .events
            .iter()
            .filter(|e| e.relationships.iter().any(|r| r.object_id == oid))
            .map(|e| (e.time, e.id.as_str(), e.event_type.as_str()))
            .collect();
        // Deterministic ordering: by time, then event id.
        rows.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1)));

        let trace = rows.iter().map(|(_, _, ty)| ty.to_string()).collect();
        let event_ids = rows.iter().map(|(_, id, _)| id.to_string()).collect();
        cases.push(FlatCase {
            case_id: oid.to_string(),
            trace,
            event_ids,
        });
    }

    Ok(FlatLog {
        object_type: object_type.to_string(),
        cases,
    })
}
