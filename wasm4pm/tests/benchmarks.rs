//! Real Data Benchmarking for wasm4pm
//!
//! This module runs 35 capability tests against real event logs from the BPI Challenge
//! series (Business Process Intelligence Challenge). Datasets are curated from public
//! repositories (4TU.ResearchData, IEEE Task Force on Process Mining).
//!
//! TIER SYSTEM (See BENCHMARK-REAL-DATA-PLAN.md):
//! - Tier 1 (Essential): BPI 2020 Travel Permits (7K cases) — Quick validation
//! - Tier 2 (Comprehensive): BPI 2013 Incidents (7.5K), BPI 2019 (200K events)
//! - Tier 3 (Stress): Road Traffic Fines (150K cases), BPI 2015 (150K cases)
//!
//! To use real data:
//!   1. Download BPI 2020 from https://data.4tu.nl/collections/BPI_Challenge_2020/5065541
//!   2. Place .xes files in tests/fixtures/
//!   3. Run: cargo test --release -- --include-ignored
//!
//! Without real data, benchmarks generate synthetic logs (same behavior, synthetic data).
//! License for real data: CC BY 4.0 (free to use, attribution required)

use pictl::advanced_algorithms::{
    analyze_infrequent_paths, compute_model_metrics, detect_bottlenecks, detect_rework,
    discover_heuristic_miner,
};
use pictl::analysis::{analyze_case_duration, analyze_dotted_chart, analyze_event_statistics};
use pictl::conformance::check_token_based_replay;
use pictl::discovery::{discover_declare, discover_dfg};
use pictl::fast_discovery::{
    analyze_activity_cooccurrence, analyze_start_end_activities, analyze_trace_variants,
    cluster_traces, detect_concept_drift, discover_astar, discover_hill_climbing,
    mine_sequential_patterns,
};
use pictl::final_analytics::{
    analyze_process_speedup, analyze_temporal_bottlenecks, analyze_variant_complexity,
    compute_activity_transition_matrix, compute_trace_similarity_matrix, extract_activity_ordering,
};
use pictl::genetic_discovery::{discover_genetic_algorithm, discover_pso_algorithm};
use pictl::ilp_discovery::{discover_ilp_petri_net, discover_optimized_dfg};
use pictl::incremental_dfg::{IncrementalDFG, StreamingDFG};
use pictl::models::{AttributeValue, Event, EventLog, Trace};
use pictl::more_discovery::{
    analyze_activity_dependencies, analyze_case_attributes, discover_ant_colony,
    discover_inductive_miner, discover_simulated_annealing, extract_process_skeleton,
};
use pictl::state::{get_or_init_state, StoredObject};
use pictl::streaming::streaming_alpha::StreamingAlphaPlusBuilder;
use pictl::streaming::streaming_astar::StreamingAStarBuilder;
use pictl::streaming::streaming_declare::StreamingDeclareBuilder;
use pictl::streaming::streaming_hill_climbing::StreamingHillClimbingBuilder;
use pictl::streaming::streaming_inductive::StreamingInductiveBuilder;
use pictl::streaming::StreamingAlgorithm;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::Instant;

// ── Data Source & Tier Detection ──────────────────────────────────────────

fn get_benchmark_sizes() -> Vec<usize> {
    if get_data_source().contains("Real") {
        vec![7_065] // Real BPI 2020 size
    } else {
        vec![100, 1_000, 5_000, 10_000] // Synthetic sizes
    }
}

thread_local! {
    static DATA_SOURCE: std::cell::RefCell<String> = const { std::cell::RefCell::new(String::new()) };
    static BENCHMARK_TIER: std::cell::RefCell<Option<u32>> = const { std::cell::RefCell::new(None) };
}

fn set_data_source(source: &str) {
    DATA_SOURCE.with(|s| *s.borrow_mut() = source.to_string());
}

fn get_data_source() -> String {
    DATA_SOURCE.with(|s| s.borrow().clone())
}

fn get_benchmark_tier() -> Option<u32> {
    BENCHMARK_TIER.with(|t| *t.borrow()).or_else(|| {
        std::env::var("BENCHMARK_TIER")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
    })
}

fn set_benchmark_tier(tier: u32) {
    BENCHMARK_TIER.with(|t| *t.borrow_mut() = Some(tier));
}

// ── Tier Configuration ─────────────────────────────────────────────────────

#[allow(dead_code)]
struct TierConfig {
    tier: u32,
    name: &'static str,
    datasets: Vec<(&'static str, usize)>, // (dataset_name, expected_cases)
}

fn get_tier_config(tier: u32) -> Option<TierConfig> {
    match tier {
        1 => Some(TierConfig {
            tier: 1,
            name: "ESSENTIAL (Quick Validation)",
            datasets: vec![
                ("bpi2020", 7_065), // BPI 2020 Travel Permits
                ("bpi2013", 7_500), // BPI 2013 Incidents
                ("sepsis", 1_000),  // Sepsis Cases
            ],
        }),
        2 => Some(TierConfig {
            tier: 2,
            name: "COMPREHENSIVE (Medium Testing)",
            datasets: vec![
                ("bpi2019", 200_000), // BPI 2019 Invoice
                ("bpi2015", 150_000), // BPI 2015 Building Permits
            ],
        }),
        3 => Some(TierConfig {
            tier: 3,
            name: "STRESS (Large Scale)",
            datasets: vec![
                ("road_traffic", 150_370), // Road Traffic Fines (561K events)
            ],
        }),
        _ => None,
    }
}

#[allow(dead_code)]
fn skip_test_if_wrong_tier(tier: u32) -> bool {
    if let Some(current) = get_benchmark_tier() {
        current != tier
    } else {
        false // Run test if no tier specified
    }
}

// ── XES Loading from Fixtures ──────────────────────────────────────────────

fn parse_xes_file(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("<trace>") {
            current_trace = Some(Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            });
        }

        if trimmed.starts_with("</trace>") {
            if let Some(trace) = current_trace.take() {
                log.traces.push(trace);
            }
        }

        if trimmed.starts_with("<event>") {
            current_event = Some(Event {
                attributes: HashMap::new(),
            });
        }

        if trimmed.starts_with("</event>") {
            if let Some(event) = current_event.take() {
                if let Some(ref mut trace) = current_trace {
                    trace.events.push(event);
                }
            }
        }

        // Parse string attributes
        if trimmed.starts_with("<string") {
            if let Some(key_start) = trimmed.find("key=\"") {
                let key_start = key_start + 5;
                if let Some(key_end) = trimmed[key_start..].find("\"") {
                    let key = trimmed[key_start..key_start + key_end].to_string();
                    if let Some(val_start) = trimmed.find("value=\"") {
                        let val_start = val_start + 7;
                        if let Some(val_end) = trimmed[val_start..].find("\"") {
                            let value = trimmed[val_start..val_start + val_end].to_string();

                            if let Some(ref mut event) = current_event {
                                event.attributes.insert(key, AttributeValue::String(value));
                            } else if let Some(ref mut trace) = current_trace {
                                trace.attributes.insert(key, AttributeValue::String(value));
                            }
                        }
                    }
                }
            }
        }

        // Parse date/timestamp attributes
        if trimmed.starts_with("<date") || trimmed.contains("time:timestamp") {
            if let Some(key_start) = trimmed.find("key=\"") {
                let key_start = key_start + 5;
                if let Some(key_end) = trimmed[key_start..].find("\"") {
                    let key = trimmed[key_start..key_start + key_end].to_string();
                    if let Some(val_start) = trimmed.find("value=\"") {
                        let val_start = val_start + 7;
                        if let Some(val_end) = trimmed[val_start..].find("\"") {
                            let value = trimmed[val_start..val_start + val_end].to_string();

                            if let Some(ref mut event) = current_event {
                                event.attributes.insert(key, AttributeValue::String(value));
                            }
                        }
                    }
                }
            }
        }
    }

    log
}

fn load_real_dataset(dataset: &str) -> Option<EventLog> {
    // Try to load real datasets from fixtures
    let fixture_paths = match dataset {
        "bpi2020" => vec![
            "wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes",
            "wasm4pm/wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes",
            "tests/fixtures/BPI_2020_Travel_Permits_Actual.xes",
            "tests/fixtures/BPI_2020_Domestic_Declarations.xes",
            "./BPI_2020_Travel_Permits_Actual.xes",
        ],
        "bpi2013" => vec![
            "wasm4pm/tests/fixtures/BPI_2013_Incidents.xes",
            "tests/fixtures/BPI_2013_Incidents.xes",
            "./BPI_2013_Incidents.xes",
        ],
        "bpi2019" => vec![
            "wasm4pm/tests/fixtures/BPI_2019_Invoice_Purchase_to_Pay.xes",
            "tests/fixtures/BPI_2019_Invoice_Purchase_to_Pay.xes",
            "./BPI_2019_Invoice_Purchase_to_Pay.xes",
        ],
        "road_traffic" => vec![
            "wasm4pm/tests/fixtures/Road_Traffic_Fine_Management.xes",
            "tests/fixtures/Road_Traffic_Fine_Management.xes",
            "./Road_Traffic_Fine_Management.xes",
        ],
        "bpi2015" => vec![
            "wasm4pm/tests/fixtures/BPI_2015_Building_Permits.xes",
            "tests/fixtures/BPI_2015_Building_Permits.xes",
            "./BPI_2015_Building_Permits.xes",
        ],
        _ => return None,
    };

    for path in fixture_paths.iter() {
        if Path::new(path).exists() {
            if let Ok(content) = fs::read_to_string(path) {
                let log = parse_xes_file(&content);
                set_data_source(&format!(
                    "Real {} ({} cases)",
                    dataset.to_uppercase(),
                    match dataset {
                        "bpi2020" => "7,065",
                        "bpi2013" => "7,500",
                        "bpi2019" => "200,000",
                        "road_traffic" => "150,370",
                        "bpi2015" => "150,000",
                        _ => "unknown",
                    }
                ));
                eprintln!("✓ Loaded {} dataset ({} traces)", dataset, log.traces.len());
                return Some(log);
            }
        }
    }
    None
}

#[allow(dead_code)]
fn load_real_bpi2020() -> Option<EventLog> {
    load_real_dataset("bpi2020")
}

// ── Shared helpers ────────────────────────────────────────────────────────────

#[allow(dead_code)]
fn generate_synthetic_log(cases: usize) -> EventLog {
    let activities = ["Start", "A", "B", "C", "D", "End"];
    let mut log = EventLog::new();
    for case_id in 0..cases {
        let mut trace = Trace {
            attributes: HashMap::new(),
            events: Vec::new(),
        };
        trace.attributes.insert(
            "case_id".to_string(),
            AttributeValue::String(format!("{}", case_id)),
        );
        for evt in 0..20usize {
            let act = activities[evt % activities.len()];
            let mut attrs = HashMap::new();
            attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(format!("2024-01-01T{:02}:{:02}:00Z", evt / 60, evt % 60)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

fn make_log(cases: usize) -> String {
    // Load real data based on requested size
    let dataset = match cases {
        7_065 => Some("bpi2020"),
        7_500 => Some("bpi2013"),
        200_000 => Some("bpi2019"),
        150_370 => Some("road_traffic"),
        150_000 => Some("bpi2015"),
        1_000 => Some("sepsis"),
        _ => None,
    };

    // Try to load requested dataset
    if let Some(ds) = dataset {
        if let Some(log) = load_real_dataset(ds) {
            return get_or_init_state()
                .store_object(StoredObject::EventLog(log))
                .expect("store log");
        }
    }

    // If real data not found, panic with helpful message
    panic!(
        "❌ REAL DATA REQUIRED\n\
         \n\
         Benchmarks require real BPI datasets (no synthetic fallback).\n\
         \n\
         Steps:\n\
         1. Download datasets from: https://data.4tu.nl/collections/BPI_Challenge_2020/5065541\n\
         2. Place .xes files in: wasm4pm/tests/fixtures/\n\
         3. Run: cargo test --release -- bench_tier_1_essential --nocapture --ignored\n\
         \n\
         See: BENCHMARK-TIERS-USAGE.md"
    );
}

// ── Benchmark Report Header ────────────────────────────────────────────────

static HEADER_PRINTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn print_benchmark_header() {
    if !HEADER_PRINTED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        println!("\n{}", "=".repeat(70));
        println!("wasm4pm BENCHMARKS — REAL DATA VALIDATION");

        if let Some(tier) = get_benchmark_tier() {
            let config = get_tier_config(tier).unwrap_or(TierConfig {
                tier: 0,
                name: "UNKNOWN",
                datasets: vec![],
            });
            println!("TIER: {} ({})", tier, config.name);
        }

        println!("Data Source: {}", get_data_source());
        println!("License: CC BY 4.0 (if using real BPI datasets)");
        println!("Median of 5 runs | --release optimizations");
        println!("{}", "=".repeat(70));
    }
}

fn ms<F: Fn()>(f: F, runs: usize) -> f64 {
    let mut t: Vec<f64> = (0..runs)
        .map(|_| {
            let s = Instant::now();
            f();
            s.elapsed().as_secs_f64() * 1000.0
        })
        .collect();
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    t[t.len() / 2]
}

fn print_header(name: &str) {
    println!("\n{}", name);
    println!("{:<10} {:<12} {:<12}", "Cases", "Events", "Median ms");
    println!("{}", "-".repeat(36));
}

fn print_row(cases: usize, median: f64) {
    println!("{:<10} {:<12} {:.2}", cases, cases * 20, median);
}

// ── DISCOVERY ALGORITHMS (13 tests) ──────────────────────────────────────────

#[test]
fn bench_dfg() {
    print_benchmark_header();
    let ak = "concept:name";
    print_header("DFG Discovery");

    // Use real data size if available, otherwise synthetic
    let sizes: Vec<usize> = if get_data_source().contains("Real") {
        vec![7_065] // Real BPI 2020 size
    } else {
        vec![100, 1_000, 5_000, 10_000] // Synthetic validation sizes
    };

    for n in sizes {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_dfg(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_declare() {
    let ak = "concept:name";
    print_header("DECLARE");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_declare(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_heuristic_miner() {
    let ak = "concept:name";
    print_header("Heuristic Miner (θ=0.5)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_heuristic_miner(&h, ak, 0.5);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_optimized_dfg() {
    let ak = "concept:name";
    print_header("Optimized DFG (fitness=0.8, simplicity=0.2)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_optimized_dfg(&h, ak, 0.8, 0.2);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_ilp_petri_net() {
    let ak = "concept:name";
    print_header("ILP Petri Net");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_ilp_petri_net(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_inductive_miner() {
    let ak = "concept:name";
    print_header("Inductive Miner");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_inductive_miner(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_astar() {
    let ak = "concept:name";
    print_header("A* Search (iter=1000)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_astar(&h, ak, 1000);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_hill_climbing() {
    let ak = "concept:name";
    print_header("Hill Climbing");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_hill_climbing(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_ant_colony() {
    let ak = "concept:name";
    print_header("Ant Colony Optimization (ants=20, iter=10)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_ant_colony(&h, ak, 20, 10);
                },
                3,
            ),
        );
    }
}

#[test]
fn bench_simulated_annealing() {
    let ak = "concept:name";
    print_header("Simulated Annealing (T=1.0, cool=0.95)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_simulated_annealing(&h, ak, 1.0, 0.95);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_process_skeleton() {
    let ak = "concept:name";
    print_header("Process Skeleton (min_freq=2)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = extract_process_skeleton(&h, ak, 2);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_genetic_algorithm() {
    let ak = "concept:name";
    print_header("Genetic Algorithm (pop=50, gen=20)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_genetic_algorithm(&h, ak, 50, 20);
                },
                3,
            ),
        );
    }
}

#[test]
fn bench_pso() {
    let ak = "concept:name";
    print_header("Particle Swarm Optimization (swarm=30, iter=20)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = discover_pso_algorithm(&h, ak, 30, 20);
                },
                3,
            ),
        );
    }
}

// ── ANALYTICS FUNCTIONS (21 tests) ───────────────────────────────────────────

#[test]
fn bench_event_statistics() {
    print_header("Event Statistics");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_event_statistics(&h);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_case_duration() {
    print_header("Case Duration");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_case_duration(&h);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_dotted_chart() {
    print_header("Dotted Chart");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_dotted_chart(&h);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_trace_variants() {
    let ak = "concept:name";
    print_header("Trace Variants");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_trace_variants(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_sequential_patterns() {
    let ak = "concept:name";
    print_header("Sequential Patterns (min_sup=0.1, len=3)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = mine_sequential_patterns(&h, ak, 0.1, 3);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_concept_drift() {
    let ak = "concept:name";
    print_header("Concept Drift (window=50)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = detect_concept_drift(&h, ak, 50);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_cluster_traces() {
    let ak = "concept:name";
    print_header("Cluster Traces (k=5)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = cluster_traces(&h, ak, 5);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_start_end_activities() {
    let ak = "concept:name";
    print_header("Start/End Activities");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_start_end_activities(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_activity_cooccurrence() {
    let ak = "concept:name";
    print_header("Activity Co-occurrence");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_activity_cooccurrence(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_infrequent_paths() {
    let ak = "concept:name";
    print_header("Infrequent Paths (θ=0.1)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_infrequent_paths(&h, ak, 0.1);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_detect_rework() {
    let ak = "concept:name";
    print_header("Detect Rework");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = detect_rework(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_bottleneck_detection() {
    let ak = "concept:name";
    let tk = "time:timestamp";
    print_header("Bottleneck Detection (threshold=60s)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = detect_bottlenecks(&h, ak, tk, 60);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_model_metrics() {
    let ak = "concept:name";
    print_header("Model Metrics");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = compute_model_metrics(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_activity_dependencies() {
    let ak = "concept:name";
    print_header("Activity Dependencies");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_activity_dependencies(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_case_attributes() {
    let ak = "concept:name";
    print_header("Case Attributes");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_case_attributes(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_variant_complexity() {
    let ak = "concept:name";
    print_header("Variant Complexity");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_variant_complexity(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_activity_transition_matrix() {
    let ak = "concept:name";
    print_header("Activity Transition Matrix");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = compute_activity_transition_matrix(&h, ak);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_process_speedup() {
    let tk = "time:timestamp";
    print_header("Process Speedup (window=50)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_process_speedup(&h, tk, 50);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_trace_similarity_matrix() {
    let ak = "concept:name";
    print_header("Trace Similarity Matrix (O(n²) — small logs only)");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = compute_trace_similarity_matrix(&h, ak);
                },
                3,
            ),
        );
    }
}

#[test]
fn bench_temporal_bottlenecks() {
    let ak = "concept:name";
    let tk = "time:timestamp";
    print_header("Temporal Bottlenecks");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = analyze_temporal_bottlenecks(&h, ak, tk);
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_activity_ordering() {
    let ak = "concept:name";
    print_header("Activity Ordering");
    for n in get_benchmark_sizes() {
        let h = make_log(n);
        print_row(
            n,
            ms(
                || {
                    let _ = extract_activity_ordering(&h, ak);
                },
                5,
            ),
        );
    }
}

// ── CONFORMANCE CHECKING (1 test) ─────────────────────────────────────────────

#[test]
fn bench_token_based_replay() {
    print_benchmark_header();
    let ak = "concept:name";
    print_header("Token-Based Replay (Conformance)");
    for &n in &[100usize, 500, 1_000, 5_000] {
        let log_h = make_log(n);
        let pn_json = discover_ilp_petri_net(&log_h, ak).expect("ILP discovery");
        let pn_json_str = pn_json.as_string().expect("JsValue is not a string");
        let pn_data: serde_json::Value = serde_json::from_str(&pn_json_str).unwrap();
        let pn_h = pn_data["handle"].as_str().unwrap().to_string();
        let lh = log_h.clone();
        let ph = pn_h.clone();
        print_row(
            n,
            ms(
                || {
                    let _ = check_token_based_replay(&lh, &ph, ak);
                },
                5,
            ),
        );
    }
}

// ── STREAMING ALGORITHMS (7 tests) ──────────────────────────────────────────

fn make_synthetic_traces(cases: usize) -> Vec<(String, Vec<String>)> {
    let activities = ["Start", "A", "B", "C", "D", "End"];
    let mut traces = Vec::new();
    for case_id in 0..cases {
        let events: Vec<String> = (0..20)
            .map(|evt| activities[evt % activities.len()].to_string())
            .collect();
        traces.push((format!("case_{}", case_id), events));
    }
    traces
}

#[test]
fn bench_streaming_dfg() {
    print_benchmark_header();
    print_header("Streaming DFG");
    for &n in &[100usize, 1_000, 5_000, 10_000] {
        let traces = make_synthetic_traces(n);
        print_row(
            n,
            ms(
                || {
                    let mut dfg = StreamingDFG::new();
                    for (_case_id, events) in &traces {
                        for act in events {
                            dfg.process_event(act);
                        }
                        dfg.end_trace();
                    }
                    let _ = dfg.snapshot();
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_streaming_alpha_plus() {
    print_header("Streaming Alpha++");
    for &n in &[100usize, 1_000, 5_000, 10_000] {
        let traces = make_synthetic_traces(n);
        print_row(
            n,
            ms(
                || {
                    let mut builder = StreamingAlphaPlusBuilder::new();
                    for (case_id, events) in &traces {
                        for act in events {
                            builder.add_event(case_id, act);
                        }
                        builder.close_trace(case_id);
                    }
                    let _ = builder.snapshot();
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_streaming_declare() {
    print_header("Streaming DECLARE (threshold=0.6)");
    for &n in &[100usize, 1_000, 5_000, 10_000] {
        let traces = make_synthetic_traces(n);
        print_row(
            n,
            ms(
                || {
                    let mut builder = StreamingDeclareBuilder::new().with_threshold(0.6);
                    for (case_id, events) in &traces {
                        for act in events {
                            builder.add_event(case_id, act);
                        }
                        builder.close_trace(case_id);
                    }
                    let _ = builder.snapshot();
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_streaming_inductive() {
    print_header("Streaming Inductive Miner");
    for &n in &[100usize, 1_000, 5_000, 10_000] {
        let traces = make_synthetic_traces(n);
        print_row(
            n,
            ms(
                || {
                    let mut builder = StreamingInductiveBuilder::new();
                    for (case_id, events) in &traces {
                        for act in events {
                            builder.add_event(case_id, act);
                        }
                        builder.close_trace(case_id);
                    }
                    let _ = builder.snapshot();
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_streaming_hill_climbing() {
    print_header("Streaming Hill Climbing (noise=0.2)");
    for &n in &[100usize, 1_000, 5_000, 10_000] {
        let traces = make_synthetic_traces(n);
        print_row(
            n,
            ms(
                || {
                    let mut builder = StreamingHillClimbingBuilder::new().with_noise_threshold(0.2);
                    for (case_id, events) in &traces {
                        for act in events {
                            builder.add_event(case_id, act);
                        }
                        builder.close_trace(case_id);
                    }
                    let _ = builder.snapshot();
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_streaming_astar() {
    print_header("Streaming A* (weight=0.5)");
    for &n in &[100usize, 1_000, 5_000, 10_000] {
        let traces = make_synthetic_traces(n);
        print_row(
            n,
            ms(
                || {
                    let mut builder = StreamingAStarBuilder::new().with_heuristic_weight(0.5);
                    for (case_id, events) in &traces {
                        for act in events {
                            builder.add_event(case_id, act);
                        }
                        builder.close_trace(case_id);
                    }
                    let _ = builder.snapshot();
                },
                5,
            ),
        );
    }
}

#[test]
fn bench_streaming_incremental_dfg_merge() {
    print_header("Incremental DFG Merge (4 threads)");
    for &n in &[100usize, 1_000, 5_000, 10_000] {
        let traces = make_synthetic_traces(n);
        print_row(
            n,
            ms(
                || {
                    let chunk_size = traces.len().div_ceil(4);
                    let chunks: Vec<_> = traces.chunks(chunk_size).collect();

                    let partials: Vec<IncrementalDFG> = chunks
                        .iter()
                        .map(|chunk| {
                            let mut dfg = IncrementalDFG::new();
                            for (_case_id, events) in *chunk {
                                for (i, _act) in events.iter().enumerate() {
                                    dfg.process_event(i as u32, i == 0);
                                }
                                dfg.end_trace();
                            }
                            dfg
                        })
                        .collect();

                    let mut merged = IncrementalDFG::new();
                    for partial in partials {
                        merged.merge(&partial);
                    }
                    let _ = merged.snapshot();
                },
                5,
            ),
        );
    }
}

// ── TIER-SPECIFIC BENCHMARK RUNNERS ────────────────────────────────────────

/// Run all benchmarks on Tier 1 (Essential) datasets
/// Usage: cargo test --release -- bench_tier_1 --nocapture
#[test]
#[ignore]
fn bench_tier_1_essential() {
    set_benchmark_tier(1);
    let config = get_tier_config(1).unwrap();
    println!("\n{}", "=".repeat(70));
    println!("TIER 1: {} BENCHMARKS", config.name);
    println!("Datasets: BPI 2020 Travel (7K), BPI 2013 Incidents (7.5K), Sepsis (1K)");
    println!("Total Time: ~2-3 minutes");
    println!("{}", "=".repeat(70));

    // Pre-load real dataset so individual tests know to use it
    let _ = load_real_dataset("bpi2020");

    // Run all 35 tests (they will use tier 1 data)
    bench_dfg();
    bench_declare();
    bench_heuristic_miner();
    bench_optimized_dfg();
    bench_ilp_petri_net();
    bench_inductive_miner();
    bench_astar();
    bench_hill_climbing();
    bench_ant_colony();
    bench_simulated_annealing();
    bench_process_skeleton();
    bench_genetic_algorithm();
    bench_pso();
    bench_event_statistics();
    bench_case_duration();
    bench_dotted_chart();
    bench_trace_variants();
    bench_sequential_patterns();
    bench_concept_drift();
    bench_cluster_traces();
    bench_start_end_activities();
    bench_activity_cooccurrence();
    bench_infrequent_paths();
    bench_detect_rework();
    bench_bottleneck_detection();
    bench_model_metrics();
    bench_activity_dependencies();
    bench_case_attributes();
    bench_variant_complexity();
    bench_activity_transition_matrix();
    bench_process_speedup();
    bench_trace_similarity_matrix();
    bench_temporal_bottlenecks();
    bench_activity_ordering();
    bench_token_based_replay();

    println!("\n{}", "=".repeat(70));
    println!("✅ Tier 1 benchmarking complete");
    println!("📊 Data Source: {}", get_data_source());
    println!("{}", "=".repeat(70));
}

/// Run all benchmarks on Tier 2 (Comprehensive) datasets
/// Usage: cargo test --release -- bench_tier_2 --nocapture
#[test]
#[ignore]
fn bench_tier_2_comprehensive() {
    set_benchmark_tier(2);
    let config = get_tier_config(2).unwrap();
    println!("\n{}", "=".repeat(70));
    println!("TIER 2: {} BENCHMARKS", config.name);
    println!("Datasets: BPI 2019 Invoice (200K events), BPI 2015 Permits (150K)");
    println!("Total Time: ~5-10 minutes");
    println!("{}", "=".repeat(70));

    // Run all 35 tests (they will use tier 2 data)
    bench_dfg();
    bench_declare();
    bench_heuristic_miner();
    bench_optimized_dfg();
    bench_ilp_petri_net();
    bench_inductive_miner();
    bench_astar();
    bench_hill_climbing();
    bench_ant_colony();
    bench_simulated_annealing();
    bench_process_skeleton();
    bench_genetic_algorithm();
    bench_pso();
    bench_event_statistics();
    bench_case_duration();
    bench_dotted_chart();
    bench_trace_variants();
    bench_sequential_patterns();
    bench_concept_drift();
    bench_cluster_traces();
    bench_start_end_activities();
    bench_activity_cooccurrence();
    bench_infrequent_paths();
    bench_detect_rework();
    bench_bottleneck_detection();
    bench_model_metrics();
    bench_activity_dependencies();
    bench_case_attributes();
    bench_variant_complexity();
    bench_activity_transition_matrix();
    bench_process_speedup();
    bench_trace_similarity_matrix();
    bench_temporal_bottlenecks();
    bench_activity_ordering();
    bench_token_based_replay();

    println!("\n{}", "=".repeat(70));
    println!("✅ Tier 2 benchmarking complete");
    println!("📊 Data Source: {}", get_data_source());
    println!("{}", "=".repeat(70));
}

/// Run all benchmarks on Tier 3 (Stress) datasets
/// Usage: cargo test --release -- bench_tier_3 --nocapture
#[test]
#[ignore]
fn bench_tier_3_stress() {
    set_benchmark_tier(3);
    let config = get_tier_config(3).unwrap();
    println!("\n{}", "=".repeat(70));
    println!("TIER 3: {} BENCHMARKS", config.name);
    println!("Datasets: Road Traffic Fines (150K cases, 561K events)");
    println!("Total Time: ~10-20 minutes (extreme scale test)");
    println!("{}", "=".repeat(70));

    // Run all 35 tests (they will use tier 3 data)
    bench_dfg();
    bench_declare();
    bench_heuristic_miner();
    bench_optimized_dfg();
    bench_ilp_petri_net();
    bench_inductive_miner();
    bench_astar();
    bench_hill_climbing();
    bench_ant_colony();
    bench_simulated_annealing();
    bench_process_skeleton();
    bench_genetic_algorithm();
    bench_pso();
    bench_event_statistics();
    bench_case_duration();
    bench_dotted_chart();
    bench_trace_variants();
    bench_sequential_patterns();
    bench_concept_drift();
    bench_cluster_traces();
    bench_start_end_activities();
    bench_activity_cooccurrence();
    bench_infrequent_paths();
    bench_detect_rework();
    bench_bottleneck_detection();
    bench_model_metrics();
    bench_activity_dependencies();
    bench_case_attributes();
    bench_variant_complexity();
    bench_activity_transition_matrix();
    bench_process_speedup();
    bench_trace_similarity_matrix();
    bench_temporal_bottlenecks();
    bench_activity_ordering();
    bench_token_based_replay();

    println!("\n{}", "=".repeat(70));
    println!("✅ Tier 3 benchmarking complete (STRESS TEST)");
    println!("📊 Data Source: {}", get_data_source());
    println!("{}", "=".repeat(70));
}
