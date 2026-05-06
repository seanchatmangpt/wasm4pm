#![allow(dead_code)]
// Shared helpers for all wasm4pm Criterion benchmarks.
// Included via `#[path = "helpers.rs"] mod helpers;` in each bench file.
use std::collections::HashMap;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::state::{get_or_init_state, StoredObject};

pub const ACTIVITY_KEY: &str = "concept:name";
pub const TIMESTAMP_KEY: &str = "time:timestamp";

/// Activity vocabulary — realistic process activity names.
const ACTIVITIES: &[&str; 20] = &[
    "Register",
    "Validate",
    "Check_Completeness",
    "Check_Docs",
    "Assess_Risk",
    "Calculate_Fee",
    "Send_Invoice",
    "Wait_Payment",
    "Confirm_Payment",
    "Approve_Basic",
    "Approve_Senior",
    "Approve_Director",
    "Notify_Applicant",
    "Create_Record",
    "Archive",
    "Close",
    "Reject",
    "Escalate",
    "Return_Docs",
    "Reopen",
];

/// Shape parameters for synthetic log generation.
pub struct LogShape {
    pub num_cases: usize,
    pub avg_events_per_case: usize,
    pub num_activities: usize,
    /// 0.0 = sequential, 1.0 = fully random ordering
    pub noise_factor: f64,
}

/// Returns true unless BENCH_FULL=1 is set.
/// Fast mode (default): 1 input size, minimal sampling, < 1s per binary.
/// Full mode (opt-in):  4 input sizes, statistical sampling, ~minutes per binary.
#[inline]
pub fn is_fast_mode() -> bool {
    !std::env::var("BENCH_FULL").map(|v| v == "1").unwrap_or(false)
}

/// Apply fast-mode overrides to a Criterion group (default).
/// 50ms measurement + 20ms warm-up + 10 samples → ~1s per binary.
pub fn fast_group(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    use std::time::Duration;
    group.measurement_time(Duration::from_millis(50));
    group.warm_up_time(Duration::from_millis(20));
    group.sample_size(10);
}

/// Apply full-mode caps to a Criterion group (opt-in via BENCH_FULL=1).
/// Overrides the hardcoded 5-8s measurement and 50 samples in each bench fn.
/// Result: ~1s measurement + 0.5s warm-up + 20 samples → ~30s per binary vs ~5 min.
pub fn full_group(group: &mut criterion::BenchmarkGroup<'_, criterion::measurement::WallTime>) {
    use std::time::Duration;
    group.measurement_time(Duration::from_secs(1));
    group.warm_up_time(Duration::from_millis(500));
    group.sample_size(20);
}

/// Standard benchmark sizes: small → xlarge.
/// In BENCH_FAST=1 mode returns only the 100-case size so each binary
/// completes in < 1 second.
pub fn bench_sizes() -> Vec<LogShape> {
    if is_fast_mode() {
        return vec![LogShape {
            num_cases: 100,
            avg_events_per_case: 10,
            num_activities: 8,
            noise_factor: 0.05,
        }];
    }
    // Full mode: 3 sizes (100 → 10K). 50K dropped — adds minutes, no new insight.
    vec![
        LogShape {
            num_cases: 100,
            avg_events_per_case: 10,
            num_activities: 8,
            noise_factor: 0.05,
        },
        LogShape {
            num_cases: 1_000,
            avg_events_per_case: 15,
            num_activities: 12,
            noise_factor: 0.10,
        },
        LogShape {
            num_cases: 10_000,
            avg_events_per_case: 15,
            num_activities: 15,
            noise_factor: 0.10,
        },
    ]
}

/// Sizes capped for slow (>200ms) algorithms.
/// In BENCH_FAST=1 mode returns only the 100-case size.
pub fn bench_sizes_slow() -> Vec<LogShape> {
    if is_fast_mode() {
        return vec![LogShape {
            num_cases: 100,
            avg_events_per_case: 10,
            num_activities: 8,
            noise_factor: 0.05,
        }];
    }
    vec![
        LogShape {
            num_cases: 100,
            avg_events_per_case: 10,
            num_activities: 8,
            noise_factor: 0.05,
        },
        LogShape {
            num_cases: 500,
            avg_events_per_case: 12,
            num_activities: 10,
            noise_factor: 0.10,
        },
        LogShape {
            num_cases: 1_000,
            avg_events_per_case: 15,
            num_activities: 12,
            noise_factor: 0.10,
        },
    ]
}

/// Linear congruential generator — deterministic, no external rand crate needed.
pub struct Lcg(pub u64);

impl Lcg {
    pub const fn new(seed: u64) -> Self {
        Self(seed)
    }
    pub fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0
    }
    pub fn next_usize_mod(&mut self, m: usize) -> usize {
        (self.next() as usize) % m
    }
    pub fn next_f64_unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// Generate a synthetic `EventLog` with realistic variance.
///
/// Deterministic: same `LogShape` always produces the same log.
pub fn generate_event_log(shape: &LogShape) -> EventLog {
    let activities: Vec<&str> = ACTIVITIES
        .iter()
        .copied()
        .take(shape.num_activities)
        .collect();
    let mut rng = Lcg::new(0xDEAD_BEEF_CAFE_BABE);
    let mut log = EventLog::new();

    for case_idx in 0..shape.num_cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case:concept:name".to_string(),
            AttributeValue::String(format!("case_{}", case_idx)),
        );

        // Vary trace length: avg ± 50 %
        let len_factor = 0.5 + rng.next_f64_unit();
        let num_events = ((shape.avg_events_per_case as f64 * len_factor) as usize).max(2);

        for evt_idx in 0..num_events {
            let base_idx = evt_idx % activities.len();
            let act_idx = if rng.next_f64_unit() < shape.noise_factor {
                rng.next_usize_mod(activities.len())
            } else {
                base_idx
            };

            let mut attrs = HashMap::new();
            attrs.insert(
                ACTIVITY_KEY.to_string(),
                AttributeValue::String(activities[act_idx].to_string()),
            );
            attrs.insert(
                TIMESTAMP_KEY.to_string(),
                AttributeValue::Date(format!(
                    "2024-01-{:02}T{:02}:{:02}:00Z",
                    (case_idx % 28) + 1,
                    (evt_idx / 60) % 24,
                    evt_idx % 60,
                )),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

/// Store an `EventLog` in global `APP_STATE`, returning its handle.
pub fn store_log(log: EventLog) -> String {
    get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("bench: store_object failed")
}

/// Build a log for `shape` and store it; return (handle, total_events).
pub fn make_handle(shape: &LogShape) -> (String, usize) {
    let log = generate_event_log(shape);
    let total_events = log.event_count();
    let handle = store_log(log);
    (handle, total_events)
}

/// Parse `node_count` and `edge_count` from an algorithm's JSON output
/// using simd-json for fast deserialization.
pub fn parse_model_stats(json: &str) -> (usize, usize) {
    use simd_json::prelude::{ValueAsContainer, ValueAsScalar};
    let mut bytes = json.as_bytes().to_vec();
    if let Ok(val) = simd_json::to_owned_value(&mut bytes) {
        let nodes = val["node_count"]
            .as_usize()
            .unwrap_or_else(|| val["nodes"].as_array().map(|a| a.len()).unwrap_or(0));
        let edges = val["edge_count"]
            .as_usize()
            .unwrap_or_else(|| val["edges"].as_array().map(|a| a.len()).unwrap_or(0));
        (nodes, edges)
    } else {
        (0, 0)
    }
}
