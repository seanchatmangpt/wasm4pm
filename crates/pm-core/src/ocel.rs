//! Object-Centric Event Log (OCEL 2.0) types.
//!
//! Paper grounding:
//!   Ghahfarokhi, Park, Berti & van der Aalst (2021) ICSOC — first OCEL standard.
//!   van der Aalst & Berti (2020) FI 175(1-4) — Object-Centric Petri Nets (arXiv:2010.02047).
//!   OCEL 2.0 standard (IEEE Task Force on PM, 2023).
//!
//! Formal objects:
//!   OCEL = (E, O, EA, OA, E2O, O2O) where
//!     E = set of events,
//!     O = set of objects,
//!     EA : E → A × T (activity, timestamp),
//!     OA : O → OT (object type),
//!     E2O ⊆ E × O × Q (event-object relations with qualifier),
//!     O2O ⊆ O × O × Q (object-object relations with qualifier).

extern crate alloc;

use alloc::collections::{BTreeMap, BTreeSet};
use alloc::string::String;
use alloc::vec::Vec;
use crate::primitives::{ActivityName, ObjectId, ObjectType, TimestampNs};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

/// Event identifier — unique within an OCEL.
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct OcelEventId(pub String);

impl From<String> for OcelEventId {
    fn from(s: String) -> Self { OcelEventId(s) }
}
impl From<&str> for OcelEventId {
    fn from(s: &str) -> Self { OcelEventId(String::from(s)) }
}

/// Qualifier label for event-object and object-object relations.
///
/// Formal: Q in E2O ⊆ E × O × Q (OCEL 2.0 standard §3).
#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Qualifier(pub String);

impl From<&str> for Qualifier {
    fn from(s: &str) -> Self { Qualifier(String::from(s)) }
}

/// An event in the OCEL: e ∈ E with activity a ∈ A and timestamp t ∈ T.
///
/// Formal: EA(e) = (a, t) (Ghahfarokhi et al. 2021 §2 Def. 1).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct OcelEvent {
    pub id: OcelEventId,
    /// EA(e).activity — the activity label.
    pub activity: ActivityName,
    /// EA(e).timestamp — nanoseconds since Unix epoch.
    pub timestamp: TimestampNs,
    /// Additional string-valued event attributes (e.g. resource, cost).
    pub attributes: BTreeMap<String, String>,
}

/// An object in the OCEL: o ∈ O with type ot ∈ OT.
///
/// Formal: OA(o) = ot (Ghahfarokhi et al. 2021 §2 Def. 1).
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct OcelObject {
    pub id: ObjectId,
    /// OA(o) — object type.
    pub object_type: ObjectType,
    /// Additional string-valued object attributes.
    pub attributes: BTreeMap<String, String>,
}

/// Event-to-object relation: (e, o, q) ∈ E2O.
///
/// Formal: E2O ⊆ E × O × Q (OCEL 2.0 §3). Qualifier q labels the role of o in e.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct E2ORelation {
    pub event_id: OcelEventId,
    pub object_id: ObjectId,
    pub qualifier: Qualifier,
}

/// Object-to-object relation: (o₁, o₂, q) ∈ O2O.
///
/// Formal: O2O ⊆ O × O × Q (OCEL 2.0 §3). Qualifier q labels the relationship.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct O2ORelation {
    pub source_id: ObjectId,
    pub target_id: ObjectId,
    pub qualifier: Qualifier,
}

/// Object-Centric Event Log: OCEL = (E, O, EA, OA, E2O, O2O).
///
/// Paper: Ghahfarokhi et al. (2021) ICSOC; OCEL 2.0 standard (2023).
///
/// All maps use BTreeMap for deterministic iteration order.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct ObjectCentricEventLog {
    /// E — event set.
    pub events: BTreeMap<OcelEventId, OcelEvent>,
    /// O — object set.
    pub objects: BTreeMap<ObjectId, OcelObject>,
    /// E2O — event-to-object relations, sorted for determinism.
    pub e2o: BTreeSet<E2ORelation>,
    /// O2O — object-to-object relations, sorted for determinism.
    pub o2o: BTreeSet<O2ORelation>,
}

impl ObjectCentricEventLog {
    pub fn new() -> Self {
        ObjectCentricEventLog {
            events: BTreeMap::new(),
            objects: BTreeMap::new(),
            e2o: BTreeSet::new(),
            o2o: BTreeSet::new(),
        }
    }

    /// All distinct object types in the log (OT).
    pub fn object_types(&self) -> BTreeSet<ObjectType> {
        self.objects.values().map(|o| o.object_type.clone()).collect()
    }

    /// Objects related to a given event (via E2O), with their qualifiers.
    pub fn objects_for_event(&self, event_id: &OcelEventId) -> Vec<(&ObjectId, &Qualifier)> {
        self.e2o.iter()
            .filter(|r| &r.event_id == event_id)
            .map(|r| (&r.object_id, &r.qualifier))
            .collect()
    }

    /// Events related to a given object (via E2O), sorted by timestamp.
    pub fn events_for_object(&self, object_id: &ObjectId) -> Vec<&OcelEvent> {
        let mut evts: Vec<&OcelEvent> = self.e2o.iter()
            .filter(|r| &r.object_id == object_id)
            .filter_map(|r| self.events.get(&r.event_id))
            .collect();
        evts.sort_by_key(|e| e.timestamp);
        evts
    }
}

impl Default for ObjectCentricEventLog {
    fn default() -> Self { Self::new() }
}
