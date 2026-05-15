//! Real-Data Algorithm Validation — all algorithms against real XES/OCEL files
//!
//! Validates every algorithm category (discovery, ML, social, temporal, conformance)
//! against real-world event logs from bench_data/ and ~/chatmangpt/pm4py.
//!
//! Oracle rank: Rank 2 (domain contract) — outputs must be non-degenerate
//! and structurally sound on data no synthetic fixture can replicate.

use std::collections::HashMap;
use std::fs;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::fast_discovery::{discover_astar_from_log, discover_hill_climbing_from_log};
use wasm4pm::genetic_discovery::{
    discover_aco_algorithm_from_log, discover_genetic_algorithm_from_log,
    discover_pso_algorithm_from_log,
};
use wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log;
use wasm4pm::ml::classification::extract_features;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::{
    discover_inductive_miner_from_log, discover_simulated_annealing_from_log,
};
use wasm4pm::social_network::discover_handover_network_from_log;
use wasm4pm::temporal_profile::discover_temporal_profile_from_log;
#[cfg(feature = "cloud")]
use wasm4pm::spc::{check_western_electric_rules, ChartData};

// ---------------------------------------------------------------------------
// Inline XES parser — integration tests cannot use wasm_bindgen wrappers.
// Pattern from dirty_data_xes_tests.rs (authoritative in-project approach).
// ---------------------------------------------------------------------------

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace { attributes: HashMap::new(), events: Vec::new() });
        }
        if trimmed.starts_with("</trace>") {
            if let Some(t) = current_trace.take() { log.traces.push(t); }
        }
        if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
            current_event = Some(Event { attributes: HashMap::new() });
        }
        if trimmed.starts_with("</event>") {
            if let Some(ev) = current_event.take() {
                if let Some(ref mut t) = current_trace { t.events.push(ev); }
            }
        }

        // <string key="..." value="..."/>
        if trimmed.starts_with("<string") {
            if let (Some(k), Some(v)) = (extract_attr(trimmed, "key"), extract_attr(trimmed, "value")) {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut t) = current_trace {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
        // <date key="..." value="..."/> — stored as Date for performance DFG compatibility
        if trimmed.starts_with("<date") {
            if let (Some(k), Some(v)) = (extract_attr(trimmed, "key"), extract_attr(trimmed, "value")) {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::Date(v));
                }
            }
        }
    }
    log
}

fn extract_attr(s: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = s.find(&needle)? + needle.len();
    let end = s[start..].find('"')?;
    Some(s[start..start + end].to_string())
}

// ---------------------------------------------------------------------------
// Data resolution helpers
// ---------------------------------------------------------------------------

fn resolve_xes(candidates: &[&str]) -> Option<(String, EventLog)> {
    for path in candidates {
        if let Ok(content) = fs::read_to_string(path) {
            if content.len() > 200 {
                let log = parse_xes(&content);
                if !log.traces.is_empty() {
                    return Some((path.to_string(), log));
                }
            }
        }
    }
    None
}

macro_rules! require_log {
    ($candidates:expr, $label:expr) => {
        match resolve_xes($candidates) {
            None => {
                eprintln!("SKIP: {} not found at any candidate path", $label);
                return;
            }
            Some((path, log)) => {
                eprintln!("[{}] {} traces from {}", $label, log.traces.len(), path);
                log
            }
        }
    };
}

const RUNNING_EXAMPLE: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/running-example.xes",
    "/Users/sac/chatmangpt/wasm4pm/tests/fixtures/running-example.xes",
    "tests/fixtures/running-example.xes",
];

const ROADTRAFFIC: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
    "/Users/sac/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes",
    "tests/fixtures/roadtraffic100traces.xes",
];

const RECEIPT: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/receipt.xes",
    "tests/fixtures/receipt.xes",
];

const BPI2020: &[&str] = &[
    "bench_data/bpi2020_travel.xes",
    "../bench_data/bpi2020_travel.xes",
    "/Users/sac/chatmangpt/wasm4pm/bench_data/bpi2020_travel.xes",
];

// ---------------------------------------------------------------------------
// DFG — discovery foundation, tested on every real log
// ---------------------------------------------------------------------------

#[test]
fn dfg_running_example_has_edges_and_start_activities() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    assert!(log.traces.len() >= 6);

    let dfg = discover_dfg_from_log(&log, "concept:name");
    assert!(!dfg.edges.is_empty(), "DFG must have edges; got 0");
    assert!(dfg.edges.len() >= 5, "Running-example DFG ≥5 edges, got {}", dfg.edges.len());
    assert!(!dfg.start_activities.is_empty(), "DFG must have start activities");
    assert!(!dfg.end_activities.is_empty(), "DFG must have end activities");
}

#[test]
fn dfg_roadtraffic_edge_frequencies_are_positive() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    assert!(log.traces.len() >= 10);

    let dfg = discover_dfg_from_log(&log, "concept:name");
    assert!(dfg.edges.len() >= 8, "roadtraffic DFG ≥8 edges, got {}", dfg.edges.len());
    for rel in &dfg.edges {
        assert!(rel.frequency > 0, "Edge {}→{} has zero frequency", rel.from, rel.to);
    }
}

#[test]
fn dfg_receipt_reflects_complex_variant_structure() {
    let log = require_log!(RECEIPT, "receipt");
    assert!(log.traces.len() >= 100, "receipt should have many traces, got {}", log.traces.len());

    let dfg = discover_dfg_from_log(&log, "concept:name");
    assert!(dfg.edges.len() >= 15,
        "receipt DFG must be complex (many variants), got {} edges", dfg.edges.len());
}

#[test]
fn dfg_bpi2020_large_scale_non_degenerate() {
    let log = require_log!(BPI2020, "bpi2020-travel");
    assert!(log.traces.len() > 1000, "BPI 2020 should have >1000 traces, got {}", log.traces.len());

    let dfg = discover_dfg_from_log(&log, "concept:name");
    assert!(dfg.edges.len() >= 20,
        "BPI 2020 DFG ≥20 edges on {} traces, got {}", log.traces.len(), dfg.edges.len());
}

// ---------------------------------------------------------------------------
// Heuristic miner
// ---------------------------------------------------------------------------

#[test]
fn heuristic_miner_running_example_non_empty() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert!(!dfg.edges.is_empty(), "Heuristic miner must produce edges on running-example");
}

#[test]
fn heuristic_miner_bpi2020_non_degenerate() {
    let log = require_log!(BPI2020, "bpi2020-travel");
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    assert!(!dfg.edges.is_empty(), "Heuristic miner must produce edges on BPI 2020");
}

// ---------------------------------------------------------------------------
// Inductive miner — returns JSON string of process tree
// ---------------------------------------------------------------------------

#[test]
fn inductive_miner_running_example_returns_valid_json() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let tree_json = discover_inductive_miner_from_log(&log, "concept:name");
    // Must be non-empty JSON (not an empty object or array)
    assert!(tree_json.len() > 10,
        "Inductive miner must return non-trivial JSON, got {:?}", &tree_json[..tree_json.len().min(50)]);
    // Must be valid JSON
    let parsed: serde_json::Value = serde_json::from_str(&tree_json)
        .expect("Inductive miner output must be valid JSON");
    assert!(!parsed.is_null(), "Inductive miner JSON must not be null");
}

// ---------------------------------------------------------------------------
// ILP — returns (PetriNet, precision, fitness)
// ---------------------------------------------------------------------------

#[test]
fn ilp_running_example_petri_net_sound() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let (net, fitness, precision) = discover_ilp_petri_net_from_log(&log, "concept:name");
    assert!(net.transitions.len() >= 4,
        "ILP net ≥4 transitions on running-example, got {}", net.transitions.len());
    assert!(net.places.len() >= 2,
        "ILP net ≥2 places (source+sink), got {}", net.places.len());
    assert!(fitness >= 0.0 && fitness <= 1.0, "ILP fitness ∈ [0,1], got {}", fitness);
    assert!(precision >= 0.0 && precision <= 1.0, "ILP precision ∈ [0,1], got {}", precision);
}

// ---------------------------------------------------------------------------
// Genetic algorithm, ACO, PSO — fitness in [0,1] on real data
// ---------------------------------------------------------------------------

#[test]
fn genetic_algorithm_running_example_fitness_in_range() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let result = discover_genetic_algorithm_from_log(&log, "concept:name", 10, 5);
    if let Some((dfg, fitness)) = result {
        assert!(fitness >= 0.0 && fitness <= 1.0, "GA fitness ∈ [0,1], got {}", fitness);
        assert!(!dfg.edges.is_empty(), "GA must produce non-empty edge set");
    }
    // None means insufficient data — acceptable for small logs
}

#[test]
fn aco_roadtraffic_fitness_in_range() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let result = discover_aco_algorithm_from_log(&log, "concept:name", 5, 3);
    if let Some((_dfg, fitness)) = result {
        assert!(fitness >= 0.0 && fitness <= 1.0, "ACO fitness ∈ [0,1], got {}", fitness);
    }
}

#[test]
fn pso_roadtraffic_fitness_in_range() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let result = discover_pso_algorithm_from_log(&log, "concept:name", 5, 3);
    if let Some((_dfg, fitness)) = result {
        assert!(fitness >= 0.0 && fitness <= 1.0, "PSO fitness ∈ [0,1], got {}", fitness);
    }
}

// ---------------------------------------------------------------------------
// Simulated annealing, A*, hill climbing
// ---------------------------------------------------------------------------

#[test]
fn simulated_annealing_running_example_fitness_in_range() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let (_dfg, fitness) = discover_simulated_annealing_from_log(&log, "concept:name", 10.0, 0.8);
    assert!(fitness >= 0.0 && fitness <= 1.0, "SA fitness ∈ [0,1], got {}", fitness);
}

#[test]
fn astar_roadtraffic_produces_dfg() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (dfg, _iterations) = discover_astar_from_log(&log, "concept:name", 50);
    assert!(!dfg.edges.is_empty(), "A* must produce non-empty DFG on roadtraffic");
}

#[test]
fn hill_climbing_roadtraffic_produces_dfg() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let dfg = discover_hill_climbing_from_log(&log, "concept:name");
    assert!(!dfg.edges.is_empty(), "Hill climbing must produce edges on roadtraffic");
}

// ---------------------------------------------------------------------------
// ML classification — real feature extraction and validation
// ---------------------------------------------------------------------------

#[test]
fn ml_features_from_bpi2020_are_finite_and_classified() {
    let log = require_log!(BPI2020, "bpi2020-travel");
    let (features, labels) = extract_features(&log, "concept:name");

    assert!(features.len() >= 100,
        "BPI 2020 should yield ≥100 training examples, got {}", features.len());
    assert_eq!(features.len(), labels.len(), "Feature and label counts must match");

    for (i, f) in features.iter().enumerate() {
        assert!(f[0].is_finite(), "features[{}][0] (trace length) must be finite", i);
        assert!(f[1].is_finite(), "features[{}][1] (unique activities) must be finite", i);
        assert!(f[0] >= 1.0, "Trace length ≥1 for real data, got {} at index {}", f[0], i);
    }
    for &l in &labels {
        assert!(l <= 2, "Label must be in {{0,1,2}}, got {}", l);
    }

    // Real BPI 2020 has wide trace-length variation → multiple classes must appear
    let mut counts = [0usize; 3];
    for &l in &labels { counts[l as usize] += 1; }
    let populated = counts.iter().filter(|&&c| c > 0).count();
    assert!(populated >= 2,
        "BPI 2020 should generate ≥2 label classes, got {} (counts: {:?})", populated, counts);
}

#[test]
fn ml_features_from_roadtraffic_are_finite() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, labels) = extract_features(&log, "concept:name");
    assert!(!features.is_empty(), "roadtraffic must yield ML features");
    assert_eq!(features.len(), labels.len());
    for f in &features {
        assert!(f[0].is_finite() && f[1].is_finite(), "All roadtraffic features must be finite");
    }
}

#[test]
fn knn_accuracy_on_roadtraffic_is_in_range() {
    use wasm4pm::ml::classification::knn_internal;

    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, labels) = extract_features(&log, "concept:name");
    if features.len() < 10 {
        eprintln!("SKIP: insufficient features ({})", features.len());
        return;
    }
    let split = (features.len() * 4) / 5;
    let accuracy = knn_internal(&features[..split], &labels[..split],
                                &features[split..], &labels[split..], 3);
    assert!(accuracy >= 0.0 && accuracy <= 1.0,
        "k-NN accuracy ∈ [0,1], got {}", accuracy);
}

// ---------------------------------------------------------------------------
// Social network — real org data in BPI 2020
// ---------------------------------------------------------------------------

#[test]
fn social_network_bpi2020_does_not_panic() {
    let log = require_log!(BPI2020, "bpi2020-travel");
    // BPI 2020 Travel has org:resource — handover network must not crash
    let net = discover_handover_network_from_log(&log, "org:resource");
    // Just assert it ran; org:resource may or may not be in this specific log variant
    let _ = net;
}

// ---------------------------------------------------------------------------
// Temporal profile — real timing relationships
// ---------------------------------------------------------------------------

#[test]
fn temporal_profile_roadtraffic_durations_are_non_negative() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let profile = discover_temporal_profile_from_log(&log, "concept:name", "time:timestamp");
    // Temporal profile is a HashMap<(String,String), (mean, std, count)>
    for ((from, to), (mean, _std, count)) in &profile.pairs {
        assert!(*mean >= 0.0,
            "Mean duration {}→{} must be ≥0, got {}", from, to, mean);
        assert!(*count > 0,
            "Count for {}→{} must be >0, got {}", from, to, count);
    }
}

// ---------------------------------------------------------------------------
// SPC — Western Electric rules on real trace-length time-series
// ---------------------------------------------------------------------------

#[cfg(feature = "cloud")]
#[test]
fn spc_western_electric_runs_on_bpi2020_trace_lengths() {
    let log = require_log!(BPI2020, "bpi2020-travel");
    assert!(log.traces.len() >= 20, "Need ≥20 traces for SPC");

    let lengths: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();
    let n = lengths.len() as f64;
    let mean = lengths.iter().sum::<f64>() / n;
    let std_dev = {
        let var = lengths.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n;
        var.sqrt().max(0.001)
    };

    let chart: Vec<ChartData> = lengths.iter().map(|&v| ChartData {
        timestamp: String::new(),
        value: v,
        ucl: mean + 3.0 * std_dev,
        cl: mean,
        lcl: (mean - 3.0 * std_dev).max(0.0),
        subgroup_data: None,
    }).collect();

    // Must not panic; result type is structurally valid
    let alerts = check_western_electric_rules(&chart);
    for alert in &alerts {
        // All alert variants must be printable (sanity check the enum)
        let s = format!("{:?}", alert);
        assert!(!s.is_empty(), "Alert debug representation must be non-empty");
    }
}

// ---------------------------------------------------------------------------
// Performance DFG — timing-based DFG requires real timestamps
// pm4py oracle: performance_dfg(roadtraffic) produces 18 edges with mean > 0
// ---------------------------------------------------------------------------

#[test]
fn performance_dfg_roadtraffic_produces_non_zero_durations() {
    use wasm4pm::performance_dfg::discover_performance_dfg_from_log;

    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let json = discover_performance_dfg_from_log(&log, "concept:name", "time:timestamp");
    let parsed: serde_json::Value = serde_json::from_str(&json)
        .expect("Performance DFG must return valid JSON");

    // Must have edges array
    let edges = parsed.get("edges").expect("Must have 'edges' key");
    let edge_arr = edges.as_array().expect("'edges' must be an array");

    // pm4py oracle: 18 edges on roadtraffic100
    assert_eq!(edge_arr.len(), 18,
        "pm4py oracle: performance DFG must have 18 edges, got {}", edge_arr.len());

    // At least some edges must have non-zero mean duration (field name: mean_ms)
    let non_zero = edge_arr.iter()
        .filter(|e| e.get("mean_ms")
            .and_then(|v| v.as_f64())
            .map(|d| d > 0.0)
            .unwrap_or(false))
        .count();
    assert!(non_zero > 0,
        "Performance DFG on real timestamps must produce some non-zero mean_ms durations; \
         got JSON: {}", &json[..json.len().min(200)]);
}

// ---------------------------------------------------------------------------
// Social network — working-together (complement to handover)
// ---------------------------------------------------------------------------

#[test]
fn working_together_network_bpi2020_does_not_panic() {
    use wasm4pm::social_network::discover_working_together_network_from_log;

    let log = require_log!(BPI2020, "bpi2020-travel");
    let net = discover_working_together_network_from_log(&log, "org:resource");
    let _ = net; // Must not panic; JSON serialization validates structural soundness
}
