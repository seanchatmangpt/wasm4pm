//! Analytics & Prediction Real-Data Tests
//!
//! Exercises prediction_drift and prediction_additions modules (Group 3/4)
//! against real XES data. All functions are pure Rust.
//!
//! Coverage:
//!   - ewma_series: EWMA smoothing on real activity-count time series
//!   - classify_trend: trend classification on smoothed series
//!   - calculate_rework_score: repeated-activity detection on real traces
//!   - extract_prefix_features: feature extraction on real trace prefixes
//!   - boundary_coverage: prefix completion coverage on real log

use std::collections::HashMap;
use std::fs;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::prediction_additions::{
    boundary_coverage, calculate_rework_score, extract_prefix_features,
};
use wasm4pm::prediction_drift::{classify_trend, ewma_series};

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
                    eprintln!(
                        "Analytics tests: loaded {} traces from {}",
                        log.traces.len(),
                        path
                    );
                    return Some(log);
                }
            }
        }
    }
    None
}

fn extract_activities(log: &EventLog) -> Vec<Vec<String>> {
    log.traces
        .iter()
        .map(|t| {
            t.events
                .iter()
                .filter_map(|e| {
                    e.attributes
                        .get("concept:name")?
                        .as_string()
                        .map(|s| s.to_string())
                })
                .collect()
        })
        .collect()
}

const ROADTRAFFIC: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
    "tests/fixtures/roadtraffic100traces.xes",
];

const RUNNING_EXAMPLE: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/running-example.xes",
    "tests/fixtures/running-example.xes",
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
// ewma_series
// ---------------------------------------------------------------------------

#[test]
fn ewma_series_roadtraffic_case_lengths_smoothed_output_length_matches() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let values: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();

    let smoothed = ewma_series(&values, 0.3);

    assert_eq!(
        smoothed.len(),
        values.len(),
        "EWMA output length must equal input length"
    );
}

#[test]
fn ewma_series_roadtraffic_output_values_are_positive() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let values: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();

    let smoothed = ewma_series(&values, 0.3);

    for (i, &v) in smoothed.iter().enumerate() {
        assert!(
            v > 0.0,
            "EWMA value at index {} must be positive (trace lengths > 0), got {}",
            i,
            v
        );
    }
}

#[test]
fn ewma_series_roadtraffic_smoothing_reduces_variance() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let values: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();

    if values.len() < 2 {
        return;
    }

    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let raw_variance = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / values.len() as f64;

    let smoothed = ewma_series(&values, 0.3);
    let smooth_mean = smoothed.iter().sum::<f64>() / smoothed.len() as f64;
    let smooth_variance = smoothed
        .iter()
        .map(|v| (v - smooth_mean).powi(2))
        .sum::<f64>()
        / smoothed.len() as f64;

    // EWMA with alpha=0.3 is a strong smoother; variance should not increase
    assert!(
        smooth_variance <= raw_variance * 1.05,
        "EWMA should reduce variance: raw={:.3} smooth={:.3}",
        raw_variance,
        smooth_variance
    );
}

// ---------------------------------------------------------------------------
// classify_trend
// ---------------------------------------------------------------------------

#[test]
fn classify_trend_roadtraffic_returns_valid_category() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let values: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();
    let smoothed = ewma_series(&values, 0.3);

    let trend = classify_trend(&smoothed);

    // classify_trend returns "rising", "falling", or "stable"
    let valid = ["rising", "falling", "stable"];
    assert!(
        valid.contains(&trend),
        "classify_trend must return one of {:?}, got '{}'",
        valid,
        trend
    );
}

#[test]
fn classify_trend_strictly_increasing_series_is_rising() {
    let increasing: Vec<f64> = (1..=20).map(|i| i as f64).collect();
    let trend = classify_trend(&increasing);
    assert_eq!(
        trend, "rising",
        "Strictly increasing series must be classified 'rising', got '{}'",
        trend
    );
}

#[test]
fn classify_trend_strictly_decreasing_series_is_falling() {
    let decreasing: Vec<f64> = (1..=20).rev().map(|i| i as f64).collect();
    let trend = classify_trend(&decreasing);
    assert_eq!(
        trend, "falling",
        "Strictly decreasing series must be classified 'falling', got '{}'",
        trend
    );
}

// ---------------------------------------------------------------------------
// calculate_rework_score
// ---------------------------------------------------------------------------

#[test]
fn rework_score_roadtraffic_payment_loop_detected() {
    // roadtraffic has Payment->Payment self-loop in DFG (5 times)
    // Traces with repeated Payment should have rework_score >= 1
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let trace_activities = extract_activities(&log);

    let rework_traces: Vec<usize> = trace_activities
        .iter()
        .map(|acts| calculate_rework_score(acts))
        .filter(|&s| s > 0)
        .collect();

    // pm4py DFG shows Payment->Payment=5, so at least a few traces have rework
    assert!(
        !rework_traces.is_empty(),
        "roadtraffic must have at least one trace with rework (Payment loop seen in DFG)"
    );
}

#[test]
fn rework_score_trace_with_no_repetitions_is_zero() {
    // A simple trace with all distinct activities has rework_score=0
    let trace = vec!["A".to_string(), "B".to_string(), "C".to_string()];
    assert_eq!(
        calculate_rework_score(&trace),
        0,
        "Trace with no consecutive repeats must have rework_score=0"
    );
}

#[test]
fn rework_score_trace_with_consecutive_repeat_is_one() {
    let trace = vec!["A".to_string(), "A".to_string(), "B".to_string()];
    assert_eq!(
        calculate_rework_score(&trace),
        1,
        "Trace [A,A,B] must have rework_score=1"
    );
}

// ---------------------------------------------------------------------------
// extract_prefix_features
// ---------------------------------------------------------------------------

#[test]
fn prefix_features_roadtraffic_first_activity_prefix() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let trace_activities = extract_activities(&log);

    // All traces start with "Create Fine" — prefix of length 1
    let prefix = vec!["Create Fine".to_string()];
    let features = extract_prefix_features(&prefix);

    assert_eq!(features.length, 1, "Prefix length must be 1");
    assert_eq!(
        features.last_activity, "Create Fine",
        "last_activity must be 'Create Fine'"
    );
    assert_eq!(
        features.unique_activities, 1,
        "unique_activities must be 1 for single-element prefix"
    );
    assert_eq!(
        features.rework_count, 0,
        "No rework in a single-element prefix"
    );

    // Verify the function works for all traces
    for acts in &trace_activities {
        if acts.is_empty() {
            continue;
        }
        let p = &acts[..1];
        let f = extract_prefix_features(p);
        assert_eq!(f.length, 1, "Single-element prefix must have length=1");
        assert!(
            f.unique_activities >= 1,
            "unique_activities must be >= 1 for non-empty prefix"
        );
    }
}

#[test]
fn prefix_features_entropy_bounded() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let trace_activities = extract_activities(&log);

    for acts in &trace_activities {
        if acts.len() < 3 {
            continue;
        }
        let features = extract_prefix_features(&acts[..3]);
        assert!(
            features.activity_frequency_entropy >= 0.0
                && features.activity_frequency_entropy <= 1.0,
            "Entropy must be in [0,1], got {}",
            features.activity_frequency_entropy
        );
    }
}

// ---------------------------------------------------------------------------
// boundary_coverage
// ---------------------------------------------------------------------------

#[test]
fn boundary_coverage_roadtraffic_create_fine_prefix_has_coverage() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let trace_activities = extract_activities(&log);

    // ["Create Fine"] is the prefix of 100% of traces → coverage should be high
    let prefix = vec!["Create Fine".to_string()];
    let coverage = boundary_coverage(&prefix, &trace_activities);

    assert!(
        coverage > 0.0 && coverage <= 1.0,
        "boundary_coverage must be in (0,1], got {}",
        coverage
    );
    // All traces start with "Create Fine", so this prefix reaches many completions
    assert!(
        coverage > 0.5,
        "Prefix ['Create Fine'] appears in most traces, expected coverage > 0.5, got {}",
        coverage
    );
}

#[test]
fn boundary_coverage_impossible_prefix_returns_zero() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let trace_activities = extract_activities(&log);

    // A prefix that does not appear in any real trace
    let prefix = vec!["NONEXISTENT_ACTIVITY_XYZ".to_string()];
    let coverage = boundary_coverage(&prefix, &trace_activities);

    assert_eq!(
        coverage, 0.0,
        "Impossible prefix must have boundary_coverage=0.0, got {}",
        coverage
    );
}

#[test]
fn boundary_coverage_running_example_register_request() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let trace_activities = extract_activities(&log);

    let prefix = vec!["register request".to_string()];
    let coverage = boundary_coverage(&prefix, &trace_activities);

    assert!(
        coverage > 0.0,
        "Prefix ['register request'] appears in all 6 traces → coverage > 0"
    );
}
