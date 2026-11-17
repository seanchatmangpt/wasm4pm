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
    !std::env::var("BENCH_FULL")
        .map(|v| v == "1")
        .unwrap_or(false)
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
pub fn generate_event_log(_shape: &LogShape) -> EventLog {
    panic!(
        "TPS VIOLATION: Synthetic data generation is strictly prohibited.\n\
         All benchmarks must use real, publicly sourced process mining datasets.\n\
         See benchmark_audit.md for the migration plan and dataset sources."
    );
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

// ─────────────────────────────────────────────────────────────────────────────
// Real-data grounding (TPS rule: no synthetic event logs in benches)
// ─────────────────────────────────────────────────────────────────────────────

/// Candidate paths for the real Sepsis event log (1,050 cases / 15,214 events,
/// https://data.4tu.nl/). Bench cwd is the crate dir (`wasm4pm/`), so both the
/// repo-root fixture and the direct `data/` source are tried.
pub const SEPSIS_CANDIDATES: &[&str] = &[
    "bench_data/sepsis.xes",
    "../bench_data/sepsis.xes",
    "../../bench_data/sepsis.xes",
    "data/Sepsis Cases - Event Log.xes",
    "../data/Sepsis Cases - Event Log.xes",
];

/// Candidate paths for the real BPI 2020 Domestic Declarations log.
pub const BPI2020_DECL_CANDIDATES: &[&str] = &[
    "bench_data/bpi2020_domestic_declarations.xes",
    "../bench_data/bpi2020_domestic_declarations.xes",
    "../../bench_data/bpi2020_domestic_declarations.xes",
];

/// Candidate paths for the real Road Traffic fine-grained event log
/// (100-trace sample, https://data.4tu.nl/).
pub const ROADTRAFFIC_CANDIDATES: &[&str] = &[
    "bench_data/roadtraffic100traces.xes",
    "../bench_data/roadtraffic100traces.xes",
    "../../bench_data/roadtraffic100traces.xes",
];

/// Resolve the first existing, non-trivial candidate path. Panics listing every
/// tried path (never `Option`-returns — honest failure, no silent skip).
pub fn resolve_real_log_path(candidates: &[&str]) -> usize {
    for (i, path) in candidates.iter().enumerate() {
        if let Ok(meta) = std::fs::metadata(path) {
            if meta.len() >= 200 {
                return i;
            }
    }
    }
    panic!(
        "bench: required real log not found at any of {:?}\n\
         Provide the fixture under bench_data/ (see bench_data/README.md).",
        candidates
    );
}

/// Minimal tolerant XES extraction: line-based `trace`/`event`/`string`/`date`
/// attribute collection. Used only as a fallback when the production strict
/// parser rejects a real-world export (e.g. the 4TU Sepsis log ships nested
/// classifier metadata under `<int key="meta_general:classifiers">`, which the
/// strict parser refuses because its `<string>` children are not self-closing).
pub fn parse_xes_tolerant(content: &str) -> EventLog {
    use std::collections::BTreeMap;
    use wasm4pm::models::{AttributeValue, Event, Trace};
    let mut log = EventLog::new();
    let mut trace: Option<Trace> = None;
    let mut event: Option<Event> = None;
    for line in content.lines() {
        let t = line.trim();
        if t.starts_with("<trace>") || t.starts_with("<trace ") {
            trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: Vec::new(),
            });
        } else if t.starts_with("</trace>") {
            if let Some(tr) = trace.take() {
                log.traces.push(tr);
            }
        } else if t.starts_with("<event>") || t.starts_with("<event ") {
            event = Some(Event {
                attributes: BTreeMap::new(),
            });
        } else if t.starts_with("</event>") {
            if let Some(ev) = event.take() {
                if let Some(ref mut tr) = trace {
                    tr.events.push(ev);
    }
            }
        } else if t.starts_with("<string") || t.starts_with("<date") {
            let (Some(ref mut ev), Some(k), Some(v)) = (
                event.as_mut(),
                extract_xml_attr(t, "key"),
                extract_xml_attr(t, "value"),
            ) else {
                continue;
            };
            let val = if t.starts_with("<date") {
                AttributeValue::Date(v)
            } else {
                AttributeValue::String(v)
            };
            ev.attributes.insert(k, val);
        }
    }
    log
}

fn extract_xml_attr(s: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let start = s.find(&needle)? + needle.len();
    let end = s[start..].find('"')?;
    Some(s[start..start + end].to_string())
}

/// Read + parse a real XES log from the first candidate path that yields a
/// non-empty log. Tries the production strict parser first; falls back to a
/// tolerant extraction when the real-world export trips strict validation.
/// Panics with the tried-path list if none works. Never `Option`-returns.
pub fn load_real_log_from(candidates: &[&str]) -> EventLog {
    use wasm4pm::xes_format::validate_and_parse_xes;
    // Prefer bench_data/ fixtures over raw data/ originals (verified-md5 inventory).
    let mut idx: Vec<&str> = candidates.to_vec();
    idx.sort_by_key(|p| !p.contains("bench_data"));
    let path = idx[resolve_real_log_path(&idx)];
    let content = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("bench: failed to read {path}: {e}"));
    let log = validate_and_parse_xes(&content)
        .ok()
        .filter(|l| !l.traces.is_empty())
        .unwrap_or_else(|| {
            let l = parse_xes_tolerant(&content);
            assert!(
                !l.traces.is_empty(),
                "bench: {path} parsed to an empty log under both strict and tolerant parsers"
            );
            l
        });
    log
}

/// Load the real Sepsis log via the production XES parser.
pub fn load_real_log() -> EventLog {
    load_real_log_from(SEPSIS_CANDIDATES)
}

/// Load the real Sepsis log truncated to `max_traces` (deterministic prefix).
pub fn load_real_log_capped(max_traces: usize) -> EventLog {
    let mut log = load_real_log();
    log.traces.truncate(max_traces);
    log
}

/// Load the real Sepsis log and store it in global `APP_STATE`.
/// Returns (handle, total_events).
pub fn store_real_log() -> (String, usize) {
    let log = load_real_log();
    let events = log.event_count();
    let handle = store_log(log);
    (handle, events)
}

/// Load the real Sepsis log truncated to `max_traces` and store it.
/// Returns (handle, total_events).
pub fn store_real_log_capped(max_traces: usize) -> (String, usize) {
    let log = load_real_log_capped(max_traces);
    let events = log.event_count();
    let handle = store_log(log);
    (handle, events)
}

/// Ground-truth case counts of the shipped real fixtures:
/// `(sepsis_cases, bpi2020_declarations_cases)` — re-read from disk, not
/// hardcoded claims.
pub fn real_case_counts() -> (usize, usize) {
    let sepsis = load_real_log().traces.len();
    let bpi = load_real_log_from(BPI2020_DECL_CANDIDATES).traces.len();
    (sepsis, bpi)
}

/// Shape descriptor used by the enterprise-architecture bench to select the
/// real-log prefix size. Only `num_cases` affects real-data loading; the other
/// fields are kept for benchmark labeling.
pub struct BenchShape {
    pub num_cases: usize,
    pub events_per_case: usize,
    pub num_activities: usize,
}

/// Parse `node_count` and `edge_count` from an algorithm's JSON output
/// using simd-json for fast deserialization.
pub fn parse_model_stats(json: &str) -> (usize, usize) {
    use simd_json::prelude::{ValueAsArray, ValueAsScalar};
    let mut bytes = json.as_bytes().to_vec();
    if let Ok(val) = simd_json::to_owned_value(&mut bytes) {
        let nodes = val["node_count"]
            .as_usize()
            .or_else(|| val["nodes"].as_array().map(|a| a.len()))
            .expect("bench: model missing node count/array");
        let edges = val["edge_count"]
            .as_usize()
            .or_else(|| val["edges"].as_array().map(|a| a.len()))
            .expect("bench: model missing edge count/array");
        (nodes, edges)
    } else {
        panic!("bench: failed to parse model JSON: {}", json);
    }
}
