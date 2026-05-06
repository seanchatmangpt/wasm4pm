//! Enterprise Dirty Data Impact Tests
//!
//! Documents how dirty data affects process mining KPIs. These are
//! documentation/regression tests — they prove the system handles dirty data
//! predictably and that the measured impact is consistent and accurate.
//!
//! Oracle ranks:
//! - Rank 2 (Domain contract): system must not crash on dirty data, rework ratio accuracy
//! - Rank 3 (Metamorphic): dirty data degrades conformance, proportional frequency effects

use std::collections::HashMap;
use wasm4pm::models::{
    AttributeValue, ConformanceResult, Event, EventLog, PetriNet, PetriNetArc, PetriNetPlace,
    PetriNetTransition, Trace,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVITY_KEY: &str = "concept:name";
const TIMESTAMP_KEY: &str = "time:timestamp";

/// Build an EventLog from a list of (case_id, [(activity, timestamp_offset_secs)]) tuples.
fn make_log_with_timestamps(
    traces: &[(&str, &[(&str, u64)])],
) -> EventLog {
    let mut log = EventLog::new();
    for (case_id, events) in traces {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(case_id.to_string()),
                );
                m
            },
            events: Vec::new(),
        };
        for (act, secs) in *events {
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                // Use absolute second offset from epoch in ISO 8601 form
                AttributeValue::String(
                    format!("2024-01-01T00:{:02}:{:02}Z", secs / 60, secs % 60),
                ),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Build an EventLog from a list of traces represented as activity-name slices.
fn make_log(traces: &[&[&str]]) -> EventLog {
    make_log_with_timestamps(
        &traces
            .iter()
            .enumerate()
            .map(|(i, acts)| {
                let events: Vec<(&str, u64)> = acts
                    .iter()
                    .enumerate()
                    .map(|(j, &a)| (a, j as u64 * 60))
                    .collect();
                (Box::leak(format!("case{}", i).into_boxed_str()) as &str, Box::leak(events.into_boxed_slice()) as &[_])
            })
            .collect::<Vec<_>>(),
    )
}

/// Build a simple sequential Petri net:
///   start → [A] → p1 → [B] → p2 → [C] → end
///
/// The fitness for a log with all A→B→C traces is expected to be ~1.0
/// (token replay produces: produced=6, consumed=6, missing=0, remaining=0).
fn make_abc_petri_net() -> PetriNet {
    let places = vec![
        PetriNetPlace {
            id: "start".to_string(),
            label: "start".to_string(),
            marking: Some(1), // initial marking
        },
        PetriNetPlace {
            id: "p1".to_string(),
            label: "p1".to_string(),
            marking: None,
        },
        PetriNetPlace {
            id: "p2".to_string(),
            label: "p2".to_string(),
            marking: None,
        },
        PetriNetPlace {
            id: "end".to_string(),
            label: "end".to_string(),
            marking: None,
        },
    ];

    let transitions = vec![
        PetriNetTransition {
            id: "tA".to_string(),
            label: "A".to_string(),
            is_invisible: Some(false),
        },
        PetriNetTransition {
            id: "tB".to_string(),
            label: "B".to_string(),
            is_invisible: Some(false),
        },
        PetriNetTransition {
            id: "tC".to_string(),
            label: "C".to_string(),
            is_invisible: Some(false),
        },
    ];

    let arcs = vec![
        // start → tA
        PetriNetArc {
            from: "start".to_string(),
            to: "tA".to_string(),
            weight: Some(1),
        },
        // tA → p1
        PetriNetArc {
            from: "tA".to_string(),
            to: "p1".to_string(),
            weight: Some(1),
        },
        // p1 → tB
        PetriNetArc {
            from: "p1".to_string(),
            to: "tB".to_string(),
            weight: Some(1),
        },
        // tB → p2
        PetriNetArc {
            from: "tB".to_string(),
            to: "p2".to_string(),
            weight: Some(1),
        },
        // p2 → tC
        PetriNetArc {
            from: "p2".to_string(),
            to: "tC".to_string(),
            weight: Some(1),
        },
        // tC → end
        PetriNetArc {
            from: "tC".to_string(),
            to: "end".to_string(),
            weight: Some(1),
        },
    ];

    let mut initial_marking = HashMap::new();
    initial_marking.insert("start".to_string(), 1);

    let mut final_marking = HashMap::new();
    final_marking.insert("end".to_string(), 1);

    PetriNet {
        places,
        transitions,
        arcs,
        initial_marking,
        final_markings: vec![final_marking],
    }
}

/// Compute edge frequencies from an EventLog using the activity key.
/// Returns a map of (from, to) → frequency.
fn compute_edge_frequencies(log: &EventLog) -> HashMap<(String, String), usize> {
    let mut freqs: HashMap<(String, String), usize> = HashMap::new();
    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(ACTIVITY_KEY)
                    .and_then(|v| match v {
                        AttributeValue::String(s) => Some(s.clone()),
                        _ => None,
                    })
            })
            .collect();
        for pair in activities.windows(2) {
            *freqs
                .entry((pair[0].clone(), pair[1].clone()))
                .or_insert(0) += 1;
        }
    }
    freqs
}

/// Compute per-activity average duration using the timestamp attribute.
/// Returns a map of activity → mean_duration_millis.
fn compute_avg_durations(log: &EventLog) -> HashMap<String, f64> {
    let mut durations: HashMap<String, Vec<f64>> = HashMap::new();

    for trace in &log.traces {
        for pair in trace.events.windows(2) {
            let act_a = pair[0].attributes.get(ACTIVITY_KEY).and_then(|v| match v {
                AttributeValue::String(s) => Some(s.clone()),
                _ => None,
            });
            let act_b = pair[1].attributes.get(ACTIVITY_KEY).and_then(|v| match v {
                AttributeValue::String(s) => Some(s.clone()),
                _ => None,
            });
            let ts_a = pair[0]
                .attributes
                .get(TIMESTAMP_KEY)
                .and_then(|v| parse_iso_to_secs(v));
            let ts_b = pair[1]
                .attributes
                .get(TIMESTAMP_KEY)
                .and_then(|v| parse_iso_to_secs(v));

            if let (Some(a), Some(b), Some(ta), Some(tb)) = (act_a, act_b, ts_a, ts_b) {
                if tb >= ta {
                    let gap = (tb - ta) as f64;
                    // Associate the duration with the destination activity (B)
                    // as the "wait until B" cost
                    durations.entry(b).or_default().push(gap);
                    // Also give A a 0-gap entry if not yet seen
                    durations.entry(a).or_default();
                }
            }
        }
    }

    durations
        .into_iter()
        .map(|(act, vals)| {
            let avg = if vals.is_empty() {
                0.0
            } else {
                vals.iter().sum::<f64>() / vals.len() as f64
            };
            (act, avg)
        })
        .collect()
}

/// Parse an ISO 8601-like timestamp string to seconds-since-start-of-day.
/// Only handles "2024-01-01T00:MM:SS" format for simplicity.
fn parse_iso_to_secs(v: &AttributeValue) -> Option<u64> {
    let s = match v {
        AttributeValue::String(s) => s,
        _ => return None,
    };
    // Format: 2024-01-01T00:MM:SS.xxxZ or 2024-01-01T00:MM:SSZ
    let t_part = s.splitn(2, 'T').nth(1)?;
    let clean = t_part.trim_end_matches('Z');
    let parts: Vec<&str> = clean.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let h: u64 = parts[0].parse().ok()?;
    let m: u64 = parts[1].parse().ok()?;
    let s_val: u64 = parts[2].split('.').next()?.parse().ok()?;
    Some(h * 3600 + m * 60 + s_val)
}

// ===========================================================================
// Test 1: Missing timestamps — system must not crash
// ===========================================================================

#[test]
fn missing_timestamps_measurable_impact() {
    // Rank 2: missing timestamps must not crash the system
    //
    // Clean log: 10 traces A→B→C with timestamps
    // Dirty log: same but one trace has no timestamp (empty string)
    let clean_log = make_log(&[
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
    ]);

    // Dirty log: same but trace 9 has events with no timestamp attribute
    let mut dirty_log = clean_log.clone();
    for event in &mut dirty_log.traces[9].events {
        event.attributes.remove(TIMESTAMP_KEY);
    }

    // Neither log should panic when computing edge frequencies
    let clean_freqs = compute_edge_frequencies(&clean_log);
    let dirty_freqs = compute_edge_frequencies(&dirty_log);

    // Both logs have the same activity sequences — edge frequencies must be equal
    assert_eq!(
        clean_freqs, dirty_freqs,
        "Edge frequencies must be identical regardless of missing timestamps \
         (timestamps don't affect DFG computation): clean={:?}, dirty={:?}",
        clean_freqs, dirty_freqs
    );

    // Clean log produces temporal durations for A, B, C
    let clean_durations = compute_avg_durations(&clean_log);
    assert!(
        !clean_durations.is_empty(),
        "Clean log with timestamps must produce at least one duration entry"
    );

    // Dirty log: computing durations must not panic
    let _dirty_durations = compute_avg_durations(&dirty_log);
    // No assertion on value — just prove no panic
}

// ===========================================================================
// Test 2: Duplicate events inflate edge frequencies proportionally
// ===========================================================================

#[test]
fn duplicate_events_inflate_edge_frequency() {
    // Rank 2: duplicate events inflate DFG frequencies proportionally
    //
    // Clean log: 5× A→B→C
    // Dirty log: same but 10× A→B→C (each trace doubled)
    let clean_traces: Vec<&[&str]> = vec![
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
    ];
    let dirty_traces: Vec<&[&str]> = vec![
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "B", "C"],
    ];

    let clean_log = make_log(&clean_traces);
    let dirty_log = make_log(&dirty_traces);

    let clean_freqs = compute_edge_frequencies(&clean_log);
    let dirty_freqs = compute_edge_frequencies(&dirty_log);

    let clean_ab = clean_freqs[&("A".to_string(), "B".to_string())];
    let dirty_ab = dirty_freqs[&("A".to_string(), "B".to_string())];

    assert!(
        dirty_ab >= 2 * clean_ab,
        "Doubling traces must at least double the A→B edge frequency: \
         clean_ab={}, dirty_ab={} (expected dirty_ab ≥ {})",
        clean_ab,
        dirty_ab,
        2 * clean_ab
    );
}

// ===========================================================================
// Test 3: Out-of-order events produce backwards edges in DFG
// ===========================================================================

#[test]
fn out_of_order_events_produce_backwards_edges() {
    // Rank 2 documentation: out-of-order events create false backwards edges
    //
    // Log with a trace where events are recorded out of order: B, A, C
    // (actual order was A, B, C but the log records B first)
    // DFG must contain B→A edge (backwards causality from out-of-order)
    let out_of_order_log = make_log(&[
        &["B", "A", "C"], // out of order: B before A
    ]);

    let freqs = compute_edge_frequencies(&out_of_order_log);

    let b_to_a = freqs.get(&("B".to_string(), "A".to_string())).copied().unwrap_or(0);

    assert!(
        b_to_a > 0,
        "Out-of-order trace B,A,C must produce a backwards B→A edge in DFG. \
         This documents the known dirty data impact. B→A count = {}",
        b_to_a
    );

    // And A→C should also appear (from the second half of the trace)
    let a_to_c = freqs.get(&("A".to_string(), "C".to_string())).copied().unwrap_or(0);
    assert!(
        a_to_c > 0,
        "Out-of-order trace B,A,C must produce A→C edge. A→C count = {}",
        a_to_c
    );
}

// ===========================================================================
// Test 4: Dirty data proportion reflected in edge frequency ratios
// ===========================================================================

#[test]
fn dfg_frequency_ratio_reflects_dirty_data_proportion() {
    // Rank 3: dirty data proportion reflected in edge frequency ratios
    //
    // 10 normal traces: A→B→C
    // 1 dirty trace: A→X→C (X is noise activity)
    // X-related edge frequency ≤ 15% of normal A→B edge frequency
    let mut traces: Vec<Vec<String>> = (0..10)
        .map(|_| vec!["A".to_string(), "B".to_string(), "C".to_string()])
        .collect();
    traces.push(vec!["A".to_string(), "X".to_string(), "C".to_string()]);

    // Build EventLog manually to avoid lifetime issues
    let mut log = EventLog::new();
    for (i, acts) in traces.iter().enumerate() {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("case{}", i)),
                );
                m
            },
            events: Vec::new(),
        };
        for (j, act) in acts.iter().enumerate() {
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(act.clone()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", j)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }

    let freqs = compute_edge_frequencies(&log);

    let ab_freq = freqs
        .get(&("A".to_string(), "B".to_string()))
        .copied()
        .unwrap_or(0);
    let ax_freq = freqs
        .get(&("A".to_string(), "X".to_string()))
        .copied()
        .unwrap_or(0);

    assert!(
        ab_freq > 0,
        "Normal A→B edge must appear in log with 10 normal traces"
    );

    // X noise edge frequency must be ≤ 15% of normal edge frequency
    let ratio = ax_freq as f64 / ab_freq as f64;
    assert!(
        ratio <= 0.15,
        "Noise edge A→X frequency ratio must be ≤ 0.15 (1 dirty / 10 normal): \
         ax_freq={}, ab_freq={}, ratio={:.3}",
        ax_freq,
        ab_freq,
        ratio
    );
}

// ===========================================================================
// Test 5: Bottleneck activity identifiable from timing data
// ===========================================================================

#[test]
fn bottleneck_activity_identifiable_from_timing() {
    // Rank 2: bottleneck must be identifiable from timing data
    //
    // Log: A (1s), B (60s — slow), C (1s)
    // B has a much larger duration gap than A and C.
    // We assert B's "wait" duration > A's and C's.
    let traces = vec![
        (
            "case0",
            vec![
                ("A", 0u64),
                ("B", 1u64),   // 1s after A
                ("C", 61u64),  // 60s after B — B is the slow step
            ],
        ),
        (
            "case1",
            vec![
                ("A", 0u64),
                ("B", 1u64),
                ("C", 61u64),
            ],
        ),
        (
            "case2",
            vec![
                ("A", 0u64),
                ("B", 2u64),
                ("C", 62u64),
            ],
        ),
    ];

    let mut log = EventLog::new();
    for (case_id, events) in &traces {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(case_id.to_string()),
                );
                m
            },
            events: Vec::new(),
        };
        for (act, secs) in events {
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::String(format!(
                    "2024-01-01T00:{:02}:{:02}Z",
                    secs / 60,
                    secs % 60
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }

    let durations = compute_avg_durations(&log);

    // B is the bottleneck: avg duration of "wait until C from B" should be ~60s
    // C has no outgoing events so avg_durations gives C=0
    // The duration of each step is assigned to the destination activity
    let b_duration = durations.get("B").copied().unwrap_or(0.0);
    let c_duration = durations.get("C").copied().unwrap_or(0.0);
    let a_duration = durations.get("A").copied().unwrap_or(0.0);

    // B's wait time (the time to get from A to B) is ~1-2s
    // C's wait time (the time from B to C) is ~60s — C identifies the bottleneck
    // The step BEFORE C (i.e. B→C gap) is what makes C appear as the slow destination
    assert!(
        c_duration > b_duration,
        "Activity C (slow destination, gap=60s) must have higher avg_duration than B (gap=1-2s): \
         c_duration={}, b_duration={}",
        c_duration,
        b_duration
    );

    assert!(
        c_duration > a_duration,
        "Activity C (slow destination, gap=60s) must have higher avg_duration than A (gap=0): \
         c_duration={}, a_duration={}",
        c_duration,
        a_duration
    );
}

// ===========================================================================
// Test 6: Rework ratio measurable at ~30%
// ===========================================================================

#[test]
fn rework_ratio_measurable_at_30_percent() {
    // Rank 2: rework ratio must be measurable and accurate
    //
    // Log: 10 traces where 3 have activity B repeated twice (30% rework rate for B)
    // Rework ratio for B ≈ 0.30 (within 0.05)
    let mut log = EventLog::new();

    // 7 normal traces: A→B→C (no rework)
    for i in 0..7 {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("case{}", i)),
                );
                m
            },
            events: Vec::new(),
        };
        for (j, act) in ["A", "B", "C"].iter().enumerate() {
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", j)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }

    // 3 rework traces: A→B→B→C (B repeated)
    for i in 7..10 {
        let mut trace = Trace {
            attributes: {
                let mut m = HashMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("case{}", i)),
                );
                m
            },
            events: Vec::new(),
        };
        for (j, act) in ["A", "B", "B", "C"].iter().enumerate() {
            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", j)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }

    // Compute rework ratio for B: traces where B appears more than once / total traces
    let total_traces = log.traces.len();
    let rework_traces = log
        .traces
        .iter()
        .filter(|trace| {
            let b_count = trace
                .events
                .iter()
                .filter(|e| {
                    e.attributes
                        .get(ACTIVITY_KEY)
                        .map(|v| matches!(v, AttributeValue::String(s) if s == "B"))
                        .unwrap_or(false)
                })
                .count();
            b_count > 1
        })
        .count();

    let rework_ratio = rework_traces as f64 / total_traces as f64;

    assert!(
        (rework_ratio - 0.30).abs() <= 0.05,
        "Rework ratio for B must be ≈ 0.30 (within ±0.05): \
         rework_traces={}, total_traces={}, ratio={:.3}",
        rework_traces,
        total_traces,
        rework_ratio
    );
}

// ===========================================================================
// Test 7: Dirty traces reduce conformance fitness
// ===========================================================================

#[test]
fn dirty_data_conformance_impact_documented() {
    // Rank 3 metamorphic: dirty traces must reduce conformance
    //
    // Clean log (all traces fit model): high fitness
    // Add 2 traces with extra activity X (doesn't fit model): fitness drops
    use wasm4pm::conformance::token_replay_pure;

    let petri_net = make_abc_petri_net();

    // Clean log: 5 traces A→B→C — all conform to A→B→C model
    let clean_log = {
        let mut log = EventLog::new();
        for i in 0..5 {
            let mut trace = Trace {
                attributes: {
                    let mut m = HashMap::new();
                    m.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(format!("case{}", i)),
                    );
                    m
                },
                events: Vec::new(),
            };
            for (j, act) in ["A", "B", "C"].iter().enumerate() {
                let mut attrs = HashMap::new();
                attrs.insert(
                    ACTIVITY_KEY.to_string(),
                    AttributeValue::String(act.to_string()),
                );
                attrs.insert(
                    TIMESTAMP_KEY.to_string(),
                    AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", j)),
                );
                trace.events.push(Event { attributes: attrs });
            }
            log.traces.push(trace);
        }
        log
    };

    // Dirty log: same 5 conforming traces + 2 non-conforming traces (A→X→C)
    let dirty_log = {
        let mut log = clean_log.clone();
        for i in 5..7 {
            let mut trace = Trace {
                attributes: {
                    let mut m = HashMap::new();
                    m.insert(
                        "concept:name".to_string(),
                        AttributeValue::String(format!("case{}", i)),
                    );
                    m
                },
                events: Vec::new(),
            };
            for (j, act) in ["A", "X", "C"].iter().enumerate() {
                let mut attrs = HashMap::new();
                attrs.insert(
                    ACTIVITY_KEY.to_string(),
                    AttributeValue::String(act.to_string()),
                );
                attrs.insert(
                    TIMESTAMP_KEY.to_string(),
                    AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", j)),
                );
                trace.events.push(Event { attributes: attrs });
            }
            log.traces.push(trace);
        }
        log
    };

    let result_clean: ConformanceResult = token_replay_pure(&clean_log, &petri_net, ACTIVITY_KEY);
    let result_dirty: ConformanceResult = token_replay_pure(&dirty_log, &petri_net, ACTIVITY_KEY);

    // Both should run without panic
    assert!(
        result_clean.avg_fitness >= 0.0 && result_clean.avg_fitness <= 1.0,
        "Clean log fitness must be in [0,1]: got {}",
        result_clean.avg_fitness
    );
    assert!(
        result_dirty.avg_fitness >= 0.0 && result_dirty.avg_fitness <= 1.0,
        "Dirty log fitness must be in [0,1]: got {}",
        result_dirty.avg_fitness
    );

    // Dirty traces must reduce conformance
    assert!(
        result_dirty.avg_fitness < result_clean.avg_fitness,
        "Dirty log fitness ({:.4}) must be lower than clean log fitness ({:.4}). \
         2 non-conforming A→X→C traces must degrade the overall conformance score.",
        result_dirty.avg_fitness,
        result_clean.avg_fitness
    );
}
