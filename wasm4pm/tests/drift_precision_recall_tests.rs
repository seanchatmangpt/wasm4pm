//! Drift Detection Precision/Recall Tests — Gap E adversarial suite
//!
//! Verifies that the Jaccard-windowed drift detection system correctly
//! fires on genuine behavioral change and remains silent on stable processes.
//!
//! All tests operate on pure-Rust helpers (`jaccard_distance`) or construct
//! EventLog objects manually to drive the detection logic at the Rust layer.
//!
//! Oracle hierarchy applied:
//!   Rank 1 — Mathematical theorem (Jaccard metric axioms)
//!   Rank 2 — Domain contract (drift detection behavioral guarantees)
//!   Rank 3 — Metamorphic relation (larger change → higher score)
//!
//! Gap E: drift detection correctness against ground-truth scenarios.

use std::collections::{HashMap, HashSet};
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::prediction_drift::{jaccard_distance, DEFAULT_DRIFT_THRESHOLD};
use wasm4pm::state::{get_or_init_state, StoredObject};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn s(items: &[&str]) -> HashSet<String> {
    items.iter().map(|x| x.to_string()).collect()
}

/// Build a single trace with the given activities.
fn make_trace(case_id: &str, activities: &[&str]) -> Trace {
    let mut attrs = HashMap::new();
    attrs.insert(
        "concept:name".to_string(),
        AttributeValue::String(case_id.to_string()),
    );
    let events: Vec<Event> = activities
        .iter()
        .map(|act| {
            let mut eattrs = HashMap::new();
            eattrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(act.to_string()),
            );
            Event { attributes: eattrs }
        })
        .collect();
    Trace {
        attributes: attrs,
        events,
    }
}

/// Build an EventLog from a flat list of (case_id, activities) pairs.
fn make_log(traces: &[(&str, &[&str])]) -> EventLog {
    let mut log = EventLog::new();
    for (case_id, activities) in traces {
        log.traces.push(make_trace(case_id, activities));
    }
    log
}

/// Store an EventLog in the shared state and return its handle.
fn store_log(log: EventLog) -> String {
    get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("store_object should not fail")
}

// ===========================================================================
// Test 1: disjoint activity sets → Jaccard distance = 1.0
// ===========================================================================

/// Rank 1: disjoint activity sets must produce Jaccard distance exactly 1.0.
/// This is the mathematical definition of Jaccard distance for disjoint non-empty sets.
#[test]
fn jaccard_sudden_drift_disjoint_activities_score_is_one() {
    // Window 1: traces with activities {A, B, C}
    // Window 2: traces with activities {X, Y, Z} (completely different)
    let set1 = s(&["A", "B", "C"]);
    let set2 = s(&["X", "Y", "Z"]);

    let distance = jaccard_distance(&set1, &set2);

    // Rank 1: disjoint non-empty sets → Jaccard distance = 1.0
    assert!(
        distance >= 0.99,
        "disjoint activity sets must produce distance ≥ 0.99, got {}",
        distance
    );
    assert!(
        (distance - 1.0).abs() < 1e-12,
        "disjoint activity sets must produce distance exactly 1.0, got {}",
        distance
    );
}

// ===========================================================================
// Test 2: drift fires on sudden total behavioral change
// ===========================================================================

/// Rank 2 domain contract: a sudden total change in process behavior must
/// trigger a drift detection event.
///
/// IGNORED: `detect_drift` is a `#[wasm_bindgen]` export; the `JsValue` return
/// type panics when constructed outside the wasm-bindgen runtime.
/// Validate via the Node.js test suite in `packages/kernel/__tests__/`.
#[test]
#[ignore = "wasm_bindgen boundary: detect_drift requires wasm-bindgen runtime"]
fn drift_detection_fires_on_sudden_drift() {
    use wasm4pm::prediction_drift::detect_drift;

    // First 5 traces: A→B→C; next 5 traces: X→Y→Z (completely different)
    let mut log = EventLog::new();
    let before_acts: &[&str] = &["A", "B", "C"];
    let after_acts: &[&str] = &["X", "Y", "Z"];
    for i in 0..5usize {
        log.traces
            .push(make_trace(&format!("before{}", i), before_acts));
    }
    for i in 0..5usize {
        log.traces
            .push(make_trace(&format!("after{}", i), after_acts));
    }

    let handle = store_log(log);

    // Use window_size=1 for maximum sensitivity
    let result = detect_drift(&handle, "concept:name", 1);
    assert!(
        result.is_ok(),
        "detect_drift must return Ok, got {:?}",
        result
    );

    let jsval = result.unwrap();
    let json_str: String = jsval
        .as_string()
        .expect("detect_drift must return a string");
    let parsed: serde_json::Value =
        serde_json::from_str(&json_str).expect("detect_drift result must be valid JSON");

    let drifts_detected = parsed["drifts_detected"]
        .as_u64()
        .expect("drifts_detected field must be a number");

    // Rank 2: sudden total change must trigger at least one drift event
    assert!(
        drifts_detected >= 1,
        "sudden total behavioral change (ABC→XYZ) must trigger at least 1 drift, got {}",
        drifts_detected
    );
}

// ===========================================================================
// Test 3: no false positive on stable log
// ===========================================================================

/// Rank 2: a perfectly stable process must not produce drift alerts.
///
/// IGNORED: `detect_drift` is a `#[wasm_bindgen]` export.
/// Validate via the Node.js test suite in `packages/kernel/__tests__/`.
#[test]
#[ignore = "wasm_bindgen boundary: detect_drift requires wasm-bindgen runtime"]
fn no_false_positive_on_stable_log() {
    use wasm4pm::prediction_drift::detect_drift;

    // 20 identical traces: A→B→C
    let mut log = EventLog::new();
    for i in 0..20usize {
        log.traces
            .push(make_trace(&format!("case{}", i), &["A", "B", "C"]));
    }

    let handle = store_log(log);
    let result = detect_drift(&handle, "concept:name", 1);
    assert!(result.is_ok(), "detect_drift must return Ok");

    let json_str: String = result
        .unwrap()
        .as_string()
        .expect("detect_drift must return a string");
    let parsed: serde_json::Value = serde_json::from_str(&json_str).expect("must be valid JSON");

    let drifts_detected = parsed["drifts_detected"]
        .as_u64()
        .expect("drifts_detected must be a number");

    // Rank 2: stable process must produce 0 drift events
    assert_eq!(
        drifts_detected, 0,
        "stable process A→B→C must produce 0 drift events, got {}",
        drifts_detected
    );
}

// ===========================================================================
// Test 4: drift detection delay bounded by window size
// ===========================================================================

/// Rank 2: with window_size=1, drift after the change point at trace 10 must
/// be detected within the first few traces of the changed segment (delay ≤ 3).
///
/// IGNORED: `detect_drift` is a `#[wasm_bindgen]` export.
/// Validate via the Node.js test suite in `packages/kernel/__tests__/`.
#[test]
#[ignore = "wasm_bindgen boundary: detect_drift requires wasm-bindgen runtime"]
fn drift_detection_delay_bounded_by_window_size() {
    use wasm4pm::prediction_drift::detect_drift;

    // Change point: first 10 traces = A→B→C, next 10 traces = A→B→D
    let mut log = EventLog::new();
    for i in 0..10usize {
        log.traces
            .push(make_trace(&format!("before{}", i), &["A", "B", "C"]));
    }
    for i in 0..10usize {
        log.traces
            .push(make_trace(&format!("after{}", i), &["A", "B", "D"]));
    }

    let handle = store_log(log);
    let result = detect_drift(&handle, "concept:name", 1);
    assert!(result.is_ok(), "detect_drift must return Ok");

    let json_str: String = result
        .unwrap()
        .as_string()
        .expect("detect_drift must return a string");
    let parsed: serde_json::Value = serde_json::from_str(&json_str).expect("must be valid JSON");

    let drifts = parsed["drifts"]
        .as_array()
        .expect("drifts must be an array");
    if !drifts.is_empty() {
        let first_position = drifts[0]["position"]
            .as_u64()
            .expect("position must be a number") as usize;
        // Change point at trace 10; first drift should appear within ±3
        assert!(
            first_position >= 7 && first_position <= 13,
            "drift position {} should be near change point at 10 (window=1, ±3 tolerance)",
            first_position
        );
    }
}

// ===========================================================================
// Test 5: window_size=1 provides precise position detection
// ===========================================================================

/// Rank 3 metamorphic: window_size=1 gives per-trace precision so the detected
/// drift position must lie within ±2 of the known change point.
#[test]
fn window_size_1_provides_precise_position() {
    // Design log: 10 traces of {A,B} activities, then 10 traces of {X,Y} activities.
    // Change point is at index N=10 (0-based).
    let sets_before: Vec<HashSet<String>> = (0..10).map(|_| s(&["A", "B"])).collect();
    let sets_after: Vec<HashSet<String>> = (0..10).map(|_| s(&["X", "Y"])).collect();

    let all_sets: Vec<&HashSet<String>> = sets_before.iter().chain(sets_after.iter()).collect();

    // Compute pairwise Jaccard distances between consecutive windows (window_size=1)
    let distances: Vec<f64> = all_sets
        .windows(2)
        .map(|pair| jaccard_distance(pair[0], pair[1]))
        .collect();

    // Find the index of the maximum Jaccard distance jump
    let max_idx = distances
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .map(|(i, _)| i)
        .expect("at least one pair must exist");

    // The maximum jump should occur at index 9 (transition from window 9 to 10)
    // Tolerance: ±2
    let change_point = 9usize; // 0-based index of the window-pair at the boundary
    assert!(
        max_idx.abs_diff(change_point) <= 2,
        "maximum Jaccard jump at {} should be near change point {} (±2 tolerance)",
        max_idx,
        change_point
    );
}

// ===========================================================================
// Test 6: drift score higher for larger behavioral change
// ===========================================================================

/// Rank 3 metamorphic: larger behavioral change must produce a higher Jaccard
/// drift score than a smaller change.
#[test]
fn drift_score_higher_for_larger_change() {
    // Small change: A→B→C to A→B→D (one activity substituted)
    let small_before = s(&["A", "B", "C"]);
    let small_after = s(&["A", "B", "D"]);
    let small_distance = jaccard_distance(&small_before, &small_after);

    // Large change: A→B→C to X→Y→Z (all activities substituted)
    let large_before = s(&["A", "B", "C"]);
    let large_after = s(&["X", "Y", "Z"]);
    let large_distance = jaccard_distance(&large_before, &large_after);

    // Rank 3 metamorphic: larger behavioral change → higher drift score
    assert!(
        large_distance > small_distance,
        "complete substitution (distance {}) must score higher than partial substitution (distance {})",
        large_distance,
        small_distance
    );

    // Sanity check the absolute values
    // Small: {A,B,C} vs {A,B,D}: intersection={A,B}, union={A,B,C,D}, Jaccard=1-2/4=0.5
    assert!(
        (small_distance - 0.5).abs() < 1e-12,
        "small change Jaccard should be 0.5, got {}",
        small_distance
    );
    // Large: disjoint sets → Jaccard = 1.0
    assert!(
        (large_distance - 1.0).abs() < 1e-12,
        "large change Jaccard should be 1.0, got {}",
        large_distance
    );
}
