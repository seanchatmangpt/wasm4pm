#![allow(clippy::all, dead_code)]
//! ML Real-Data Tests
//!
//! Exercises ML sub-families (P4 from coverage audit) against real XES data.
//! All functions under test are pure Rust (no WASM state required).
//!
//! Coverage:
//!   - pca_internal: PCA on trace-feature matrix extracted from roadtraffic
//!   - regression_internal: linear regression on case-length vs variant index
//!   - forecast_internal: EWMA forecast on activity-count time series
//!   - discover_automl_forecast_internal: AutoML EWMA sweep
//!   - discover_automl_classify_internal: AutoML k-NN sweep
//!   - extract_features + knn_sweep_cv: full classify pipeline on real log

use std::collections::HashMap;
use std::fs;
use wasm4pm::ml::automl::{discover_automl_classify_internal, discover_automl_forecast_internal};
use wasm4pm::ml::classification::{extract_features, knn_sweep_cv};
use wasm4pm::ml::forecasting::forecast_internal;
use wasm4pm::ml::pca::pca_internal;
use wasm4pm::ml::regression::regression_internal;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

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
        if trimmed.starts_with("<string") {
            if let (Some(k), Some(v)) = (extract_attr(trimmed, "key"), extract_attr(trimmed, "value")) {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut t) = current_trace {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
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

fn load_xes(candidates: &[&str]) -> Option<EventLog> {
    for path in candidates {
        if let Ok(content) = fs::read_to_string(path) {
            if content.len() > 200 {
                let log = parse_xes(&content);
                if !log.traces.is_empty() {
                    eprintln!("ML tests: loaded {} traces from {}", log.traces.len(), path);
                    return Some(log);
                }
            }
        }
    }
    None
}

const ROADTRAFFIC: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
    "tests/fixtures/roadtraffic100traces.xes",
];

macro_rules! require_log {
    ($paths:expr, $label:expr) => {
        match load_xes($paths) {
            None => { eprintln!("SKIP: {} not found", $label); return; }
            Some(l) => l,
        }
    };
}

// ---------------------------------------------------------------------------
// PCA
// ---------------------------------------------------------------------------

#[test]
fn pca_roadtraffic_eigenvalues_are_positive() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, _) = extract_features(&log, "concept:name");
    assert!(features.len() >= 2, "Need at least 2 traces for PCA");

    let result = pca_internal(&features);

    assert!(result.eigenvalues[0] >= 0.0,
        "First eigenvalue must be non-negative, got {}", result.eigenvalues[0]);
    assert!(result.eigenvalues[1] >= 0.0,
        "Second eigenvalue must be non-negative, got {}", result.eigenvalues[1]);
    assert!(result.explained_variance[0] >= 0.0 && result.explained_variance[0] <= 1.0,
        "First explained variance must be in [0,1], got {}", result.explained_variance[0]);
}

#[test]
fn pca_roadtraffic_first_component_dominates() {
    // In real process logs, first PC typically explains more variance than second
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, _) = extract_features(&log, "concept:name");

    let result = pca_internal(&features);

    // The first eigenvalue must be >= second (by definition of PCA)
    assert!(result.eigenvalues[0] >= result.eigenvalues[1],
        "First eigenvalue ({}) must be >= second ({})",
        result.eigenvalues[0], result.eigenvalues[1]);
}

// ---------------------------------------------------------------------------
// Regression
// ---------------------------------------------------------------------------

#[test]
fn regression_roadtraffic_trace_length_vs_event_count_non_degenerate() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    // x = trace index, y = trace length (number of events)
    let x: Vec<f64> = (0..log.traces.len()).map(|i| i as f64).collect();
    let y: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();

    let result = regression_internal(&x, &y);

    // r_squared must be in [0, 1]
    assert!(result.r_squared >= 0.0 && result.r_squared <= 1.0,
        "R² must be in [0,1], got {}", result.r_squared);

    // With 100 traces and real case lengths, intercept must be positive
    assert!(result.intercept > 0.0,
        "Intercept must be positive (avg case length > 0), got {}", result.intercept);
}

#[test]
fn regression_roadtraffic_unique_activities_vs_case_length_correlated() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, _) = extract_features(&log, "concept:name");

    // features[i][0] = trace length, features[i][1] = unique activities
    let x: Vec<f64> = features.iter().map(|f| f[0]).collect();
    let y: Vec<f64> = features.iter().map(|f| f[1]).collect();

    let result = regression_internal(&x, &y);

    // Longer traces generally have more unique activities → positive slope
    assert!(result.slope >= 0.0,
        "Slope of (trace_length → unique_activities) must be non-negative, got {}", result.slope);
}

// ---------------------------------------------------------------------------
// Forecasting
// ---------------------------------------------------------------------------

#[test]
fn forecast_roadtraffic_case_lengths_ewma_non_degenerate() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    // Build a time series: one data point per trace = trace event count
    let series: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();
    assert!(series.len() >= 5, "Need at least 5 traces for forecast");

    let result = forecast_internal(&series, 0.3);

    assert!(result.rmse >= 0.0, "RMSE must be non-negative, got {}", result.rmse);
    assert!(result.next_window > 0.0,
        "Forecast next_window must be positive (trace lengths > 0), got {}", result.next_window);
}

// ---------------------------------------------------------------------------
// AutoML
// ---------------------------------------------------------------------------

#[test]
fn automl_forecast_roadtraffic_selects_best_alpha() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    // Need at least 25 windows for 5-fold CV
    let windows: Vec<f64> = log.traces.iter().map(|t| t.events.len() as f64).collect();
    if windows.len() < 25 {
        eprintln!("SKIP: not enough windows for automl forecast CV");
        return;
    }

    let result = discover_automl_forecast_internal(&windows);

    assert!(result.best_alpha > 0.0 && result.best_alpha < 1.0,
        "best_alpha must be in (0,1), got {}", result.best_alpha);
    assert!(result.min_avg_rmse >= 0.0,
        "min_avg_rmse must be non-negative, got {}", result.min_avg_rmse);
}

#[test]
fn automl_classify_roadtraffic_selects_best_k() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, labels) = extract_features(&log, "concept:name");

    assert!(!features.is_empty(), "extract_features must return non-empty features");

    let result = discover_automl_classify_internal(&features, &labels);

    assert!(result.best_k >= 1,
        "best_k must be at least 1, got {}", result.best_k);
    assert!(result.max_avg_accuracy >= 0.0 && result.max_avg_accuracy <= 1.0,
        "max_avg_accuracy must be in [0,1], got {}", result.max_avg_accuracy);
}

// ---------------------------------------------------------------------------
// knn_sweep_cv
// ---------------------------------------------------------------------------

#[test]
fn knn_sweep_cv_roadtraffic_returns_non_degenerate_accuracy() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, labels) = extract_features(&log, "concept:name");

    if features.len() < 5 {
        eprintln!("SKIP: not enough traces for knn_sweep_cv");
        return;
    }

    // Returns accuracy per k value for k=0..=max_k; sweep with 5 folds, max_k=5
    let accuracies = knn_sweep_cv(&features, &labels, 5, 5);

    assert!(!accuracies.is_empty(), "knn_sweep_cv must return non-empty accuracy vector");
    for (k, &acc) in accuracies.iter().enumerate() {
        assert!(acc >= 0.0 && acc <= 1.0,
            "knn_sweep_cv accuracy at k={} must be in [0,1], got {}", k, acc);
    }
}

#[test]
fn extract_features_roadtraffic_produces_correct_count() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (features, labels) = extract_features(&log, "concept:name");

    assert_eq!(features.len(), log.traces.len(),
        "extract_features must produce one feature vector per trace");
    assert_eq!(labels.len(), log.traces.len(),
        "extract_features must produce one label per trace");

    // Each feature vector has 2 components: [trace_length, unique_activities]
    for (i, f) in features.iter().enumerate() {
        assert!(f[0] > 0.0,
            "Trace {} has feature[0]=trace_length={}, must be > 0", i, f[0]);
        assert!(f[1] > 0.0,
            "Trace {} has feature[1]=unique_activities={}, must be > 0", i, f[1]);
    }
}
