//! Scalability Report Generator — pictl process mining kernel.
//!
//! Sweeps batch_size (trace count) from 256 to 8192 in steps of 256 across
//! three feature distributions: uniform, skewed, adversarial.
//!
//! Measures latency per batch and throughput (events/ms), detects the
//! inflection point where throughput growth drops below 10% per step,
//! and writes three JSON reports to a caller-supplied output directory.
//!
//! Run: cargo run -p pictl --example scalability_report --release [output_dir]
//!
//! output_dir defaults to .pictl/benchmarks relative to cwd.

use pictl::discovery::discover_dfg;
use pictl::models::{AttributeValue, Event, EventLog, Trace};
use pictl::state::{get_or_init_state, StoredObject};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Instant;

const ACTIVITY_KEY: &str = "concept:name";
const TIMESTAMP_KEY: &str = "time:timestamp";

const BATCH_SIZES: &[usize] = &[
    256, 512, 768, 1024, 1280, 1536, 1792, 2048, 2304, 2560, 2816, 3072, 3328, 3584, 3840, 4096,
    4352, 4608, 4864, 5120, 5376, 5632, 5888, 6144, 6400, 6656, 6912, 7168, 7424, 7680, 7936,
    8192,
];

const ACTIVITIES: &[&str; 20] = &[
    "Register", "Validate", "Check_Completeness", "Check_Docs", "Assess_Risk",
    "Calculate_Fee", "Send_Invoice", "Wait_Payment", "Confirm_Payment", "Approve_Basic",
    "Approve_Senior", "Approve_Director", "Notify_Applicant", "Create_Record", "Archive",
    "Close", "Reject", "Escalate", "Return_Docs", "Reopen",
];

/// Number of timed repetitions per batch size.
const REPS: usize = 30;

// ── deterministic LCG ──────────────────────────────────────────────────────────

struct Lcg(u64);
impl Lcg {
    const fn new(seed: u64) -> Self { Self(seed) }
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005)
                        .wrapping_add(1_442_695_040_888_963_407);
        self.0
    }
    fn next_usize_mod(&mut self, m: usize) -> usize { (self.next() as usize) % m }
    fn next_f64_unit(&mut self) -> f64 { (self.next() >> 11) as f64 / (1u64 << 53) as f64 }
}

// ── feature distributions ───────────────────────────────────────────────────────

fn generate_uniform(num_cases: usize) -> EventLog {
    let mut rng = Lcg::new(0xAAAA_BBBB_CCCC_DDDD);
    let mut log = EventLog::new();
    for case_idx in 0..num_cases {
        let mut trace = Trace { attributes: HashMap::new(), events: Vec::new() };
        trace.attributes.insert("case:concept:name".into(), AttributeValue::String(format!("u_{}", case_idx)));
        let num_events = 7 + rng.next_usize_mod(7);
        for evt_idx in 0..num_events {
            let base_idx = evt_idx % ACTIVITIES.len();
            let act_idx = if rng.next_f64_unit() < 0.05 { rng.next_usize_mod(ACTIVITIES.len()) } else { base_idx };
            let mut attrs = HashMap::new();
            attrs.insert(ACTIVITY_KEY.into(), AttributeValue::String(ACTIVITIES[act_idx].into()));
            attrs.insert(TIMESTAMP_KEY.into(), AttributeValue::Date(format!(
                "2024-01-{:02}T{:02}:{:02}:00Z", (case_idx % 28) + 1, (evt_idx / 60) % 24, evt_idx % 60,
            )));
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

fn generate_skewed(num_cases: usize) -> EventLog {
    let mut rng = Lcg::new(0x1111_2222_3333_4444);
    let mut log = EventLog::new();
    for case_idx in 0..num_cases {
        let mut trace = Trace { attributes: HashMap::new(), events: Vec::new() };
        trace.attributes.insert("case:concept:name".into(), AttributeValue::String(format!("s_{}", case_idx)));
        let num_events = if rng.next_f64_unit() < 0.80 { 2 + rng.next_usize_mod(4) } else { 100 + rng.next_usize_mod(51) };
        for evt_idx in 0..num_events {
            let act_idx = rng.next_usize_mod(ACTIVITIES.len());
            let mut attrs = HashMap::new();
            attrs.insert(ACTIVITY_KEY.into(), AttributeValue::String(ACTIVITIES[act_idx].into()));
            attrs.insert(TIMESTAMP_KEY.into(), AttributeValue::Date(format!(
                "2024-02-{:02}T{:02}:{:02}:00Z", (case_idx % 28) + 1, (evt_idx / 60) % 24, evt_idx % 60,
            )));
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

fn generate_adversarial(num_cases: usize) -> EventLog {
    let mut rng = Lcg::new(0xDEAD_CAFE_BEEF_1337);
    let mut log = EventLog::new();
    for case_idx in 0..num_cases {
        let mut trace = Trace { attributes: HashMap::new(), events: Vec::new() };
        trace.attributes.insert("case:concept:name".into(), AttributeValue::String(format!(
            "adversarial_case_prefix_xxxxxxxxxxxxxxxxxxxxxxx_{:08}", case_idx
        )));
        let num_events = 1 + rng.next_usize_mod(200);
        for _evt_idx in 0..num_events {
            let act_idx = rng.next_usize_mod(ACTIVITIES.len());
            let ts_bucket = rng.next_usize_mod(10);
            let mut attrs = HashMap::new();
            attrs.insert(ACTIVITY_KEY.into(), AttributeValue::String(ACTIVITIES[act_idx].into()));
            attrs.insert(TIMESTAMP_KEY.into(), AttributeValue::Date(format!(
                "2024-03-01T{:02}:{:02}:00Z", ts_bucket % 24, ts_bucket % 60,
            )));
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

// ── timing helpers ──────────────────────────────────────────────────────────────

fn time_us<F: FnMut()>(mut f: F, reps: usize) -> (f64, f64, f64, f64) {
    for _ in 0..3 { f(); } // warm-up
    let mut samples: Vec<f64> = Vec::with_capacity(reps);
    for _ in 0..reps {
        let t0 = Instant::now();
        f();
        samples.push(t0.elapsed().as_nanos() as f64 / 1_000.0);
    }
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mean = samples.iter().sum::<f64>() / reps as f64;
    let variance = samples.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / reps as f64;
    (mean, variance.sqrt(), samples[0], samples[reps - 1])
}

// ── inflection point ────────────────────────────────────────────────────────────
//
// Uses a 3-point smoothed throughput curve to avoid triggering on single-batch
// anomalies (OS scheduler jitter, thermal burst, cache-miss outlier).
// An inflection is declared when the smoothed marginal throughput growth across
// TWO consecutive windows is both below 10%.

fn smooth(curve: &[(usize, f64)], window: usize) -> Vec<(usize, f64)> {
    if curve.len() < window {
        return curve.to_vec();
    }
    let half = window / 2;
    curve.iter().enumerate().map(|(i, &(b, _))| {
        let lo = i.saturating_sub(half);
        let hi = (i + half + 1).min(curve.len());
        let avg = curve[lo..hi].iter().map(|(_, t)| t).sum::<f64>() / (hi - lo) as f64;
        (b, avg)
    }).collect()
}

fn find_inflection(curve: &[(usize, f64)]) -> (usize, f64) {
    if curve.len() < 4 { return curve.last().copied().unwrap_or((256, 0.0)); }
    let smoothed = smooth(curve, 3);
    let mut consec_below = 0usize;
    for i in 1..smoothed.len() {
        let (_, prev_t) = smoothed[i - 1];
        let (curr_b, curr_t) = smoothed[i];
        let growth = if prev_t > 0.0 { (curr_t - prev_t) / prev_t } else { 1.0 };
        if growth < 0.10 {
            consec_below += 1;
            if consec_below >= 2 {
                // Confirmed saturation: return the original (un-smoothed) tput at this batch
                let orig_t = curve.iter().find(|(b, _)| *b == curr_b).map(|(_, t)| *t).unwrap_or(curr_t);
                return (curr_b, orig_t);
            }
        } else {
            consec_below = 0;
        }
    }
    *curve.last().unwrap()
}

// ── bottleneck classifier ────────────────────────────────────────────────────────

fn classify_bottleneck(lat: &[(usize, f64)], std: &[(usize, f64)]) -> (String, String) {
    if lat.len() < 4 {
        return ("insufficient_data".into(), "Not enough data points for analysis.".into());
    }
    let (b0, l0) = lat[0];
    let (bn, ln) = *lat.last().unwrap();
    let lat_ratio = ln / l0;
    let batch_ratio = bn as f64 / b0 as f64;
    let max_std = std.last().map(|(_, s)| *s).unwrap_or(0.0);
    let cv = if ln > 0.0 { max_std / ln } else { 0.0 };
    let _ = batch_ratio;

    if cv > 0.30 {
        ("lock_contention_or_scheduler_jitter".into(), format!(
            "High CV ({:.2}) at batch={} — OS scheduler jitter or mutex contention in AppState. \
             Consider sharded or thread-local state for multi-threaded workloads.", cv, bn))
    } else if lat_ratio > (bn as f64 / b0 as f64) * 1.5 {
        ("memory_pressure_superlinear".into(), format!(
            "Latency grew {:.1}x vs batch {:.1}x (super-linear). Working set at batch={} \
             likely exceeds L3 cache. Arena allocation for EventLog/DFG structures recommended.",
            lat_ratio, bn as f64 / b0 as f64, bn))
    } else if lat_ratio > (bn as f64 / b0 as f64) * 0.85 {
        ("linear_scaling_expected".into(), format!(
            "Latency scales linearly ({:.1}x). DFG is O(N) — expected behaviour. \
             SIMD/parallel dispatch would produce sub-linear latency growth.", lat_ratio))
    } else {
        ("sub_linear_good".into(), format!(
            "Latency grew only {:.1}x for {:.1}x batch increase — sub-linear. \
             Fixed-overhead amortisation and CPU cache locality working correctly.",
            lat_ratio, bn as f64 / b0 as f64))
    }
}

// ── sweep ───────────────────────────────────────────────────────────────────────

fn run_sweep<F: Fn(usize) -> EventLog>(generator: F, label: &str) -> Value {
    let mut latency_curve: Vec<Value> = Vec::new();
    let mut tput_raw: Vec<(usize, f64)> = Vec::new();
    let mut lat_raw: Vec<(usize, f64)> = Vec::new();
    let mut std_raw: Vec<(usize, f64)> = Vec::new();

    println!("  distribution={} starting sweep ({} batch sizes)", label, BATCH_SIZES.len());

    for &batch in BATCH_SIZES {
        let log = generator(batch);
        let total_events = log.event_count();
        let handle = get_or_init_state()
            .store_object(StoredObject::EventLog(log))
            .expect("scalability_report: store_object failed");
        let h = handle.clone();
        let (mean_us, stddev_us, min_us, max_us) = time_us(|| { discover_dfg(&h, ACTIVITY_KEY).unwrap(); }, REPS);
        let tput = (total_events as f64 / mean_us) * 1_000.0;
        println!("    batch={:5}  events={:7}  mean={:9.1}µs  tput={:10.0} ev/ms", batch, total_events, mean_us, tput);
        latency_curve.push(json!({
            "batch_size": batch, "total_events": total_events,
            "latency_mean_us": mean_us, "latency_stddev_us": stddev_us,
            "latency_min_us": min_us, "latency_max_us": max_us,
            "throughput_events_per_ms": tput,
        }));
        tput_raw.push((batch, tput));
        lat_raw.push((batch, mean_us));
        std_raw.push((batch, stddev_us));
    }

    let (inf_batch, inf_tput) = find_inflection(&tput_raw);
    let (bk_kind, bk_detail) = classify_bottleneck(&lat_raw, &std_raw);
    let rec_batch = tput_raw.iter().take_while(|(b, _)| *b <= inf_batch).last().map(|(b, _)| *b).unwrap_or(inf_batch);
    let peak_tput = tput_raw.iter().map(|(_, t)| *t).fold(f64::NEG_INFINITY, f64::max);

    json!({
        "schema_version": "1.0.0",
        "distribution": label,
        "algorithm": "dfg",
        "algorithm_complexity": "O(N) single-pass",
        "batch_sizes_swept": BATCH_SIZES.len(),
        "batch_size_min": BATCH_SIZES[0],
        "batch_size_max": BATCH_SIZES[BATCH_SIZES.len() - 1],
        "reps_per_batch": REPS,
        "latency_curve": latency_curve,
        "inflection_point": {
            "batch_size": inf_batch,
            "throughput_events_per_ms": inf_tput,
            "interpretation": "first batch_size where marginal throughput growth dropped below 10%"
        },
        "bottleneck": { "kind": bk_kind, "detail": bk_detail },
        "recommendation": {
            "max_practical_batch_size": rec_batch,
            "peak_throughput_events_per_ms": peak_tput,
            "rationale": format!(
                "Use batch_size={} for {} distribution: throughput saturates here. \
                 Beyond this point additional traces yield <10% throughput gain while \
                 memory allocation overhead increases.", rec_batch, label)
        }
    })
}

// ── main ─────────────────────────────────────────────────────────────────────────

fn main() {
    let output_dir = std::env::args().nth(1).unwrap_or_else(|| ".pictl/benchmarks".into());
    std::fs::create_dir_all(&output_dir).expect("cannot create output dir");
    let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();

    let distributions: &[(&str, fn(usize) -> EventLog)] = &[
        ("uniform", generate_uniform),
        ("skewed", generate_skewed),
        ("adversarial", generate_adversarial),
    ];

    let mut all_reports: Vec<Value> = Vec::new();
    for (label, gen) in distributions {
        println!("\n[scalability_report] distribution={}", label);
        let report = run_sweep(*gen, label);
        all_reports.push(report.clone());
        let path = format!("{}/scalability-{}-{}.json", output_dir, label, ts);
        std::fs::write(&path, serde_json::to_string_pretty(&report).unwrap()).unwrap();
        println!("[scalability_report] wrote {}", path);
    }

    println!("\n[scalability_report] SUMMARY");
    println!("{:<14} {:>12} {:>16} {:>30}", "distribution", "inflection", "peak_tput(ev/ms)", "bottleneck_kind");
    println!("{}", "-".repeat(76));
    for r in &all_reports {
        println!("{:<14} {:>12} {:>16.0} {:>30}",
            r["distribution"].as_str().unwrap_or("?"),
            r["inflection_point"]["batch_size"].as_u64().unwrap_or(0),
            r["recommendation"]["peak_throughput_events_per_ms"].as_f64().unwrap_or(0.0),
            r["bottleneck"]["kind"].as_str().unwrap_or("?"),
        );
    }
    println!("\nReports: {}/scalability-*-{}.json", output_dir, ts);
}
