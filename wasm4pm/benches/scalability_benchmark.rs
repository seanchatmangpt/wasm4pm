/// Scalability benchmarking harness — pictl process mining kernel.
///
/// Sweeps batch_size (trace count) from 256 to 8192 in steps of 256
/// across three feature distributions: uniform, skewed, adversarial.
///
/// Measures: latency per batch, throughput (events/ms), and identifies
/// the inflection point where marginal throughput growth drops below 10%.
///
/// Run: cargo bench --bench scalability_benchmark
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::discovery::discover_dfg;
use pictl::more_discovery::discover_inductive_miner;
use pictl::models::{AttributeValue, Event, EventLog, Trace};
use pictl::state::{get_or_init_state, StoredObject};
use std::collections::HashMap;
use std::time::Duration;

const ACTIVITY_KEY: &str = "concept:name";
const TIMESTAMP_KEY: &str = "time:timestamp";

/// 256 → 8192 in steps of 256 (32 data points).
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

// ── deterministic LCG (no external rand crate) ───────────────────────────────

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

// ── feature distributions ─────────────────────────────────────────────────────

/// Uniform: trace lengths 7–13, activities spread evenly, features in [0.5, 0.9].
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

/// Skewed: 80% short (2–5 events), 20% long (100–150 events).
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

/// Adversarial: random lengths 1–200, pathological case IDs, duplicate timestamps.
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

// ── log store helper ────────────────────────────────���─────────────────────────

fn store_log(log: EventLog) -> (String, usize) {
    let total_events = log.event_count();
    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("scalability_benchmark: store_object failed");
    (handle, total_events)
}

// ── DFG sweep — primary latency probe (O(N) single-pass) ─────────────────────

fn bench_uniform_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("scalability/uniform/dfg");
    group.measurement_time(Duration::from_secs(4));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(20);
    for &batch in BATCH_SIZES {
        let log = generate_uniform(batch);
        let (handle, events) = store_log(log);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("batch", batch),
            &handle,
            |b, h| b.iter(|| discover_dfg(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_skewed_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("scalability/skewed/dfg");
    group.measurement_time(Duration::from_secs(4));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(20);
    for &batch in BATCH_SIZES {
        let log = generate_skewed(batch);
        let (handle, events) = store_log(log);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("batch", batch),
            &handle,
            |b, h| b.iter(|| discover_dfg(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_adversarial_dfg(c: &mut Criterion) {
    let mut group = c.benchmark_group("scalability/adversarial/dfg");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(20);
    for &batch in BATCH_SIZES {
        let log = generate_adversarial(batch);
        let (handle, events) = store_log(log);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("batch", batch),
            &handle,
            |b, h| b.iter(|| discover_dfg(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

// ── Inductive Miner sweep — O(N log N), capped at 4096 for time budget ───────

fn bench_uniform_inductive(c: &mut Criterion) {
    let mut group = c.benchmark_group("scalability/uniform/inductive_miner");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(15);
    for &batch in BATCH_SIZES.iter().filter(|&&b| b <= 4096) {
        let log = generate_uniform(batch);
        let (handle, events) = store_log(log);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("batch", batch),
            &handle,
            |b, h| b.iter(|| discover_inductive_miner(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_skewed_inductive(c: &mut Criterion) {
    let mut group = c.benchmark_group("scalability/skewed/inductive_miner");
    group.measurement_time(Duration::from_secs(5));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(15);
    for &batch in BATCH_SIZES.iter().filter(|&&b| b <= 4096) {
        let log = generate_skewed(batch);
        let (handle, events) = store_log(log);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("batch", batch),
            &handle,
            |b, h| b.iter(|| discover_inductive_miner(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_adversarial_inductive(c: &mut Criterion) {
    let mut group = c.benchmark_group("scalability/adversarial/inductive_miner");
    group.measurement_time(Duration::from_secs(6));
    group.warm_up_time(Duration::from_secs(1));
    group.sample_size(15);
    for &batch in BATCH_SIZES.iter().filter(|&&b| b <= 4096) {
        let log = generate_adversarial(batch);
        let (handle, events) = store_log(log);
        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("batch", batch),
            &handle,
            |b, h| b.iter(|| discover_inductive_miner(h, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

criterion_group!(bench_uniform, bench_uniform_dfg, bench_uniform_inductive);
criterion_group!(bench_skewed, bench_skewed_dfg, bench_skewed_inductive);
criterion_group!(bench_adversarial, bench_adversarial_dfg, bench_adversarial_inductive);
criterion_main!(bench_uniform, bench_skewed, bench_adversarial);
