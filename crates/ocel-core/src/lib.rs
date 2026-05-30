pub mod intake;

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
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
