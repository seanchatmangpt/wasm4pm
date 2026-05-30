//! OCEL-v2 validation against the OCEDO meta-model and OCPQ Def. 2 invariants.
//!
//! Paper grounding:
//! - **OCEDO** (Latif et al., Fig. 1): an event has exactly one `time`, one
//!   event-type, and a qualified reference to >= 1 object. Objects have one
//!   object-type and qualified from/to object-relations. Object/event types are
//!   declared up-front; types are time-stable.
//! - **OCPQ Def. 2** (`L = (E, O, eval, oaval)`): every event has at least one
//!   qualified object reference; objects can carry qualified O2O refs; `type` and
//!   `objects` (the O2O wiring) are time-stable while attribute values vary.
//!
//! On top of the formal model we layer the route `object_types` cardinality:
//! `min_count`/`max_count` bound how many instances of an object type a lawful
//! log (or route case) may carry, and `created_by`/`terminated_by` declare the
//! lifecycle-opening/closing event types.

use std::collections::{HashMap, HashSet};

use crate::{ObjectTypeCardinality, OCEL};

/// A single validation defect, with a machine-stable `code` and human message.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ValidationError {
    /// Machine-stable defect code (e.g. `E2O_EMPTY`, `DANGLING_E2O`).
    pub code: String,
    /// Human-readable explanation including the offending id.
    pub message: String,
}

impl ValidationError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

/// Result of validating an OCEL-v2 log. `valid` is the conjunction of all checks.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ValidationReport {
    /// True iff `errors` is empty.
    pub valid: bool,
    /// All defects found, in deterministic discovery order.
    pub errors: Vec<ValidationError>,
}

impl ValidationReport {
    fn from_errors(errors: Vec<ValidationError>) -> Self {
        Self {
            valid: errors.is_empty(),
            errors,
        }
    }
}

/// Validate an OCEL-v2 log against the OCEDO/OCPQ invariants. Cardinality
/// constraints are optional and keyed by object-type name; when supplied each
/// declared type's instance count is checked against `[min_count, max_count]`.
///
/// Checks (each contributes a distinct error `code`):
/// 1. `UNDECLARED_EVENT_TYPE` — event references a type not in `event_types`.
/// 2. `UNDECLARED_OBJECT_TYPE` — object references a type not in `object_types`.
/// 3. `E2O_EMPTY` — event has zero qualified object refs (OCPQ Def. 2 violation).
/// 4. `DANGLING_E2O` — event refers to an unknown object id.
/// 5. `DANGLING_O2O` — object refers to an unknown object id.
/// 6. `DUPLICATE_EVENT_ID` / `DUPLICATE_OBJECT_ID` — id uniqueness.
/// 7. `CARDINALITY_MIN` / `CARDINALITY_MAX` — declared object-type window.
#[must_use]
pub fn validate(
    ocel: &OCEL,
    cardinality: &HashMap<String, ObjectTypeCardinality>,
) -> ValidationReport {
    let mut errors = Vec::new();

    let declared_event_types: HashSet<&str> =
        ocel.event_types.iter().map(|t| t.name.as_str()).collect();
    let declared_object_types: HashSet<&str> =
        ocel.object_types.iter().map(|t| t.name.as_str()).collect();

    // Object id index + uniqueness.
    let mut object_ids: HashSet<&str> = HashSet::new();
    for o in &ocel.objects {
        if !object_ids.insert(o.id.as_str()) {
            errors.push(ValidationError::new(
                "DUPLICATE_OBJECT_ID",
                format!("object id '{}' declared more than once", o.id),
            ));
        }
        if !declared_object_types.contains(o.object_type.as_str()) {
            errors.push(ValidationError::new(
                "UNDECLARED_OBJECT_TYPE",
                format!(
                    "object '{}' has type '{}' not in objectTypes",
                    o.id, o.object_type
                ),
            ));
        }
    }

    // Event id uniqueness + E2O invariants + event-type declaration.
    let mut event_ids: HashSet<&str> = HashSet::new();
    for e in &ocel.events {
        if !event_ids.insert(e.id.as_str()) {
            errors.push(ValidationError::new(
                "DUPLICATE_EVENT_ID",
                format!("event id '{}' declared more than once", e.id),
            ));
        }
        if !declared_event_types.contains(e.event_type.as_str()) {
            errors.push(ValidationError::new(
                "UNDECLARED_EVENT_TYPE",
                format!(
                    "event '{}' has type '{}' not in eventTypes",
                    e.id, e.event_type
                ),
            ));
        }
        // OCPQ Def. 2: every event has >= 1 qualified object reference.
        if e.relationships.is_empty() {
            errors.push(ValidationError::new(
                "E2O_EMPTY",
                format!(
                    "event '{}' has no qualified object reference (OCPQ Def. 2)",
                    e.id
                ),
            ));
        }
        // Referential integrity of E2O.
        for r in &e.relationships {
            if !object_ids.contains(r.object_id.as_str()) {
                errors.push(ValidationError::new(
                    "DANGLING_E2O",
                    format!(
                        "event '{}' references unknown object '{}' (qualifier '{}')",
                        e.id, r.object_id, r.qualifier
                    ),
                ));
            }
        }
    }

    // Referential integrity of O2O.
    for o in &ocel.objects {
        for r in &o.relationships {
            if !object_ids.contains(r.object_id.as_str()) {
                errors.push(ValidationError::new(
                    "DANGLING_O2O",
                    format!(
                        "object '{}' references unknown object '{}' (qualifier '{}')",
                        o.id, r.object_id, r.qualifier
                    ),
                ));
            }
        }
    }

    // Cardinality window per declared object type.
    for (type_name, card) in cardinality {
        let count = ocel.count_objects_of_type(type_name);
        if let Some(min) = card.min_count {
            if count < min {
                errors.push(ValidationError::new(
                    "CARDINALITY_MIN",
                    format!(
                        "object type '{type_name}' has {count} instances, below min_count {min}"
                    ),
                ));
            }
        }
        if let Some(max) = card.max_count {
            if count > max {
                errors.push(ValidationError::new(
                    "CARDINALITY_MAX",
                    format!(
                        "object type '{type_name}' has {count} instances, above max_count {max}"
                    ),
                ));
            }
        }
    }

    ValidationReport::from_errors(errors)
}
