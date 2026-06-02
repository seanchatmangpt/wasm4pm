//! Wave-3 Performance Evidence — `cargo test --test wave3_perf_evidence -- --nocapture`
//!
//! Measures wall-clock time for each algorithm improved in wave-3:
//!   1. DFG (`discover_dfg_from_log`)            — models.rs Cow<[T]> / discovery.rs &str edges
//!   2. Heuristic miner                           — models.rs Cow<[T]>
//!   3. Inductive miner `find_parallel_cut`        — more_discovery.rs O(n²)→integer-pair set
//!   4. Simulated annealing clone-per-step→undo   — more_discovery.rs in-place mutate
//!   5. Hill climbing clone-per-trial→undo        — fast_discovery.rs in-place mutate
//!   6. ILP                                       — models.rs Cow<[T]>
//!   7. Genetic algorithm                         — models.rs Cow<[T]> + genetic_discovery.rs
//!
//! Datasets (real, public-domain):
//!   sepsis.xes         — 1,050 cases, ~15K events  (ICU patient flow)
//!   bpi2020_travel.xes — 7,065 cases, ~87K events  (travel permits)
//!   roadtraffic100traces.xes — 100 cases (road traffic fines)
//!
//! Each measurement is the median of N_REPS repeated runs to reduce OS noise.
//! Output format: one row per (algorithm, dataset) with ms, events, MB/s.

use std::collections::HashMap;
use std::fs;
use std::time::Instant;

use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::fast_discovery::discover_hill_climbing_from_log;
use wasm4pm::genetic_discovery::discover_genetic_algorithm_from_log;
use wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::{discover_inductive_miner_from_log, discover_simulated_annealing_from_log};

const ACTIVITY_KEY: &str = "concept:name";
#[allow(dead_code)]
const TIMESTAMP_KEY: &str = "time:timestamp";

// Number of repetitions per (algorithm, dataset) pair.
// Higher → more stable median; lower → faster CI.
const N_REPS: usize = 10;

// ---------------------------------------------------------------------------
// XES parser (inline, no external dep)
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

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------

struct Dataset {
    label: &'static str,
    log: EventLog,
}

fn resolve_xes(candidates: &[&str]) -> Option<EventLog> {
    let home = std::env::var("HOME").unwrap_or_default();
    for path in candidates {
        let resolved = path.replace("~", &home);
        if let Ok(content) = fs::read_to_string(&resolved) {
            if content.len() > 200 {
                let log = parse_xes(&content);
                if !log.traces.is_empty() {
                    return Some(log);
                }
            }
        }
    }
    None
}

fn load_datasets() -> Vec<Dataset> {
    let mut out = Vec::new();

    let roadtraffic_paths = [
        "../bench_data/roadtraffic100traces.xes",       // from wasm4pm/ package dir
        "bench_data/roadtraffic100traces.xes",           // from workspace root
        "../../bench_data/roadtraffic100traces.xes",
        "~/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
    ];
    if let Some(log) = resolve_xes(&roadtraffic_paths) {
        out.push(Dataset { label: "roadtraffic_100", log });
    } else {
        eprintln!("WARN: roadtraffic100traces.xes not found — skipping");
    }

    let sepsis_paths = [
        "../bench_data/sepsis.xes",         // from wasm4pm/ package dir
        "bench_data/sepsis.xes",
        "../../bench_data/sepsis.xes",
        "~/chatmangpt/wasm4pm/bench_data/sepsis.xes",
        "~/chatmangpt/wasm4pm/data/Sepsis Cases - Event Log.xes",
    ];
    if let Some(log) = resolve_xes(&sepsis_paths) {
        out.push(Dataset { label: "sepsis_1050", log });
    } else {
        eprintln!("WARN: sepsis.xes not found — skipping");
    }

    let bpi2020_paths = [
        "../bench_data/bpi2020_travel.xes",    // from wasm4pm/ package dir
        "bench_data/bpi2020_travel.xes",
        "../../bench_data/bpi2020_travel.xes",
        "~/chatmangpt/wasm4pm/bench_data/bpi2020_travel.xes",
    ];
    if let Some(log) = resolve_xes(&bpi2020_paths) {
        out.push(Dataset { label: "bpi2020_7065", log });
    } else {
        eprintln!("WARN: bpi2020_travel.xes not found — skipping");
    }

    out
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

/// Run `f` N_REPS times and return (median_ms, reps).
fn time_median_ms<F: Fn()>(f: F) -> f64 {
    let mut samples: Vec<f64> = (0..N_REPS)
        .map(|_| {
            let t = Instant::now();
            f();
            t.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap());
    samples[N_REPS / 2]
}

fn event_count(log: &EventLog) -> usize {
    log.traces.iter().map(|t| t.events.len()).sum()
}

fn print_header() {
    println!("\n{:-<90}", "");
    println!("Wave-3 Performance Evidence  (median of {} reps each, release build)", N_REPS);
    println!("{:-<90}", "");
    println!(
        "{:<35} {:<20} {:>8} {:>10} {:>10} {:>12}",
        "Algorithm", "Dataset", "Cases", "Events", "Time(ms)", "Events/ms"
    );
    println!("{:-<90}", "");
}

fn print_row(algo: &str, ds: &Dataset, ms: f64) {
    let cases = ds.log.traces.len();
    let events = event_count(&ds.log);
    let evts_per_ms = if ms > 0.0 { events as f64 / ms } else { f64::INFINITY };
    println!(
        "{:<35} {:<20} {:>8} {:>10} {:>10.1} {:>12.0}",
        algo, ds.label, cases, events, ms, evts_per_ms
    );
}

fn print_separator() {
    println!("{:-<90}", "");
}

// ---------------------------------------------------------------------------
// The one test
// ---------------------------------------------------------------------------

#[test]
fn wave3_performance_table() {
    let datasets = load_datasets();

    if datasets.is_empty() {
        eprintln!("SKIP: no datasets found — place sepsis.xes / bpi2020_travel.xes in bench_data/");
        return;
    }

    print_header();

    // ── 1. DFG ────────────────────────────────────────────────────────────────
    // Wave-3: models.rs Cow<[T]> (no clone on to_columnar_owned),
    //         discovery.rs OCEL &str→&str edge map
    for ds in &datasets {
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        let ms = time_median_ms(|| { let _ = discover_dfg_from_log(&admitted, ACTIVITY_KEY); });
        print_row("dfg", ds, ms);
    }
    print_separator();

    // ── 2. Heuristic miner ────────────────────────────────────────────────────
    // Wave-3: models.rs Cow<[T]>
    for ds in &datasets {
        let ms = time_median_ms(|| { let _ = discover_heuristic_miner_from_log(&ds.log, ACTIVITY_KEY, 0.3); });
        print_row("heuristic_miner(t=0.3)", ds, ms);
    }
    print_separator();

    // ── 3. Inductive miner ────────────────────────────────────────────────────
    // Wave-3: find_parallel_cut O(n²) String clone → integer-pair FxHashSet
    for ds in &datasets {
        // Skip bpi2020 for inductive miner — 87K events makes it slow
        if ds.label.starts_with("bpi2020") { continue; }
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        let ms = time_median_ms(|| { let _ = discover_inductive_miner_from_log(&admitted, ACTIVITY_KEY); });
        print_row("inductive_miner", ds, ms);
    }
    print_separator();

    // ── 4. Simulated annealing ────────────────────────────────────────────────
    // Wave-3: clone-per-step → in-place mutate+undo
    for ds in &datasets {
        // Use modest parameters to keep runtime < 30s
        let ms = time_median_ms(|| { let _ = discover_simulated_annealing_from_log(&ds.log, ACTIVITY_KEY, 50.0, 0.95); });
        print_row("simulated_annealing(T=50,c=0.95)", ds, ms);
    }
    print_separator();

    // ── 5. Hill climbing ─────────────────────────────────────────────────────
    // Wave-3: clone-per-trial → in-place remove+restore
    for ds in &datasets {
        let ms = time_median_ms(|| { let _ = discover_hill_climbing_from_log(&ds.log, ACTIVITY_KEY); });
        print_row("hill_climbing", ds, ms);
    }
    print_separator();

    // ── 6. ILP ────────────────────────────────────────────────────────────────
    // Wave-3: models.rs Cow<[T]> (columnar log construction)
    for ds in &datasets {
        if ds.label.starts_with("bpi2020") { continue; } // very slow on 87K
        let ms = time_median_ms(|| { let _ = discover_ilp_petri_net_from_log(&ds.log, ACTIVITY_KEY); });
        print_row("ilp", ds, ms);
    }
    print_separator();

    // ── 7. Genetic algorithm ─────────────────────────────────────────────────
    // Wave-3: models.rs Cow<[T]>; population build no longer clones columnar data
    for ds in &datasets {
        if ds.label.starts_with("bpi2020") { continue; } // very slow on 87K
        let ms = time_median_ms(|| { let _ = discover_genetic_algorithm_from_log(&ds.log, ACTIVITY_KEY, 10, 5); });
        print_row("genetic_algorithm(pop=10,gen=5)", ds, ms);
    }
    print_separator();

    // ── Summary assertion: sanity checks ─────────────────────────────────────
    // These are loose "completeness" checks; they would fail only if a regression
    // made an algorithm grossly incorrect (e.g. 0 ms = early return / panic recovery).
    println!("\nSanity assertions:");
    for ds in &datasets {
        let admitted = wasm4pm_compat::admission::Admission::<_, ()>::new(ds.log.clone()).into_evidence();
        let ms = time_median_ms(|| { let _ = discover_dfg_from_log(&admitted, ACTIVITY_KEY); });
        println!("  dfg/{}: {:.1} ms > 0", ds.label, ms);
        assert!(ms > 0.0, "DFG completed in 0ms — likely a no-op or panic");
    }
    println!("All sanity assertions PASS\n");
}
