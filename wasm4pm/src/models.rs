use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Attribute value types for event data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tag", content = "value")]
pub enum AttributeValue {
    String(String),
    Int(i64),
    Float(f64),
    Date(String), // ISO 8601
    Boolean(bool),
    List(Vec<AttributeValue>),
    Container(HashMap<String, AttributeValue>),
}

impl AttributeValue {
    pub fn as_string(&self) -> Option<&str> {
        match self {
            AttributeValue::String(s) => Some(s),
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

pub type Attributes = HashMap<String, AttributeValue>;

/// Event within a trace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub attributes: Attributes,
}

/// Trace (case) of events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trace {
    pub attributes: Attributes,
    pub events: Vec<Event>,
}

/// Event log (case-centric)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventLog {
    pub attributes: Attributes,
    pub traces: Vec<Trace>,
}

impl EventLog {
    pub fn new() -> Self {
        EventLog {
            attributes: HashMap::new(),
            traces: Vec::new(),
        }
    }

    pub fn event_count(&self) -> usize {
        self.traces.iter().map(|t| t.events.len()).sum()
    }

    pub fn case_count(&self) -> usize {
        self.traces.len()
    }

    /// Get activity names by reading a specific attribute key
    pub fn get_activities(&self, activity_key: &str) -> Vec<String> {
        let mut activities = Vec::new();
        for trace in &self.traces {
            for event in &trace.events {
                if let Some(AttributeValue::String(activity)) =
                    event.attributes.get(activity_key)
                {
                    if !activities.contains(activity) {
                        activities.push(activity.clone());
                    }
                }
            }
        }
        activities
    }

    /// Get directly-follows relations
    pub fn get_directly_follows(&self, activity_key: &str) -> Vec<(String, String, usize)> {
        let mut relations: HashMap<(String, String), usize> = HashMap::new();

        for trace in &self.traces {
            for i in 0..trace.events.len() - 1 {
                if let (
                    Some(AttributeValue::String(act1)),
                    Some(AttributeValue::String(act2)),
                ) = (
                    trace.events[i].attributes.get(activity_key),
                    trace.events[i + 1].attributes.get(activity_key),
                ) {
                    *relations
                        .entry((act1.clone(), act2.clone()))
                        .or_insert(0) += 1;
                }
            }
        }

        relations
            .into_iter()
            .map(|((from, to), freq)| (from, to, freq))
            .collect()
    }
}

/// OCEL Object Attribute definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELObjectAttribute {
    pub name: String,
    pub attribute_type: String,
}

/// OCEL Event Attribute definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELEventAttribute {
    pub name: String,
    pub attribute_type: String,
}

/// OCEL Event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELEvent {
    pub id: String,
    pub event_type: String,
    pub timestamp: String, // ISO 8601
    pub attributes: HashMap<String, AttributeValue>,
    pub object_ids: Vec<String>,
}

/// OCEL Object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCELObject {
    pub id: String,
    pub object_type: String,
    pub attributes: HashMap<String, AttributeValue>,
}

/// Object-Centric Event Log
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCEL {
    pub event_types: Vec<String>,
    pub object_types: Vec<String>,
    pub events: Vec<OCELEvent>,
    pub objects: Vec<OCELObject>,
}

impl OCEL {
    pub fn new() -> Self {
        OCEL {
            event_types: Vec::new(),
            object_types: Vec::new(),
            events: Vec::new(),
            objects: Vec::new(),
        }
    }

    pub fn event_count(&self) -> usize {
        self.events.len()
    }

    pub fn object_count(&self) -> usize {
        self.objects.len()
    }
}

/// Petri Net place
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNetPlace {
    pub id: String,
    pub label: String,
    pub marking: Option<usize>,
}

/// Petri Net transition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNetTransition {
    pub id: String,
    pub label: String,
    pub is_invisible: Option<bool>,
}

/// Arc in a Petri Net
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNetArc {
    pub from: String,
    pub to: String,
    pub weight: Option<usize>,
}

/// Petri Net
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetriNet {
    pub places: Vec<PetriNetPlace>,
    pub transitions: Vec<PetriNetTransition>,
    pub arcs: Vec<PetriNetArc>,
    pub initial_marking: HashMap<String, usize>,
    pub final_markings: Vec<HashMap<String, usize>>,
}

impl PetriNet {
    pub fn new() -> Self {
        PetriNet {
            places: Vec::new(),
            transitions: Vec::new(),
            arcs: Vec::new(),
            initial_marking: HashMap::new(),
            final_markings: Vec::new(),
        }
    }
}

/// Directly-Follows relation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectlyFollowsRelation {
    pub from: String,
    pub to: String,
    pub frequency: usize,
}

/// Directly-Follows Graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectlyFollowsGraph {
    pub nodes: Vec<DFGNode>,
    pub edges: Vec<DirectlyFollowsRelation>,
    pub start_activities: HashMap<String, usize>,
    pub end_activities: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DFGNode {
    pub id: String,
    pub label: String,
    pub frequency: usize,
}

impl DirectlyFollowsGraph {
    pub fn new() -> Self {
        DirectlyFollowsGraph {
            nodes: Vec::new(),
            edges: Vec::new(),
            start_activities: HashMap::new(),
            end_activities: HashMap::new(),
        }
    }
}

/// DECLARE constraint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclareConstraint {
    pub template: String,
    pub activities: Vec<String>,
    pub support: f64,
    pub confidence: f64,
}

/// DECLARE model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeclareModel {
    pub constraints: Vec<DeclareConstraint>,
    pub activities: Vec<String>,
}

impl DeclareModel {
    pub fn new() -> Self {
        DeclareModel {
            constraints: Vec::new(),
            activities: Vec::new(),
        }
    }
}

/// Token replay deviation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenReplayDeviation {
    pub event_index: usize,
    pub activity: String,
    pub deviation_type: String,
}

/// Token replay result for a case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenReplayResult {
    pub case_id: String,
    pub is_conforming: bool,
    pub trace_fitness: f64,
    pub tokens_missing: usize,
    pub tokens_remaining: usize,
    pub deviations: Vec<TokenReplayDeviation>,
}

/// Conformance checking result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConformanceResult {
    pub case_fitness: Vec<TokenReplayResult>,
    pub avg_fitness: f64,
    pub conforming_cases: usize,
    pub total_cases: usize,
}
