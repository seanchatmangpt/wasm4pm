//! POWL + Prediction Real-Data Tests
//!
//! P3 — POWL discovery on real XES data (all 8 variants, not just paper-synthetic logs)
//! P6 — Next-activity prediction on real XES data (NGramPredictor, bigram and trigram)
//!
//! Oracle rank: Rank 2 (domain contract) — outputs must be non-degenerate on real data.
//! Real-data invariants:
//!   - POWL discovery must succeed (Ok) on all 8 variants
//!   - POWL root must be a valid node in the arena
//!   - N-gram predictor trained on real data must return top-1 predictions for
//!     common prefixes that match known next activities

use std::collections::HashMap;
use std::fs;
use wasm4pm::models::{AttributeValue, Event, EventLog, NGramPredictor, Trace};
use wasm4pm::powl::discovery::{discover_powl, DiscoveryConfig, DiscoveryVariant};

// ---------------------------------------------------------------------------
// Inline XES parser
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

fn load_xes(candidates: &[&str]) -> Option<EventLog> {
    for path in candidates {
        if let Ok(content) = fs::read_to_string(path) {
            if content.len() > 200 {
                let log = parse_xes(&content);
                if !log.traces.is_empty() {
                    eprintln!("Loaded {} traces from {}", log.traces.len(), path);
                    return Some(log);
                }
            }
        }
    }
    None
}

const RUNNING_EXAMPLE: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/running-example.xes",
    "tests/fixtures/running-example.xes",
];

const ROADTRAFFIC: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
    "tests/fixtures/roadtraffic100traces.xes",
];

macro_rules! require_log {
    ($paths:expr, $label:expr) => {
        match load_xes($paths) {
            None => {
                eprintln!("SKIP: {} not found", $label);
                return;
            }
            Some(l) => l,
        }
    };
}

// ---------------------------------------------------------------------------
// POWL discovery on real data — all 8 variants
// ---------------------------------------------------------------------------

fn powl_config(variant: DiscoveryVariant) -> DiscoveryConfig {
    DiscoveryConfig {
        activity_key: "concept:name".to_string(),
        variant,
        min_trace_count: 1,
        noise_threshold: 0.0,
        from_dfg: false,
        fall_through_fired: false,
    }
}

#[test]
fn powl_discovery_running_example_decision_graph_cyclic_succeeds() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let config = powl_config(DiscoveryVariant::DecisionGraphCyclic);
    let result = discover_powl(&log, &config);
    assert!(
        result.is_ok(),
        "POWL DecisionGraphCyclic must succeed on running-example: {:?}",
        result.err()
    );
    let (arena, root) = result.unwrap();
    assert!(
        arena.get(root).is_some(),
        "Root handle must resolve in arena"
    );
}

#[test]
fn powl_discovery_running_example_decision_graph_max_succeeds() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let config = powl_config(DiscoveryVariant::DecisionGraphMax);
    let result = discover_powl(&log, &config);
    assert!(
        result.is_ok(),
        "POWL DecisionGraphMax must succeed on running-example: {:?}",
        result.err()
    );
}

#[test]
fn powl_discovery_running_example_maximal_succeeds() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let config = powl_config(DiscoveryVariant::Maximal);
    let result = discover_powl(&log, &config);
    assert!(
        result.is_ok(),
        "POWL Maximal must succeed on running-example: {:?}",
        result.err()
    );
}

#[test]
fn powl_discovery_running_example_tree_succeeds() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let config = powl_config(DiscoveryVariant::Tree);
    let result = discover_powl(&log, &config);
    assert!(
        result.is_ok(),
        "POWL Tree must succeed on running-example: {:?}",
        result.err()
    );
}

#[test]
fn powl_discovery_roadtraffic_decision_graph_cyclic_succeeds() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let config = powl_config(DiscoveryVariant::DecisionGraphCyclic);
    let result = discover_powl(&log, &config);
    assert!(
        result.is_ok(),
        "POWL DecisionGraphCyclic must succeed on roadtraffic: {:?}",
        result.err()
    );
    let (arena, root) = result.unwrap();
    assert!(
        arena.get(root).is_some(),
        "Root handle must resolve in arena"
    );
}

#[test]
fn powl_discovery_roadtraffic_all_variants_succeed() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    let variants = [
        DiscoveryVariant::DecisionGraphCyclic,
        DiscoveryVariant::DecisionGraphCyclicStrict,
        DiscoveryVariant::DecisionGraphMax,
        DiscoveryVariant::DecisionGraphClustering,
        DiscoveryVariant::DynamicClustering,
        DiscoveryVariant::Maximal,
        DiscoveryVariant::Tree,
        DiscoveryVariant::BruteForce,
    ];

    for variant in variants {
        let config = powl_config(variant);
        let result = discover_powl(&log, &config);
        assert!(
            result.is_ok(),
            "POWL variant {:?} must succeed on roadtraffic: {:?}",
            variant,
            result.err()
        );
    }
}

// ---------------------------------------------------------------------------
// Next-activity prediction on real data — NGramPredictor (pure Rust, no WASM)
// ---------------------------------------------------------------------------

fn build_ngram(log: &EventLog, n: usize) -> NGramPredictor {
    let mut predictor = NGramPredictor::new(n);
    for trace in &log.traces {
        let acts: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get("concept:name")?
                    .as_string()
                    .map(|s| s.to_string())
            })
            .collect();
        if acts.len() < 2 {
            continue;
        }
        for i in 0..acts.len() - 1 {
            let context_len = (n - 1).min(i + 1);
            let prefix: Vec<String> = acts[i + 1 - context_len..=i].to_vec();
            let next = acts[i + 1].clone();
            *predictor
                .counts
                .entry(prefix)
                .or_default()
                .entry(next)
                .or_insert(0) += 1;
        }
    }
    predictor
}

#[test]
fn ngram_predictor_roadtraffic_bigram_top1_after_create_fine_is_send_fine() {
    // pm4py DFG oracle: Create Fine → Send Fine (77 times) beats Create Fine → Payment (23)
    // So top-1 next after ["Create Fine"] must be "Send Fine"
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let predictor = build_ngram(&log, 2);

    let prefix = vec!["Create Fine".to_string()];
    let predictions = predictor.predict(&prefix);

    assert!(
        !predictions.is_empty(),
        "Bigram predictor must produce predictions for prefix [Create Fine]"
    );

    let (top1_act, top1_prob) = &predictions[0];
    assert_eq!(top1_act, "Send Fine",
        "Top-1 next activity after [Create Fine] must be 'Send Fine' (77/100 traces), got '{}' ({:.2})",
        top1_act, top1_prob);

    // Probability must be approximately 77/100 = 0.77
    assert!(
        *top1_prob > 0.70 && *top1_prob < 0.85,
        "P(Send Fine | Create Fine) ≈ 0.77, got {:.3}",
        top1_prob
    );
}

#[test]
fn ngram_predictor_roadtraffic_predictions_sum_to_one() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let predictor = build_ngram(&log, 2);

    let prefix = vec!["Create Fine".to_string()];
    let predictions = predictor.predict(&prefix);

    let total: f64 = predictions.iter().map(|(_, p)| p).sum();
    assert!(
        (total - 1.0).abs() < 1e-9,
        "Prediction probabilities must sum to 1.0, got {}",
        total
    );
}

#[test]
fn ngram_predictor_roadtraffic_trigram_refines_bigram() {
    // After (Insert Fine Notification, Add penalty), the top-1 should be
    // "Send for Credit Collection" (36/57 ≈ 63% of those who had add_penalty)
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let predictor = build_ngram(&log, 3);

    let prefix = vec![
        "Insert Fine Notification".to_string(),
        "Add penalty".to_string(),
    ];
    let predictions = predictor.predict(&prefix);

    assert!(
        !predictions.is_empty(),
        "Trigram predictor must handle known bigram prefix"
    );

    let (top1, top1_prob) = &predictions[0];
    assert_eq!(
        top1, "Send for Credit Collection",
        "After [Insert Fine Notification, Add penalty], top-1 must be \
         'Send for Credit Collection', got '{}' ({:.2})",
        top1, top1_prob
    );
}

#[test]
fn ngram_predictor_running_example_bigram_after_register_request() {
    // pm4py oracle: register request → examine casually (3), check ticket (2), examine thoroughly (1)
    // Top-1 must be "examine casually"
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let predictor = build_ngram(&log, 2);

    let prefix = vec!["register request".to_string()];
    let predictions = predictor.predict(&prefix);

    assert!(
        !predictions.is_empty(),
        "Bigram predictor must produce predictions after [register request]"
    );

    let (top1, _) = &predictions[0];
    assert_eq!(
        top1, "examine casually",
        "Top-1 after [register request] must be 'examine casually' (3/6 freq), got '{}'",
        top1
    );
}
