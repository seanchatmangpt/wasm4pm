//! W4PM-LEAN-GALL-036: native half of the native-vs-wasm32 cross-target
//! execution-equivalence harness.
//!
//! This test loads the SAME fixed fixture log
//! (`wasm-equivalence-tests/fixture_log.json`) used by the Node.js/wasm32
//! half (`wasm-equivalence-tests/compare.mjs`), runs the SAME pure-Rust
//! algorithm entry points natively, and writes its output to
//! `wasm-equivalence-tests/native_output.json` for the Node script to diff
//! against the wasm32-compiled run.
//!
//! Algorithms under test:
//! 1. `discover_dfg_from_log` (DFG discovery) — the pure-Rust variant with
//!    no wasm-bindgen boundary, called by `discover_dfg` on the wasm side.
//! 2. `EventLog::event_count` / `EventLog::case_count` — the same inherent
//!    methods called by `analyze_event_statistics` on the wasm side.
//!
//! Normalization note: the native side serializes `DFG` directly via
//! `serde_json::to_value`. The wasm side calls `discover_dfg`, which
//! internally calls `to_js_str(&dfg)` (see src/discovery.rs:145) — a JSON
//! *string*, not a `to_js`/`JsValue` object graph — specifically to sidestep
//! the documented `to_js(&json!({...}))` -> `{}` wasm32 divergence. Both
//! sides therefore produce the identical `DFG` JSON shape; the only
//! normalization the comparator performs is `JSON.parse()` of the wasm
//! side's returned string, which is not a shape change, just undoing the
//! string envelope required to cross the wasm-bindgen boundary.

use serde_json::json;
use std::fs;
use std::path::Path;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

fn admitted_log(
    log: EventLog,
) -> wasm4pm_compat::evidence::Evidence<EventLog, wasm4pm_compat::state::Admitted, ()> {
    wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence()
}

fn fixture_path() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("wasm-equivalence-tests/fixture_log.json")
}

fn output_path() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("wasm-equivalence-tests/native_output.json")
}

#[test]
fn native_dfg_and_stats_output_for_cross_target_diff() {
    let fixture_raw = fs::read_to_string(fixture_path()).expect("fixture_log.json must exist");
    let log: EventLog =
        serde_json::from_str(&fixture_raw).expect("fixture must parse as EventLog");

    // Sanity: fixture is what we think it is (3 cases, 9 events total).
    assert_eq!(log.case_count(), 3);
    assert_eq!(log.event_count(), 9);

    // Algorithm 1: DFG discovery, same pure-Rust entry point the wasm
    // binding (`discover_dfg`) calls internally.
    let admitted = admitted_log(log.clone());
    let dfg = discover_dfg_from_log(&admitted, "concept:name");
    let dfg_json = serde_json::to_value(&dfg).expect("DFG must serialize");

    // Algorithm 2: event statistics, same inherent methods
    // `analyze_event_statistics` calls internally.
    let total_events = log.event_count();
    let total_cases = log.case_count();
    let stats_json = json!({
        "total_events": total_events,
        "total_cases": total_cases,
        "avg_events_per_case": if total_cases > 0 {
            total_events as f64 / total_cases as f64
        } else {
            0.0
        },
    });

    let combined = json!({
        "algorithm_dfg": dfg_json,
        "algorithm_event_statistics": stats_json,
    });

    fs::write(
        output_path(),
        serde_json::to_string_pretty(&combined).expect("combined output must serialize"),
    )
    .expect("must write native_output.json");

    // Basic non-degenerate assertions so this test still means something in
    // isolation (not just an output-dumping harness).
    assert_eq!(dfg.nodes.len(), 4, "expected activities A, B, C, D");
    assert!(!dfg.edges.is_empty());
}

// Also exercise Event/Trace construction paths directly (unused import guard
// / keeps this test self-contained if the fixture format ever needs an
// in-Rust fallback construction instead of JSON).
#[allow(dead_code)]
fn build_fixture_in_rust() -> EventLog {
    let mut log = EventLog::default();
    let mut t = Trace::default();
    let mut e = Event::default();
    e.attributes.insert(
        "concept:name".to_string(),
        AttributeValue::String("A".to_string()),
    );
    t.events.push(e);
    log.traces.push(t);
    log
}
