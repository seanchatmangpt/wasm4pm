//! Conformance Real-Data Tests
//!
//! Exercises alignment-based fitness (P alignment_fitness feature) and
//! ET-conformance precision (align_etconformance feature) against real XES data.
//! Also exercises token-replay conformance (always-on) on real data.
//!
//! Coverage:
//!   - token_replay_pure: token replay fitness on real log + discovered Petri net
//!   - compute_alignment_fitness: alignment fitness on running-example
//!   - compute_align_etconformance_precision: ET precision on running-example

use std::collections::HashMap;
use std::fs;
use wasm4pm::conformance::token_replay_pure;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

// alignment_fitness and align_etconformance are behind feature gates
#[cfg(feature = "alignment_fitness")]
use wasm4pm::alignment_fitness::{compute_alignment_fitness, AlignmentFitnessConfig};

#[cfg(feature = "align_etconformance")]
use wasm4pm::align_etconformance::{
    compute_align_etconformance_precision, AlignETConformanceConfig,
};

#[cfg(any(
    feature = "alignment_fitness",
    feature = "align_etconformance",
    feature = "discovery_advanced"
))]
use wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log;

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
                        "Conformance tests: loaded {} traces from {}",
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
// Token replay (always available — no feature gate)
// ---------------------------------------------------------------------------

#[test]
fn token_replay_running_example_ilp_net_has_high_fitness() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");

    // Discover ILP Petri net from the log (requires discovery_advanced)
    #[cfg(feature = "discovery_advanced")]
    {
        let (petri_net, _initial_fitness, _precision) =
            discover_ilp_petri_net_from_log(&log, "concept:name");

        let report = token_replay_pure(&log, &petri_net, "concept:name");

        // ILP net discovered from the same log should have near-perfect fitness
        assert!(
            report.avg_fitness >= 0.80,
            "Token replay fitness on running-example ILP net must be >= 0.80, got {:.3}",
            report.avg_fitness
        );
        assert!(
            report.avg_fitness <= 1.0,
            "Fitness must be <= 1.0, got {:.3}",
            report.avg_fitness
        );
    }

    #[cfg(not(feature = "discovery_advanced"))]
    eprintln!("SKIP: discovery_advanced feature not enabled");
}

#[test]
fn token_replay_roadtraffic_ilp_net_fitness_is_non_degenerate() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    #[cfg(feature = "discovery_advanced")]
    {
        let (petri_net, _initial_fitness, _precision) =
            discover_ilp_petri_net_from_log(&log, "concept:name");

        let report = token_replay_pure(&log, &petri_net, "concept:name");

        // Real-world log: fitness should be positive and bounded
        assert!(
            report.avg_fitness > 0.0,
            "Token replay fitness must be > 0 on roadtraffic, got {:.3}",
            report.avg_fitness
        );
        assert!(
            report.avg_fitness <= 1.0,
            "Token replay fitness must be <= 1.0, got {:.3}",
            report.avg_fitness
        );

        eprintln!(
            "roadtraffic token replay fitness: {:.3}",
            report.avg_fitness
        );
    }

    #[cfg(not(feature = "discovery_advanced"))]
    eprintln!("SKIP: discovery_advanced feature not enabled");
}

// ---------------------------------------------------------------------------
// Alignment fitness (feature = "alignment_fitness")
// ---------------------------------------------------------------------------

#[test]
#[cfg(feature = "alignment_fitness")]
fn alignment_fitness_running_example_self_conformance() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");

    #[cfg(feature = "discovery_advanced")]
    {
        let (petri_net, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
        let config = AlignmentFitnessConfig::default();

        let result = compute_alignment_fitness(&log, &petri_net, &config);
        assert!(
            result.is_ok(),
            "Alignment fitness on running-example must succeed: {:?}",
            result.err()
        );

        let report = result.unwrap();
        assert!(
            report.fitness >= 0.0 && report.fitness <= 1.0,
            "Alignment fitness must be in [0,1], got {:.3}",
            report.fitness
        );
        assert_eq!(
            report.total_traces,
            log.traces.len(),
            "total_traces in report must equal log size"
        );
        assert!(
            report.aligned_traces <= report.total_traces,
            "aligned_traces must not exceed total_traces"
        );

        eprintln!("running-example alignment fitness: {:.3}", report.fitness);
    }

    #[cfg(not(feature = "discovery_advanced"))]
    eprintln!("SKIP: discovery_advanced feature not enabled");
}

#[test]
#[cfg(feature = "alignment_fitness")]
fn alignment_fitness_roadtraffic_is_non_degenerate() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    #[cfg(feature = "discovery_advanced")]
    {
        let (petri_net, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
        let config = AlignmentFitnessConfig::default();

        let result = compute_alignment_fitness(&log, &petri_net, &config);
        assert!(
            result.is_ok(),
            "Alignment fitness on roadtraffic must succeed: {:?}",
            result.err()
        );

        let report = result.unwrap();
        assert!(
            report.fitness > 0.0,
            "roadtraffic alignment fitness must be > 0, got {:.3}",
            report.fitness
        );

        eprintln!("roadtraffic alignment fitness: {:.3}", report.fitness);
    }

    #[cfg(not(feature = "discovery_advanced"))]
    eprintln!("SKIP: discovery_advanced feature not enabled");
}

// ---------------------------------------------------------------------------
// ET conformance precision (feature = "align_etconformance")
// ---------------------------------------------------------------------------

#[test]
#[cfg(feature = "align_etconformance")]
fn et_conformance_running_example_precision_non_degenerate() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");

    #[cfg(feature = "discovery_advanced")]
    {
        let (petri_net, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
        let config = AlignETConformanceConfig::default();

        let result = compute_align_etconformance_precision(&log, &petri_net, &config);
        assert!(
            result.is_ok(),
            "ET conformance on running-example must succeed: {:?}",
            result.err()
        );

        let report = result.unwrap();
        assert!(
            report.precision >= 0.0 && report.precision <= 1.0,
            "ET precision must be in [0,1], got {:.3}",
            report.precision
        );

        eprintln!(
            "running-example ET conformance precision: {:.3}",
            report.precision
        );
    }

    #[cfg(not(feature = "discovery_advanced"))]
    eprintln!("SKIP: discovery_advanced feature not enabled");
}

#[test]
#[cfg(feature = "align_etconformance")]
fn et_conformance_roadtraffic_precision_non_degenerate() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    #[cfg(feature = "discovery_advanced")]
    {
        let (petri_net, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");
        let config = AlignETConformanceConfig::default();

        let result = compute_align_etconformance_precision(&log, &petri_net, &config);
        assert!(
            result.is_ok(),
            "ET conformance on roadtraffic must succeed: {:?}",
            result.err()
        );

        let report = result.unwrap();
        assert!(
            report.precision > 0.0,
            "roadtraffic ET precision must be > 0, got {:.3}",
            report.precision
        );

        eprintln!(
            "roadtraffic ET conformance precision: {:.3}",
            report.precision
        );
    }

    #[cfg(not(feature = "discovery_advanced"))]
    eprintln!("SKIP: discovery_advanced feature not enabled");
}
