pub mod flatten;
pub mod intake;
pub mod validate;

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Display;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OCEL {
    #[serde(rename = "eventTypes")]
    pub event_types: Vec<OCELType>,
    #[serde(rename = "objectTypes")]
    pub object_types: Vec<OCELType>,
    #[serde(default)]
    pub events: Vec<OCELEvent>,
    #[serde(default)]
    pub objects: Vec<OCELObject>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct OCELType {
    pub name: String,
    #[serde(default)]
    pub attributes: Vec<OCELTypeAttribute>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct OCELTypeAttribute {
    pub name: String,
    #[serde(rename = "type")]
    pub value_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OCELEventAttribute {
    pub name: String,
    pub value: OCELAttributeValue,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OCELEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub time: DateTime<FixedOffset>,
    #[serde(default)]
    pub attributes: Vec<OCELEventAttribute>,
    #[serde(default)]
    pub relationships: Vec<OCELRelationship>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct OCELRelationship {
    #[serde(rename = "objectId")]
    pub object_id: String,
    pub qualifier: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OCELObject {
    pub id: String,
    #[serde(rename = "type")]
    pub object_type: String,
    #[serde(default)]
    pub attributes: Vec<OCELObjectAttribute>,
    #[serde(default)]
    pub relationships: Vec<OCELRelationship>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct OCELObjectAttribute {
    pub name: String,
    pub value: OCELAttributeValue,
    pub time: DateTime<FixedOffset>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default)]
#[serde(untagged)]
pub enum OCELAttributeValue {
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Time(DateTime<FixedOffset>),
    String(String),
    #[default]
    Null,
}

impl Display for OCELAttributeValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            OCELAttributeValue::Time(dt) => dt.to_rfc3339(),
            OCELAttributeValue::Integer(i) => i.to_string(),
            OCELAttributeValue::Float(f) => f.to_string(),
            OCELAttributeValue::Boolean(b) => b.to_string(),
            OCELAttributeValue::String(s) => s.clone(),
            OCELAttributeValue::Null => String::default(),
        };
        write!(f, "{s}")
    }
}

/// Cardinality constraint on an object type, mirroring the route `object_types`
/// schema (`created_by[]`, `terminated_by[]`, `schema`, `min_count`, `max_count`).
///
/// In OCEL-v2 / OCEDO terms this is a *meta-model* constraint: it bounds how many
/// instances of a given object type a lawful log (or route case) may carry, and
/// records which event types create/terminate the object's lifecycle.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Default)]
pub struct ObjectTypeCardinality {
    /// Event types that create an instance of this object type (lifecycle open).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub created_by: Vec<String>,
    /// Event types that terminate an instance of this object type (lifecycle close).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub terminated_by: Vec<String>,
    /// Optional path to a JSON Schema validating this object type's payload.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// Minimum number of instances required (inclusive). `None` = unbounded below.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_count: Option<usize>,
    /// Maximum number of instances permitted (inclusive). `None` = unbounded above.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_count: Option<usize>,
}

impl ObjectTypeCardinality {
    /// True if `count` satisfies the `[min_count, max_count]` window.
    #[must_use]
    pub fn admits(&self, count: usize) -> bool {
        let above_min = self.min_count.is_none_or(|m| count >= m);
        let below_max = self.max_count.is_none_or(|m| count <= m);
        above_min && below_max
    }
}

impl OCEL {
    // --- OCEDO formal layer:  L = (E, O, eval, oaval) ---------------------
    //
    // Paper grounding (Latif et al., "Object-Centric Analysis of XES Event Logs",
    // OCEDO meta-model, Fig. 1): an event has exactly one `time`, one event-type,
    // 1..* event-attribute-values, and a qualified `*` reference to objects.
    // An object has one object-type, 1..* object-attribute-values, and qualified
    // from/to object-relations. OCPQ Def. 2 adds: every event has >=1 qualified
    // object ref; objects carry qualified O2O refs; type/objects are time-stable;
    // attribute values (oaval) vary per timestamp.

    /// `E` — the set of events.
    #[must_use]
    pub fn event_set(&self) -> &[OCELEvent] {
        &self.events
    }

    /// `O` — the set of objects.
    #[must_use]
    pub fn object_set(&self) -> &[OCELObject] {
        &self.objects
    }

    /// `eval(e)` — the event-attribute-value map for event `e` (name → value).
    /// Returns `None` if the event id is unknown.
    #[must_use]
    pub fn eval(&self, event_id: &str) -> Option<BTreeMap<&str, &OCELAttributeValue>> {
        let e = self.events.iter().find(|e| e.id == event_id)?;
        Some(
            e.attributes
                .iter()
                .map(|a| (a.name.as_str(), &a.value))
                .collect(),
        )
    }

    /// `oaval(o, t)` — object-attribute-value map for object `o` *as of* time `t`.
    ///
    /// Time-varying semantics: for each attribute name, returns the latest value
    /// whose stamp is `<= t`. Attributes first set after `t` are absent. This is
    /// the temporal projection of the OCED `object attribute value` node.
    #[must_use]
    pub fn oaval(
        &self,
        object_id: &str,
        at: DateTime<FixedOffset>,
    ) -> Option<BTreeMap<&str, &OCELAttributeValue>> {
        let o = self.objects.iter().find(|o| o.id == object_id)?;
        // group by name, keep the latest <= at
        let mut latest: BTreeMap<&str, (&DateTime<FixedOffset>, &OCELAttributeValue)> =
            BTreeMap::new();
        for a in &o.attributes {
            if a.time <= at {
                latest
                    .entry(a.name.as_str())
                    .and_modify(|cur| {
                        if a.time >= *cur.0 {
                            *cur = (&a.time, &a.value);
                        }
                    })
                    .or_insert((&a.time, &a.value));
            }
        }
        Some(latest.into_iter().map(|(k, v)| (k, v.1)).collect())
    }

    /// The distinct timestamps at which object `o`'s attributes change
    /// (the temporal support of `oaval(o, .)`), sorted ascending.
    #[must_use]
    pub fn object_attr_timeline(&self, object_id: &str) -> Vec<DateTime<FixedOffset>> {
        let mut stamps: BTreeSet<DateTime<FixedOffset>> = BTreeSet::new();
        if let Some(o) = self.objects.iter().find(|o| o.id == object_id) {
            for a in &o.attributes {
                stamps.insert(a.time);
            }
        }
        stamps.into_iter().collect()
    }

    /// E2O — qualified event→object references for event `e` (object_id, qualifier).
    /// Mirrors the dotted `C` arc (event — qualifier — object) of the meta-model.
    #[must_use]
    pub fn e2o(&self, event_id: &str) -> Vec<(&str, &str)> {
        self.events
            .iter()
            .find(|e| e.id == event_id)
            .map(|e| {
                e.relationships
                    .iter()
                    .map(|r| (r.object_id.as_str(), r.qualifier.as_str()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// O2O — qualified object→object references for object `o` (to_object_id, qualifier).
    /// Mirrors the `B` `from/to` object-relation with an object-relation-type/qualifier.
    #[must_use]
    pub fn o2o(&self, object_id: &str) -> Vec<(&str, &str)> {
        self.objects
            .iter()
            .find(|o| o.id == object_id)
            .map(|o| {
                o.relationships
                    .iter()
                    .map(|r| (r.object_id.as_str(), r.qualifier.as_str()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Count objects of a given type (`|{o in O : type(o) = ot}|`).
    #[must_use]
    pub fn count_objects_of_type(&self, object_type: &str) -> usize {
        self.objects
            .iter()
            .filter(|o| o.object_type == object_type)
            .count()
    }
}
