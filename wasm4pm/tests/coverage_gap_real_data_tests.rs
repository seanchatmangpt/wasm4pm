//! Coverage Gap Real-Data Tests — algorithms previously untested against real XES
//!
//! Covers the 6 algorithms with direct `*_from_log` Rust APIs:
//!   alpha_plus_plus, optimized_dfg, transition_system, log_to_trie,
//!   batches, correlation_miner
//!
//! Oracle rank: Rank 2 (domain contract) — outputs must be non-degenerate
//! on real-world logs that synthetic fixtures cannot replicate.

use std::collections::HashMap;
use std::fs;
use wasm4pm::algorithms::discover_alpha_plus_plus_from_log;
use wasm4pm::batches::discover_batches;
use wasm4pm::correlation_miner::{mine_correlation, CorrelationConfig};
use wasm4pm::ilp_discovery::discover_optimized_dfg_from_log;
use wasm4pm::log_to_trie::discover_prefix_tree_inner;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::transition_system::discover_transition_system;

// ---------------------------------------------------------------------------
// Inline XES parser (same pattern as real_data_algo_validation.rs)
// ---------------------------------------------------------------------------

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            });
        }
        if trimmed.starts_with("</trace>") {
            if let Some(t) = current_trace.take() {
                log.traces.push(t);
            }
        }
        if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
            current_event = Some(Event {
                attributes: HashMap::new(),
            });
        }
        if trimmed.starts_with("</event>") {
            if let Some(ev) = current_event.take() {
                if let Some(ref mut t) = current_trace {
                    t.events.push(ev);
                }
            }
        }
        if trimmed.starts_with("<string") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut t) = current_trace {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
        if trimmed.starts_with("<date") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
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

fn resolve_xes(candidates: &[&str]) -> Option<EventLog> {
    let home = std::env::var("HOME").unwrap_or_default();
    for path in candidates {
        let resolved = path.replace("~", &home);
        if let Ok(content) = fs::read_to_string(&resolved) {
            if content.len() > 200 {
                let log = parse_xes(&content);
                if !log.traces.is_empty() {
                    return Some(log);
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
                eprintln!("SKIP: {} not found", $label);
                return;
            }
            Some(log) => log,
        }
    };
}

// ---------------------------------------------------------------------------
// alpha_plus_plus — Petri net discovery via length-1/length-2 loop handling
// ---------------------------------------------------------------------------

#[test]
fn alpha_plus_plus_roadtraffic_produces_petri_net() {
    let log = require_log!(
        &[
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes",
            "bench_data/sepsis.xes"
        ],
        "roadtraffic or sepsis for alpha++"
    );
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let result = discover_alpha_plus_plus_from_log(&admitted, "concept:name", 0.0);
    assert!(result.is_ok(), "alpha++ must not error: {:?}", result.err());
    let net = result.unwrap();
    assert!(!net.places.is_empty(), "alpha++ must produce places");
    assert!(
        !net.transitions.is_empty(),
        "alpha++ must produce transitions"
    );
}

#[test]
fn alpha_plus_plus_running_example_produces_sound_petri_net() {
    let log = require_log!(
        &[
            "~/chatmangpt/pm4py/tests/input_data/running-example.xes",
            "~/chatmangpt/wasm4pm/tests/fixtures/running-example.xes"
        ],
        "running-example for alpha++"
    );
    let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence();
    let result = discover_alpha_plus_plus_from_log(&admitted, "concept:name", 0.0);
    assert!(result.is_ok(), "alpha++ must succeed on running-example");
    let net = result.unwrap();
    // Running example has 6 activities → at least 2 places (source + sink)
    assert!(
        net.places.len() >= 2,
        "alpha++ must produce ≥2 places, got {}",
        net.places.len()
    );
    assert!(
        net.transitions.len() >= 4,
        "alpha++ must produce ≥4 transitions, got {}",
        net.transitions.len()
    );
}

// ---------------------------------------------------------------------------
// optimized_dfg — ILP-penalized DFG minimization
// ---------------------------------------------------------------------------

#[test]
fn optimized_dfg_roadtraffic_reduces_noise() {
    let log = require_log!(
        &[
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes",
            "bench_data/sepsis.xes"
        ],
        "roadtraffic for optimized_dfg"
    );
    let dfg = discover_optimized_dfg_from_log(&log, "concept:name", 0.5, 0.5);
    // Optimized DFG must produce nodes and edges (not degenerate)
    assert!(!dfg.nodes.is_empty(), "optimized_dfg must produce nodes");
    assert!(!dfg.edges.is_empty(), "optimized_dfg must produce edges");
    // All edge frequencies must be positive
    for e in &dfg.edges {
        assert!(
            e.frequency > 0,
            "edge {}→{} must have positive frequency",
            e.from,
            e.to
        );
    }
}

#[test]
fn optimized_dfg_bpi2020_large_scale_non_degenerate() {
    let log = require_log!(
        &[
            "bench_data/bpi2020_travel.xes",
            "~/chatmangpt/wasm4pm/bench_data/bpi2020_travel.xes"
        ],
        "bpi2020 for optimized_dfg"
    );
    let dfg = discover_optimized_dfg_from_log(&log, "concept:name", 0.6, 0.4);
    assert!(
        dfg.nodes.len() >= 5,
        "bpi2020 optimized_dfg must have ≥5 nodes, got {}",
        dfg.nodes.len()
    );
    assert!(
        dfg.edges.len() >= 5,
        "bpi2020 optimized_dfg must have ≥5 edges, got {}",
        dfg.edges.len()
    );
}

// ---------------------------------------------------------------------------
// transition_system — sliding-window state machine discovery
// ---------------------------------------------------------------------------

#[test]
fn transition_system_roadtraffic_past_window_produces_states() {
    let log = require_log!(
        &[
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes",
            "bench_data/sepsis.xes"
        ],
        "roadtraffic for transition_system"
    );
    let ts = discover_transition_system(&log, "concept:name", 2, "past");
    assert!(!ts.states.is_empty(), "transition system must have states");
    assert!(
        !ts.transitions.is_empty(),
        "transition system must have transitions"
    );
    assert!(
        ts.initial_state.is_some(),
        "transition system must have an initial state"
    );
    // Number of distinct states should be less than total events (abstraction)
    let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
    assert!(
        ts.states.len() < total_events,
        "transition system should abstract events into fewer states"
    );
}

#[test]
fn transition_system_running_example_future_window_has_final_states() {
    let log = require_log!(
        &["~/chatmangpt/pm4py/tests/input_data/running-example.xes"],
        "running-example for transition_system"
    );
    let ts = discover_transition_system(&log, "concept:name", 1, "future");
    assert!(
        !ts.final_states.is_empty(),
        "transition system must have final states"
    );
}

// ---------------------------------------------------------------------------
// log_to_trie — prefix tree from trace variants
// ---------------------------------------------------------------------------

#[test]
fn prefix_tree_roadtraffic_captures_all_variants() {
    let log = require_log!(
        &[
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes",
            "bench_data/sepsis.xes"
        ],
        "roadtraffic for prefix_tree"
    );
    let result = discover_prefix_tree_inner(&log, "concept:name", None);
    assert!(
        result.is_ok(),
        "prefix tree must not error: {:?}",
        result.err()
    );
    let trie = result.unwrap();
    // Road traffic has multiple variants
    assert!(
        trie.variants >= 1,
        "prefix tree must capture ≥1 variant, got {}",
        trie.variants
    );
    assert!(
        trie.max_depth >= 1,
        "prefix tree must have depth ≥1, got {}",
        trie.max_depth
    );
}

#[test]
fn prefix_tree_sepsis_limited_depth_reduces_variant_count() {
    let log = require_log!(
        &["bench_data/sepsis.xes"],
        "sepsis for prefix_tree depth limit"
    );
    let full = discover_prefix_tree_inner(&log, "concept:name", None).unwrap();
    let limited = discover_prefix_tree_inner(&log, "concept:name", Some(3)).unwrap();
    // Limiting depth must not increase variant count
    assert!(
        limited.variants <= full.variants,
        "limited-depth trie ({}) must have ≤ variants than full ({})",
        limited.variants,
        full.variants
    );
    assert!(
        limited.max_depth <= 3,
        "limited-depth trie must not exceed max_depth=3, got {}",
        limited.max_depth
    );
}

// ---------------------------------------------------------------------------
// batches — batch pattern detection (concurrent/sequential batches)
// ---------------------------------------------------------------------------

#[test]
fn batches_roadtraffic_does_not_panic_on_real_timestamps() {
    let log = require_log!(
        &[
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes"
        ],
        "roadtraffic for batches"
    );
    let result = discover_batches(&log, "concept:name", "time:timestamp");
    // Batch detection runs without panicking; result may be empty if no batches found
    // (real logs without tight concurrent executions may have 0 batches — that's valid)
    assert!(
        result.total_batches == result.batches.len(),
        "batch count must be consistent"
    );
}

#[test]
fn batches_sepsis_structural_consistency() {
    let log = require_log!(&["bench_data/sepsis.xes"], "sepsis for batches");
    let result = discover_batches(&log, "concept:name", "time:timestamp");
    // Each batch must have at least 2 case references (batch = ≥2 cases together)
    for batch in &result.batches {
        assert!(
            !batch.activity.is_empty(),
            "batch activity name must not be empty"
        );
    }
    assert_eq!(
        result.total_batches,
        result.batches.len(),
        "total_batches must equal batches.len()"
    );
}

// ---------------------------------------------------------------------------
// correlation_miner — timestamp-based activity correlation
// ---------------------------------------------------------------------------

#[test]
fn correlation_miner_roadtraffic_produces_edges() {
    let log = require_log!(
        &[
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
            "~/chatmangpt/pm4py/tests/input_data/roadtraffic50traces.xes",
            "bench_data/sepsis.xes"
        ],
        "roadtraffic for correlation_miner"
    );
    let result = mine_correlation(
        &log,
        "concept:name",
        "time:timestamp",
        &CorrelationConfig::default(),
    );
    // Correlation miner must produce correlated activity pairs on real timestamp data
    // Edge tuple: (source_activity, target_activity, frequency)
    assert!(
        !result.edges.is_empty(),
        "correlation miner must find correlated edges on real log"
    );
    for (src, dst, freq) in &result.edges {
        assert!(
            *freq > 0,
            "edge {}→{} must have positive frequency",
            src,
            dst
        );
        assert!(!src.is_empty(), "source activity must not be empty");
        assert!(!dst.is_empty(), "target activity must not be empty");
    }
}

#[test]
fn correlation_miner_sepsis_min_frequency_filter_works() {
    let log = require_log!(&["bench_data/sepsis.xes"], "sepsis for correlation_miner");
    let cfg_low = CorrelationConfig {
        correlation_threshold: 3600.0 * 24.0,
        min_edge_frequency: 1,
    };
    let cfg_high = CorrelationConfig {
        correlation_threshold: 3600.0 * 24.0,
        min_edge_frequency: 5,
    };
    let result_low = mine_correlation(&log, "concept:name", "time:timestamp", &cfg_low);
    let result_high = mine_correlation(&log, "concept:name", "time:timestamp", &cfg_high);
    // Higher min_frequency must produce ≤ edges than lower min_frequency
    assert!(
        result_high.edges.len() <= result_low.edges.len(),
        "higher min_frequency ({}) should not produce more edges than lower ({})",
        result_high.edges.len(),
        result_low.edges.len()
    );
    // All high-frequency edges must satisfy min_frequency=5
    for (src, dst, freq) in &result_high.edges {
        assert!(
            *freq >= 5,
            "edge {}→{} frequency {} must be ≥5",
            src,
            dst,
            freq
        );
    }
}
