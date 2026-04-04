use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use rustc_hash::FxHashMap;

/// Parse an ISO 8601 / RFC 3339 timestamp string into milliseconds since Unix epoch.
/// Handles formats: "2024-01-01T10:00:00+00:00", "2024-01-01T10:00:00Z",
///                  "2024-01-01T10:00:00.123+00:00", "2024-01-01T10:00:00" (naive UTC)
pub fn parse_timestamp_ms(s: &str) -> Option<i64> {
    use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
    // Try RFC 3339 / ISO 8601 with offset first
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    // Try with space instead of T
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s.replacen(' ', "T", 1)) {
        return Some(dt.timestamp_millis());
    }
    // Naive datetime (assume UTC)
    for fmt in &[
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(Utc.from_utc_datetime(&ndt).timestamp_millis());
        }
    }
    None
}

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
    #[inline]
    pub fn as_string(&self) -> Option<&str> {
        match self {
            AttributeValue::String(s) => Some(s.as_str()),
            _ => None,
        }
    }

    #[inline]
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            AttributeValue::Int(i) => Some(*i),
            _ => None,
        }
    }

    #[inline]
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            AttributeValue::Float(f) => Some(*f),
            _ => None,
        }
    }

    #[inline]
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

/// Columnar, integer-encoded view of an event log.
///
/// Activities are encoded as `u32` IDs so that edge/frequency counting uses
/// fixed-width integer hash keys (~12 bytes/entry) instead of heap-allocated
/// `(String, String)` pairs (~80 bytes/entry). The flat `events` array gives
/// sequential memory access for the inner DFG loop.
///
/// Lifetime is tied to the source `EventLog` — `vocab` borrows its strings.
pub struct ColumnarLog<'a> {
    /// Flat array of activity IDs across all traces (trace 0 events, trace 1 events, …).
    pub events: Vec<u32>,
    /// `trace_offsets[t]` = start index of trace `t` in `events`.
    /// Has one extra sentinel entry at the end equal to `events.len()`.
    pub trace_offsets: Vec<usize>,
    /// `vocab[id]` = the activity string for integer id `id`.
    pub vocab: Vec<&'a str>,
}

impl EventLog {
    pub fn new() -> Self {
        EventLog {
            attributes: HashMap::new(),
            traces: Vec::new(),
        }
    }

    #[inline]
    pub fn event_count(&self) -> usize {
        self.traces.iter().map(|t| t.events.len()).sum()
    }

    #[inline]
    pub fn case_count(&self) -> usize {
        self.traces.len()
    }

    /// Build a columnar (integer-encoded) view of this log for cache-efficient bulk ops.
    ///
    /// Single pass: builds vocabulary (activity → u32) and encodes all events into a
    /// flat `Vec<u32>`.  The caller can then run DFG/heuristic counting with
    /// `HashMap<(u32,u32), usize>` — integer keys hash and compare in ~1 cycle
    /// vs. O(len) for `String` keys.
    pub fn to_columnar<'a>(&'a self, activity_key: &str) -> ColumnarLog<'a> {
        let total: usize = self.traces.iter().map(|t| t.events.len()).sum();
        let mut events = Vec::with_capacity(total);
        let mut trace_offsets = Vec::with_capacity(self.traces.len() + 1);
        let mut vocab_map: FxHashMap<&'a str, u32> = FxHashMap::default();
        let mut vocab: Vec<&'a str> = Vec::new();

        for trace in &self.traces {
            trace_offsets.push(events.len());
            for event in &trace.events {
                if let Some(act) = event.attributes.get(activity_key).and_then(|v| v.as_string()) {
                    let next_id = vocab.len() as u32;
                    let id = *vocab_map.entry(act).or_insert_with(|| {
                        vocab.push(act);
                        next_id
                    });
                    events.push(id);
                }
            }
        }
        trace_offsets.push(events.len()); // sentinel

        ColumnarLog { events, trace_offsets, vocab }
    }

    /// Get unique activity names. Uses `to_columnar` internally so dedup is O(n).
    #[inline]
    pub fn get_activities(&self, activity_key: &str) -> Vec<String> {
        self.to_columnar(activity_key)
            .vocab
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    /// Get directly-follows relations as `(from, to, count)` triples.
    ///
    /// Uses `to_columnar` + `HashMap<(u32,u32), usize>` for integer-keyed counting —
    /// ~6× smaller entries and ~3× faster hashing vs. `HashMap<(String,String), usize>`.
    #[inline]
    pub fn get_directly_follows(&self, activity_key: &str) -> Vec<(String, String, usize)> {
        let col = self.to_columnar(activity_key);
        let mut counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

        for t in 0..col.trace_offsets.len().saturating_sub(1) {
            let start = col.trace_offsets[t];
            let end = col.trace_offsets[t + 1];
            // Sequential read over flat integer array — maximally cache-friendly
            for i in start..end.saturating_sub(1) {
                *counts.entry((col.events[i], col.events[i + 1])).or_insert(0) += 1;
            }
        }

        counts
            .into_iter()
            .map(|((f, t), freq)| {
                (col.vocab[f as usize].to_owned(), col.vocab[t as usize].to_owned(), freq)
            })
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

/// Streaming DFG builder for IoT / chunked event ingestion.
///
/// Maintains running DFG counts without storing the full event log in memory.
/// Events are added one-by-one (or in batches) per case; once a trace is
/// closed its per-trace buffer is freed and its counts folded into the global
/// totals.  Memory use is proportional to open concurrent traces × average
/// trace length, not total log size.
///
/// Activity strings are integer-encoded on first sight so edge counting uses
/// `FxHashMap<(u32,u32), usize>` (fixed-width keys, O(1) hash).
#[derive(Debug, Clone)]
pub struct StreamingDfgBuilder {
    /// activity name → integer id (first-seen order)
    pub vocab_map: HashMap<String, u32>,
    /// id → activity name (reverse of vocab_map)
    pub vocab: Vec<String>,
    /// per-activity occurrence counts indexed by id (grown on demand)
    pub node_counts: Vec<usize>,
    /// directed edge occurrence counts
    pub edge_counts: FxHashMap<(u32, u32), usize>,
    /// start-activity counts (first event in each closed trace)
    pub start_counts: FxHashMap<u32, usize>,
    /// end-activity counts (last event in each closed trace)
    pub end_counts: FxHashMap<u32, usize>,
    /// number of traces closed so far
    pub trace_count: usize,
    /// total events processed (including open traces)
    pub event_count: usize,
    /// open (in-progress) traces: case_id → encoded activity sequence
    /// freed when the trace is closed via `streaming_dfg_close_trace`
    pub open_traces: HashMap<String, Vec<u32>>,
}

impl StreamingDfgBuilder {
    pub fn new() -> Self {
        StreamingDfgBuilder {
            vocab_map: HashMap::new(),
            vocab: Vec::new(),
            node_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            trace_count: 0,
            event_count: 0,
            open_traces: HashMap::new(),
        }
    }

    /// Intern an activity string and return its u32 id.
    #[inline]
    pub fn intern(&mut self, activity: &str) -> u32 {
        if let Some(&id) = self.vocab_map.get(activity) {
            return id;
        }
        let id = self.vocab.len() as u32;
        self.vocab.push(activity.to_owned());
        self.vocab_map.insert(activity.to_owned(), id);
        self.node_counts.push(0);
        id
    }

    /// Append one event to an open trace.
    pub fn add_event(&mut self, case_id: &str, activity: &str) {
        let id = self.intern(activity);
        self.open_traces
            .entry(case_id.to_owned())
            .or_insert_with(Vec::new)
            .push(id);
        self.event_count += 1;
    }

    /// Close a trace: fold its buffered events into running counts, then free the buffer.
    /// Returns `false` if `case_id` was not open.
    pub fn close_trace(&mut self, case_id: &str) -> bool {
        let Some(events) = self.open_traces.remove(case_id) else { return false; };
        if events.is_empty() { return true; }

        // Node frequencies
        for &id in &events {
            self.node_counts[id as usize] += 1;
        }
        // Directly-follows edges
        for pair in events.windows(2) {
            *self.edge_counts.entry((pair[0], pair[1])).or_insert(0) += 1;
        }
        // Start / end
        *self.start_counts.entry(events[0]).or_insert(0) += 1;
        *self.end_counts.entry(*events.last().unwrap()).or_insert(0) += 1;
        self.trace_count += 1;
        true
    }

    /// Snapshot: build a `DirectlyFollowsGraph` from current counts.
    /// Includes counts from *closed* traces only (open traces are not yet folded in).
    pub fn to_dfg(&self) -> DirectlyFollowsGraph {
        let mut dfg = DirectlyFollowsGraph::new();
        dfg.nodes = self.vocab.iter().enumerate().map(|(i, name)| DFGNode {
            id: name.clone(),
            label: name.clone(),
            frequency: self.node_counts[i],
        }).collect();
        dfg.edges = self.edge_counts.iter().map(|(&(f, t), &freq)| DirectlyFollowsRelation {
            from: self.vocab[f as usize].clone(),
            to: self.vocab[t as usize].clone(),
            frequency: freq,
        }).collect();
        for (&id, &cnt) in &self.start_counts {
            dfg.start_activities.insert(self.vocab[id as usize].clone(), cnt);
        }
        for (&id, &cnt) in &self.end_counts {
            dfg.end_activities.insert(self.vocab[id as usize].clone(), cnt);
        }
        dfg
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

/// Streaming conformance deviation for a single trace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingConformanceDeviation {
    pub position: usize,
    pub from_activity: String,
    pub to_activity: String,
}

/// Streaming conformance result for a single closed trace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingConformanceTraceResult {
    pub case_id: String,
    pub is_conforming: bool,
    pub deviations: Vec<StreamingConformanceDeviation>,
    pub fitness: f64,
}

/// Streaming DFG-based conformance checker.
///
/// Checks each trace against a reference DFG as events arrive.  When a trace
/// is closed (`streaming_conformance_close_trace`) the activity sequence is
/// replayed against the DFG edge-set and any missing directly-follows pairs
/// are reported as deviations.  Memory is proportional to open concurrent
/// traces, not total events seen.
#[derive(Debug, Clone)]
pub struct StreamingConformanceChecker {
    /// Valid directly-follows pairs from the reference DFG
    pub dfg_edges: std::collections::HashSet<(String, String)>,
    /// Start activities from the reference DFG
    pub start_activities: std::collections::HashSet<String>,
    /// End activities from the reference DFG
    pub end_activities: std::collections::HashSet<String>,
    /// Open traces: case_id → activity sequence
    pub open_traces: HashMap<String, Vec<String>>,
    /// Accumulated results for closed traces
    pub results: Vec<StreamingConformanceTraceResult>,
    /// Total events processed
    pub event_count: usize,
}

impl StreamingConformanceChecker {
    /// Create a new checker from a `DirectlyFollowsGraph`.
    pub fn from_dfg(dfg: &DirectlyFollowsGraph) -> Self {
        let dfg_edges: std::collections::HashSet<(String, String)> = dfg.edges
            .iter()
            .map(|e| (e.from.clone(), e.to.clone()))
            .collect();
        let start_activities: std::collections::HashSet<String> =
            dfg.start_activities.keys().cloned().collect();
        let end_activities: std::collections::HashSet<String> =
            dfg.end_activities.keys().cloned().collect();
        StreamingConformanceChecker {
            dfg_edges,
            start_activities,
            end_activities,
            open_traces: HashMap::new(),
            results: Vec::new(),
            event_count: 0,
        }
    }

    /// Append one event to an in-progress trace.
    pub fn add_event(&mut self, case_id: &str, activity: &str) {
        self.event_count += 1;
        self.open_traces
            .entry(case_id.to_string())
            .or_default()
            .push(activity.to_string());
    }

    /// Close a trace: check conformance and return result.
    /// Returns `None` if the case was never opened.
    pub fn close_trace(&mut self, case_id: &str) -> Option<StreamingConformanceTraceResult> {
        let activities = self.open_traces.remove(case_id)?;
        let result = self.check_trace(case_id, &activities);
        self.results.push(result.clone());
        Some(result)
    }

    fn check_trace(&self, case_id: &str, activities: &[String]) -> StreamingConformanceTraceResult {
        let mut deviations = Vec::new();

        if activities.is_empty() {
            return StreamingConformanceTraceResult {
                case_id: case_id.to_string(),
                is_conforming: true,
                deviations,
                fitness: 1.0,
            };
        }

        let mut valid_steps = 0usize;
        let total_steps = if activities.len() > 1 { activities.len() - 1 } else { 0 };

        for i in 0..total_steps {
            let pair = (activities[i].clone(), activities[i + 1].clone());
            if self.dfg_edges.contains(&pair) {
                valid_steps += 1;
            } else {
                deviations.push(StreamingConformanceDeviation {
                    position: i,
                    from_activity: activities[i].clone(),
                    to_activity: activities[i + 1].clone(),
                });
            }
        }

        let fitness = if total_steps == 0 {
            1.0
        } else {
            valid_steps as f64 / total_steps as f64
        };

        StreamingConformanceTraceResult {
            case_id: case_id.to_string(),
            is_conforming: deviations.is_empty(),
            deviations,
            fitness,
        }
    }
}

/// Temporal profile: per-pair mean and standard-deviation of time differences (ms).
#[derive(Debug, Clone)]
pub struct TemporalProfile {
    /// (from_activity, to_activity) → (mean_ms, std_ms, count)
    pub pairs: HashMap<(String, String), (f64, f64, usize)>,
}

impl TemporalProfile {
    pub fn new() -> Self { TemporalProfile { pairs: HashMap::new() } }
}

/// N-gram predictor: maps activity prefixes of length n to next-activity distributions.
#[derive(Debug, Clone)]
pub struct NGramPredictor {
    pub n: usize,
    /// prefix → HashMap<next_activity, count>
    pub counts: HashMap<Vec<String>, HashMap<String, usize>>,
}

impl NGramPredictor {
    pub fn new(n: usize) -> Self {
        NGramPredictor { n, counts: HashMap::new() }
    }

    /// Return ranked next-activity predictions for a given prefix.
    pub fn predict(&self, prefix: &[String]) -> Vec<(String, f64)> {
        let key_len = self.n.min(prefix.len());
        let key = prefix[prefix.len() - key_len..].to_vec();
        let Some(dist) = self.counts.get(&key) else { return vec![] };
        let total: usize = dist.values().sum();
        if total == 0 { return vec![]; }
        let mut result: Vec<(String, f64)> = dist.iter()
            .map(|(act, &cnt)| (act.clone(), cnt as f64 / total as f64))
            .collect();
        result.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        result
    }
}
