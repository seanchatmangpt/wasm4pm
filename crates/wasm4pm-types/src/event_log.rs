use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Possible attribute values according to the XES Standard
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "content")]
pub enum AttributeValue {
    String(String),
    Date(DateTime<FixedOffset>),
    Int(i64),
    Float(f64),
    Boolean(bool),
    ID(Uuid),
    List(Vec<Attribute>),
    Container(Vec<Attribute>),
    None(),
}

impl AttributeValue {
    pub fn as_string(&self) -> Option<&str> {
        match self {
            AttributeValue::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            AttributeValue::Int(i) => Some(*i),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            AttributeValue::Float(f) => Some(*f),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            AttributeValue::Boolean(b) => Some(*b),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Attribute {
    pub key: String,
    pub value: AttributeValue,
    pub own_attributes: Option<Vec<Attribute>>,
}

impl Attribute {
    pub fn new(key: String, value: AttributeValue) -> Self {
        Attribute {
            key,
            value,
            own_attributes: None,
        }
    }
}

pub type Attributes = Vec<Attribute>;

pub trait XESEditableAttribute {
    fn add_to_attributes(&mut self, key: String, value: AttributeValue);
    fn add_attribute(&mut self, attr: Attribute);
    fn get_by_key(&self, key: &str) -> Option<&Attribute>;
    fn get_by_key_mut(&mut self, key: &str) -> Option<&mut Attribute>;
}

impl XESEditableAttribute for Attributes {
    fn add_to_attributes(&mut self, key: String, value: AttributeValue) {
        self.push(Attribute::new(key, value));
    }

    fn add_attribute(&mut self, attr: Attribute) {
        self.push(attr);
    }

    fn get_by_key(&self, key: &str) -> Option<&Attribute> {
        self.iter().find(|a| a.key == key)
    }

    fn get_by_key_mut(&mut self, key: &str) -> Option<&mut Attribute> {
        self.iter_mut().find(|a| a.key == key)
    }
}

/// A single event in a trace
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Event {
    pub attributes: Attributes,
}

impl Event {
    pub fn new(attributes: Attributes) -> Self {
        Event { attributes }
    }

    pub fn with_activity(activity: &str) -> Self {
        let mut attributes = Vec::new();
        attributes.add_to_attributes(
            "concept:name".to_string(),
            AttributeValue::String(activity.to_string()),
        );
        Event { attributes }
    }

    pub fn get_activity(&self, key: &str) -> Option<String> {
        self.attributes
            .get_by_key(key)
            .and_then(|a| a.value.as_string().map(|s| s.to_string()))
    }
}

/// A trace (sequence of events for one case)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct Trace {
    pub attributes: Attributes,
    pub events: Vec<Event>,
}

impl Trace {
    pub fn new(case_id: String, events: Vec<Event>) -> Self {
        let mut attributes = Vec::new();
        attributes.add_to_attributes("concept:name".to_string(), AttributeValue::String(case_id));
        Trace { attributes, events }
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }
}

/// An event log (collection of traces)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct EventLog {
    pub attributes: Attributes,
    pub traces: Vec<Trace>,
    pub extensions: Option<Vec<EventLogExtension>>,
    pub classifiers: Option<Vec<EventLogClassifier>>,
    pub global_trace_attrs: Option<Attributes>,
    pub global_event_attrs: Option<Attributes>,
}

impl EventLog {
    pub fn new(traces: Vec<Trace>, attributes: Attributes) -> Self {
        EventLog {
            traces,
            attributes,
            ..Default::default()
        }
    }

    pub fn len(&self) -> usize {
        self.traces.len()
    }

    pub fn is_empty(&self) -> bool {
        self.traces.is_empty()
    }

    pub fn event_count(&self) -> usize {
        self.traces.iter().map(|t| t.len()).sum()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventLogExtension {
    pub name: String,
    pub prefix: String,
    pub uri: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventLogClassifier {
    pub name: String,
    pub keys: Vec<String>,
}
