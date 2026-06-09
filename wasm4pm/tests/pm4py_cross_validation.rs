//! pm4py Cross-Validation — wasm4pm vs pm4py oracle on real XES data
//!
//! Oracle source: pm4py 2.x Python library run on the same XES files.
//! All expected values were produced by running:
//!   python3 -c "import pm4py; log = pm4py.read_xes('...'); ..."
//!
//! Oracle rank: Rank 1 (mathematical theorem from pm4py reference implementation)
//!
//! Invariant: for any XES file, wasm4pm DFG edge set and frequencies must
//! exactly match pm4py output.  Heuristic miner with same dependency threshold
//! must keep the same edge set.

use std::collections::{HashMap, HashSet};
use std::fs;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

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
                    ev.attributes.insert(k, AttributeValue::String(v));
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
                    eprintln!("Loaded {} from {}", log.traces.len(), path);
                    return Some(log);
                }
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// pm4py oracle: running-example DFG
//
// Source: pm4py.discover_dfg(pm4py.read_xes("running-example.xes"))
// Verified: 2026-05-15
// ---------------------------------------------------------------------------

const RUNNING_EXAMPLE_PATHS: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/running-example.xes",
    "tests/fixtures/running-example.xes",
];

/// (from, to, frequency) — sorted, matches pm4py output exactly.
const RUNNING_EXAMPLE_DFG_ORACLE: &[(&str, &str, usize)] = &[
    ("check ticket", "decide", 6),
    ("check ticket", "examine casually", 2),
    ("check ticket", "examine thoroughly", 1),
    ("decide", "pay compensation", 3),
    ("decide", "reinitiate request", 3),
    ("decide", "reject request", 3),
    ("examine casually", "check ticket", 4),
    ("examine casually", "decide", 2),
    ("examine thoroughly", "check ticket", 2),
    ("examine thoroughly", "decide", 1),
    ("register request", "check ticket", 2),
    ("register request", "examine casually", 3),
    ("register request", "examine thoroughly", 1),
    ("reinitiate request", "check ticket", 1),
    ("reinitiate request", "examine casually", 1),
    ("reinitiate request", "examine thoroughly", 1),
];

/// Edges kept by heuristic miner with dependency_threshold=0.2.
/// Formula: dep(a,b) = (|a>b| - |b>a|) / (|a>b| + |b>a| + 1) >= 0.2
/// Filtered out: check_ticket→examine_casually (dep=-0.286),
///               check_ticket→examine_thoroughly (dep=-0.250)
const RUNNING_EXAMPLE_HEURISTIC_02_ORACLE: &[(&str, &str)] = &[
    ("check ticket", "decide"),
    ("decide", "pay compensation"),
    ("decide", "reinitiate request"),
    ("decide", "reject request"),
    ("examine casually", "check ticket"),
    ("examine casually", "decide"),
    ("examine thoroughly", "check ticket"),
    ("examine thoroughly", "decide"),
    ("register request", "check ticket"),
    ("register request", "examine casually"),
    ("register request", "examine thoroughly"),
    ("reinitiate request", "check ticket"),
    ("reinitiate request", "examine casually"),
    ("reinitiate request", "examine thoroughly"),
];

// ---------------------------------------------------------------------------
// pm4py oracle: roadtraffic100traces DFG
//
// Source: pm4py.discover_dfg(pm4py.read_xes("roadtraffic100traces.xes"))
// Verified: 2026-05-15
// ---------------------------------------------------------------------------

const ROADTRAFFIC_PATHS: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
    "tests/fixtures/roadtraffic100traces.xes",
];

const ROADTRAFFIC_DFG_ORACLE: &[(&str, &str, usize)] = &[
    ("Add penalty", "Payment", 20),
    ("Add penalty", "Send Appeal to Prefecture", 1),
    ("Add penalty", "Send for Credit Collection", 36),
    ("Create Fine", "Payment", 23),
    ("Create Fine", "Send Fine", 77),
    ("Insert Date Appeal to Prefecture", "Add penalty", 1),
    ("Insert Fine Notification", "Add penalty", 52),
    (
        "Insert Fine Notification",
        "Insert Date Appeal to Prefecture",
        1,
    ),
    ("Insert Fine Notification", "Payment", 4),
    ("Notify Result Appeal to Offender", "Payment", 1),
    ("Payment", "Add penalty", 4),
    ("Payment", "Insert Fine Notification", 1),
    ("Payment", "Payment", 5),
    ("Payment", "Send Fine", 1),
    (
        "Receive Result Appeal from Prefecture",
        "Notify Result Appeal to Offender",
        1,
    ),
    (
        "Send Appeal to Prefecture",
        "Receive Result Appeal from Prefecture",
        1,
    ),
    ("Send Fine", "Insert Fine Notification", 56),
    ("Send Fine", "Payment", 5),
];

const ROADTRAFFIC_START_ORACLE: &[(&str, usize)] = &[("Create Fine", 100)];
const ROADTRAFFIC_END_ORACLE: &[(&str, usize)] = &[
    ("Payment", 47),
    ("Send Fine", 17),
    ("Send for Credit Collection", 36),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn dfg_to_edge_freq_map(dfg: &wasm4pm::models::DFG) -> HashMap<(String, String), usize> {
    dfg.edges
        .iter()
        .map(|e| ((e.from.clone(), e.to.clone()), e.frequency))
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn dfg_running_example_exact_edge_set_matches_pm4py() {
    let log = match load_xes(RUNNING_EXAMPLE_PATHS) {
        Some(l) => l,
        None => {
            eprintln!("SKIP: running-example.xes not found");
            return;
        }
    };

    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let actual = dfg_to_edge_freq_map(&dfg);

    assert_eq!(
        actual.len(),
        RUNNING_EXAMPLE_DFG_ORACLE.len(),
        "Edge count mismatch: wasm4pm={} pm4py={}",
        actual.len(),
        RUNNING_EXAMPLE_DFG_ORACLE.len()
    );

    for &(from, to, expected_freq) in RUNNING_EXAMPLE_DFG_ORACLE {
        let key = (from.to_string(), to.to_string());
        let actual_freq = actual.get(&key).copied().unwrap_or(0);
        assert_eq!(
            actual_freq, expected_freq,
            "Edge {}→{}: wasm4pm={} pm4py={}",
            from, to, actual_freq, expected_freq
        );
    }
}

#[test]
fn dfg_running_example_start_end_activities_match_pm4py() {
    let log = match load_xes(RUNNING_EXAMPLE_PATHS) {
        Some(l) => l,
        None => {
            eprintln!("SKIP: running-example.xes not found");
            return;
        }
    };

    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    // Start: {register request: 6}
    assert_eq!(dfg.start_activities.len(), 1, "Expected 1 start activity");
    assert_eq!(
        dfg.start_activities
            .get("register request")
            .copied()
            .unwrap_or(0),
        6,
        "Start activity 'register request' must have frequency 6"
    );

    // End: {pay compensation: 3, reject request: 3}
    assert_eq!(dfg.end_activities.len(), 2, "Expected 2 end activities");
    assert_eq!(
        dfg.end_activities
            .get("pay compensation")
            .copied()
            .unwrap_or(0),
        3
    );
    assert_eq!(
        dfg.end_activities
            .get("reject request")
            .copied()
            .unwrap_or(0),
        3
    );
}

#[test]
fn heuristic_miner_running_example_edge_set_matches_pm4py() {
    let log = match load_xes(RUNNING_EXAMPLE_PATHS) {
        Some(l) => l,
        None => {
            eprintln!("SKIP: running-example.xes not found");
            return;
        }
    };

    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.2);
    let actual_edges: HashSet<(String, String)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    let oracle_edges: HashSet<(String, String)> = RUNNING_EXAMPLE_HEURISTIC_02_ORACLE
        .iter()
        .map(|&(a, b)| (a.to_string(), b.to_string()))
        .collect();

    let missing: Vec<_> = oracle_edges.difference(&actual_edges).collect();
    let extra: Vec<_> = actual_edges.difference(&oracle_edges).collect();

    assert!(
        missing.is_empty() && extra.is_empty(),
        "Heuristic miner edge mismatch vs pm4py oracle.\n  Missing: {:?}\n  Extra: {:?}",
        missing,
        extra
    );
}

#[test]
fn dfg_roadtraffic_exact_edge_set_matches_pm4py() {
    let log = match load_xes(ROADTRAFFIC_PATHS) {
        Some(l) => l,
        None => {
            eprintln!("SKIP: roadtraffic100traces.xes not found");
            return;
        }
    };

    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let actual = dfg_to_edge_freq_map(&dfg);

    assert_eq!(
        actual.len(),
        ROADTRAFFIC_DFG_ORACLE.len(),
        "roadtraffic edge count mismatch: wasm4pm={} pm4py={}",
        actual.len(),
        ROADTRAFFIC_DFG_ORACLE.len()
    );

    for &(from, to, expected_freq) in ROADTRAFFIC_DFG_ORACLE {
        let key = (from.to_string(), to.to_string());
        let actual_freq = actual.get(&key).copied().unwrap_or(0);
        assert_eq!(
            actual_freq, expected_freq,
            "roadtraffic edge {}→{}: wasm4pm={} pm4py={}",
            from, to, actual_freq, expected_freq
        );
    }
}

#[test]
fn dfg_roadtraffic_start_end_activities_match_pm4py() {
    let log = match load_xes(ROADTRAFFIC_PATHS) {
        Some(l) => l,
        None => {
            eprintln!("SKIP: roadtraffic100traces.xes not found");
            return;
        }
    };

    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    for &(act, freq) in ROADTRAFFIC_START_ORACLE {
        assert_eq!(
            dfg.start_activities.get(act).copied().unwrap_or(0),
            freq,
            "Start activity '{}': wasm4pm={} pm4py={}",
            act,
            dfg.start_activities.get(act).copied().unwrap_or(0),
            freq
        );
    }

    for &(act, freq) in ROADTRAFFIC_END_ORACLE {
        assert_eq!(
            dfg.end_activities.get(act).copied().unwrap_or(0),
            freq,
            "End activity '{}': wasm4pm={} pm4py={}",
            act,
            dfg.end_activities.get(act).copied().unwrap_or(0),
            freq
        );
    }
}

fn admitted_log(
    log: wasm4pm::models::EventLog,
) -> wasm4pm_compat::evidence::Evidence<
    wasm4pm::models::EventLog,
    wasm4pm_compat::state::Admitted,
    (),
> {
    wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence()
}
