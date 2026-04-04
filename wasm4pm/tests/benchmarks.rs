use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::state::{get_or_init_state, StoredObject};
// Discovery
use wasm4pm::discovery::{discover_dfg, discover_declare};
use wasm4pm::advanced_algorithms::{
    discover_heuristic_miner, analyze_infrequent_paths, detect_rework, detect_bottlenecks,
    compute_model_metrics,
};
use wasm4pm::ilp_discovery::{discover_ilp_petri_net, discover_optimized_dfg};
use wasm4pm::genetic_discovery::{discover_genetic_algorithm, discover_pso_algorithm};
use wasm4pm::fast_discovery::{
    discover_astar, discover_hill_climbing, analyze_trace_variants, mine_sequential_patterns,
    detect_concept_drift, cluster_traces, analyze_start_end_activities,
    analyze_activity_cooccurrence,
};
use wasm4pm::more_discovery::{
    discover_inductive_miner, discover_ant_colony, discover_simulated_annealing,
    extract_process_skeleton, analyze_activity_dependencies, analyze_case_attributes,
};
use wasm4pm::final_analytics::{
    analyze_variant_complexity, compute_activity_transition_matrix, analyze_process_speedup,
    compute_trace_similarity_matrix, analyze_temporal_bottlenecks, extract_activity_ordering,
};
use wasm4pm::analysis::{analyze_event_statistics, analyze_case_duration, analyze_dotted_chart};
use wasm4pm::conformance::check_token_based_replay;
use std::collections::HashMap;
use std::time::Instant;

// ── Event log factory ────────────────────────────────────────────────────────

/// Create an EventLog with timestamps so timestamp-sensitive functions work.
fn create_eventlog(num_cases: usize, events_per_case: usize) -> EventLog {
    let mut log = EventLog::new();
    let activities = ["Start", "A", "B", "C", "D", "End"];

    for case_id in 0..num_cases {
        let mut trace = Trace { attributes: HashMap::new(), events: Vec::new() };
        trace.attributes.insert(
            "case_id".to_string(),
            AttributeValue::String(format!("{}", case_id)),
        );

        for evt in 0..events_per_case {
            let act = activities[evt % activities.len()];
            let mut attrs = HashMap::new();
            attrs.insert("concept:name".to_string(), AttributeValue::String(act.to_string()));
            // ISO timestamp so timestamp-dependent analytics get real data
            attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::Date(format!("2024-01-01T{:02}:{:02}:00Z", evt / 60, evt % 60)),
            );
            trace.events.push(Event { attributes: attrs });
        }

        log.traces.push(trace);
    }
    log
}

fn store_log(log: EventLog) -> String {
    get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .expect("store log")
}

/// Median over N runs (ms).
fn median_ms<F: Fn()>(f: F, runs: usize) -> f64 {
    let mut t: Vec<f64> = (0..runs)
        .map(|_| { let s = Instant::now(); f(); s.elapsed().as_secs_f64() * 1000.0 })
        .collect();
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    t[t.len() / 2]
}

// ── MASTER BENCHMARK ─────────────────────────────────────────────────────────

#[test]
#[ignore]
fn benchmark_all() {
    let ak = "concept:name";
    let tk = "time:timestamp";

    let fast:  &[usize] = &[100, 1_000, 5_000, 10_000, 25_000, 50_000];
    let mid:   &[usize] = &[100, 1_000, 5_000, 10_000, 25_000];
    let slow:  &[usize] = &[100,   500, 1_000,  5_000, 10_000];
    let heavy: &[usize] = &[100,   500, 1_000,  5_000];

    println!("\n================================================================");
    println!("          wasm4pm — COMPLETE REAL BENCHMARK RESULTS");
    println!("  native Rust --release | median of 5 runs | 6 acts / 20 evts/case");
    println!("================================================================\n");

    // ── DISCOVERY ───────────────────────────────────────────────────────────

    println!("## DISCOVERY ALGORITHMS\n");

    bench_table("DFG", fast, ak, 5, |h, k| { let _ = discover_dfg(h, k); });
    bench_table("DECLARE", mid, ak, 5, |h, k| { let _ = discover_declare(h, k); });
    bench_table("Heuristic Miner (θ=0.5)", fast, ak, 5,
        |h, k| { let _ = discover_heuristic_miner(h, k, 0.5); });
    bench_table("Optimized DFG (w=0.8, s=0.2)", fast, ak, 5,
        |h, k| { let _ = discover_optimized_dfg(h, k, 0.8, 0.2); });
    bench_table("ILP Petri Net", mid, ak, 5,
        |h, k| { let _ = discover_ilp_petri_net(h, k); });
    bench_table("Inductive Miner", fast, ak, 5,
        |h, k| { let _ = discover_inductive_miner(h, k); });
    bench_table("A* Search (iter=1000)", mid, ak, 5,
        |h, k| { let _ = discover_astar(h, k, 1000); });
    bench_table("Hill Climbing", fast, ak, 5,
        |h, k| { let _ = discover_hill_climbing(h, k); });
    bench_table("Ant Colony (ants=20, iter=10)", slow, ak, 5,
        |h, k| { let _ = discover_ant_colony(h, k, 20, 10); });
    bench_table("Simulated Annealing (T=1.0, cool=0.95)", slow, ak, 5,
        |h, k| { let _ = discover_simulated_annealing(h, k, 1.0, 0.95); });
    bench_table("Process Skeleton (min_freq=2)", fast, ak, 5,
        |h, k| { let _ = extract_process_skeleton(h, k, 2); });
    bench_table("Genetic Algorithm (pop=50, gen=20)", heavy, ak, 3,
        |h, k| { let _ = discover_genetic_algorithm(h, k, 50, 20); });
    bench_table("PSO (swarm=30, iter=20)", heavy, ak, 3,
        |h, k| { let _ = discover_pso_algorithm(h, k, 30, 20); });

    // ── ANALYTICS ───────────────────────────────────────────────────────────

    println!("\n## ANALYTICS FUNCTIONS\n");

    bench_table_simple("Event Statistics", fast, 5,
        |h| { let _ = analyze_event_statistics(h); });
    bench_table_simple("Case Duration", fast, 5,
        |h| { let _ = analyze_case_duration(h); });
    bench_table_simple("Dotted Chart", fast, 5,
        |h| { let _ = analyze_dotted_chart(h); });
    bench_table("Trace Variants", fast, ak, 5,
        |h, k| { let _ = analyze_trace_variants(h, k); });
    bench_table("Sequential Patterns (sup=0.1, len=3)", mid, ak, 5,
        |h, k| { let _ = mine_sequential_patterns(h, k, 0.1, 3); });
    bench_table("Concept Drift (window=50)", mid, ak, 5,
        |h, k| { let _ = detect_concept_drift(h, k, 50); });
    bench_table("Cluster Traces (k=5)", slow, ak, 5,
        |h, k| { let _ = cluster_traces(h, k, 5); });
    bench_table("Start/End Activities", fast, ak, 5,
        |h, k| { let _ = analyze_start_end_activities(h, k); });
    bench_table("Activity Co-occurrence", mid, ak, 5,
        |h, k| { let _ = analyze_activity_cooccurrence(h, k); });
    bench_table("Infrequent Paths (θ=0.1)", fast, ak, 5,
        |h, k| { let _ = analyze_infrequent_paths(h, k, 0.1); });
    bench_table("Detect Rework", fast, ak, 5,
        |h, k| { let _ = detect_rework(h, k); });
    bench_table("Bottleneck Detection (threshold=60s)", fast, ak, 5,
        |h, k| { let _ = detect_bottlenecks(h, k, tk, 60); });
    bench_table("Model Metrics", fast, ak, 5,
        |h, k| { let _ = compute_model_metrics(h, k); });
    bench_table("Activity Dependencies", mid, ak, 5,
        |h, k| { let _ = analyze_activity_dependencies(h, k); });
    bench_table("Case Attributes", fast, ak, 5,
        |h, k| { let _ = analyze_case_attributes(h, k); });
    bench_table("Variant Complexity", mid, ak, 5,
        |h, k| { let _ = analyze_variant_complexity(h, k); });
    bench_table("Activity Transition Matrix", mid, ak, 5,
        |h, k| { let _ = compute_activity_transition_matrix(h, k); });
    bench_table("Process Speedup (window=50)", mid, ak, 5,
        |h, _k| { let _ = analyze_process_speedup(h, tk, 50); });
    bench_table("Trace Similarity Matrix", slow, ak, 5,
        |h, k| { let _ = compute_trace_similarity_matrix(h, k); });
    bench_table("Temporal Bottlenecks", mid, ak, 5,
        |h, k| { let _ = analyze_temporal_bottlenecks(h, k, tk); });
    bench_table("Activity Ordering", fast, ak, 5,
        |h, k| { let _ = extract_activity_ordering(h, k); });

    // ── CONFORMANCE ─────────────────────────────────────────────────────────

    println!("\n## CONFORMANCE CHECKING\n");
    println!("Token-Based Replay");
    println!("{:<12} {:<12} {:<10}", "Cases", "Events", "Median ms");
    println!("{}", "-".repeat(36));
    for &cases in slow {
        let log = create_eventlog(cases, 20);
        let log_h = store_log(log);
        // First discover a Petri net to replay against
        let pn_json = discover_ilp_petri_net(&log_h, ak).expect("ILP discovery");
        let pn_data: serde_json::Value = serde_json::from_str(&pn_json).unwrap();
        let pn_handle = pn_data["handle"].as_str().unwrap().to_string();
        let lh = log_h.clone();
        let ph = pn_handle.clone();
        let ms = median_ms(|| { let _ = check_token_based_replay(&lh, &ph, ak); }, 5);
        println!("{:<12} {:<12} {:.2}", cases, cases * 20, ms);
    }

    // ── I/O ─────────────────────────────────────────────────────────────────

    println!("\n## I/O & SERIALIZATION\n");
    println!("JSON Serialize / Deserialize");
    println!("{:<12} {:<12} {:<16} {:<16}", "Cases", "Events", "Serialize ms", "Deserialize ms");
    println!("{}", "-".repeat(58));
    for &cases in fast {
        let log = create_eventlog(cases, 20);
        let ser = median_ms(|| { let _ = serde_json::to_string(&log).unwrap(); }, 5);
        let json = serde_json::to_string(&log).unwrap();
        let de = median_ms(|| { let _: EventLog = serde_json::from_str(&json).unwrap(); }, 5);
        println!("{:<12} {:<12} {:<16.2} {:<16.2}", cases, cases * 20, ser, de);
    }

    // ── MEMORY ──────────────────────────────────────────────────────────────

    println!("\n## MEMORY ESTIMATES\n");
    println!("{:<12} {:<12} {:<16}", "Cases", "Events", "Est. RAM (KB)");
    println!("{}", "-".repeat(42));
    for &cases in fast {
        let log = create_eventlog(cases, 20);
        let est = (log.case_count() * 4096 + log.event_count() * 512) / 1024;
        println!("{:<12} {:<12} {}", cases, log.event_count(), est);
    }

    println!("\n================================================================\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn bench_table<F>(name: &str, sizes: &[usize], ak: &str, runs: usize, f: F)
where
    F: Fn(&str, &str),
{
    println!("{}", name);
    println!("{:<12} {:<12} {:<10}", "Cases", "Events", "Median ms");
    println!("{}", "-".repeat(36));
    for &cases in sizes {
        let h = store_log(create_eventlog(cases, 20));
        let hh = h.clone();
        let ms = median_ms(|| f(&hh, ak), runs);
        println!("{:<12} {:<12} {:.2}", cases, cases * 20, ms);
    }
    println!();
}

#[test]
#[ignore]
fn benchmark_trace_similarity() {
    let ak = "concept:name";
    let sizes: &[usize] = &[100, 500];

    println!("\nTrace Similarity Matrix (O(n²) — small sizes only)");
    println!("{:<12} {:<12} {:<10}", "Cases", "Events", "Median ms");
    println!("{}", "-".repeat(36));
    for &cases in sizes {
        let h = store_log(create_eventlog(cases, 20));
        let hh = h.clone();
        let ms = median_ms(|| { let _ = compute_trace_similarity_matrix(&hh, ak); }, 3);
        println!("{:<12} {:<12} {:.2}", cases, cases * 20, ms);
    }
}

#[test]
#[ignore]
fn benchmark_final() {
    let ak = "concept:name";
    let tk = "time:timestamp";

    let fast: &[usize] = &[100, 1_000, 5_000, 10_000, 25_000, 50_000];
    let mid:  &[usize] = &[100, 1_000, 5_000, 10_000, 25_000];
    let slow: &[usize] = &[100,   500, 1_000,  5_000, 10_000];

    println!("\n================================================================");
    println!("          wasm4pm — FINAL BENCHMARKS");
    println!("================================================================\n");

    bench_table("Temporal Bottlenecks", mid, ak, 5,
        |h, k| { let _ = analyze_temporal_bottlenecks(h, k, tk); });
    bench_table("Activity Ordering", fast, ak, 5,
        |h, k| { let _ = extract_activity_ordering(h, k); });

    println!("\n## CONFORMANCE CHECKING\n");
    println!("Token-Based Replay");
    println!("{:<12} {:<12} {:<10}", "Cases", "Events", "Median ms");
    println!("{}", "-".repeat(36));
    for &cases in slow {
        let log = create_eventlog(cases, 20);
        let log_h = store_log(log);
        let pn_json = discover_ilp_petri_net(&log_h, ak).expect("ILP discovery");
        let pn_data: serde_json::Value = serde_json::from_str(&pn_json).unwrap();
        let pn_handle = pn_data["handle"].as_str().unwrap().to_string();
        let lh = log_h.clone();
        let ph = pn_handle.clone();
        let ms = median_ms(|| { let _ = check_token_based_replay(&lh, &ph, ak); }, 5);
        println!("{:<12} {:<12} {:.2}", cases, cases * 20, ms);
    }

    println!("\n## I/O & SERIALIZATION\n");
    println!("JSON Serialize / Deserialize");
    println!("{:<12} {:<12} {:<16} {:<16}", "Cases", "Events", "Serialize ms", "Deserialize ms");
    println!("{}", "-".repeat(58));
    for &cases in fast {
        let log = create_eventlog(cases, 20);
        let ser = median_ms(|| { let _ = serde_json::to_string(&log).unwrap(); }, 5);
        let json = serde_json::to_string(&log).unwrap();
        let de = median_ms(|| { let _: EventLog = serde_json::from_str(&json).unwrap(); }, 5);
        println!("{:<12} {:<12} {:<16.2} {:<16.2}", cases, cases * 20, ser, de);
    }

    println!("\n## MEMORY ESTIMATES\n");
    println!("{:<12} {:<12} {:<16}", "Cases", "Events", "Est. RAM (KB)");
    println!("{}", "-".repeat(42));
    for &cases in fast {
        let log = create_eventlog(cases, 20);
        let est = (log.case_count() * 4096 + log.event_count() * 512) / 1024;
        println!("{:<12} {:<12} {}", cases, log.event_count(), est);
    }

    println!("\n================================================================\n");
}

#[test]
#[ignore]
fn benchmark_remaining() {
    let ak = "concept:name";
    let tk = "time:timestamp";

    let fast:  &[usize] = &[100, 1_000, 5_000, 10_000, 25_000, 50_000];
    let mid:   &[usize] = &[100, 1_000, 5_000, 10_000, 25_000];
    let slow:  &[usize] = &[100,   500, 1_000,  5_000, 10_000];

    println!("\n================================================================");
    println!("          wasm4pm — REMAINING ANALYTICS BENCHMARKS");
    println!("  native Rust --release | median of 5 runs | 6 acts / 20 evts/case");
    println!("================================================================\n");

    bench_table("Infrequent Paths (θ=0.1)", fast, ak, 5,
        |h, k| { let _ = analyze_infrequent_paths(h, k, 0.1); });
    bench_table("Detect Rework", fast, ak, 5,
        |h, k| { let _ = detect_rework(h, k); });
    bench_table("Bottleneck Detection (threshold=60s)", fast, ak, 5,
        |h, k| { let _ = detect_bottlenecks(h, k, tk, 60); });
    bench_table("Model Metrics", fast, ak, 5,
        |h, k| { let _ = compute_model_metrics(h, k); });
    bench_table("Activity Dependencies", mid, ak, 5,
        |h, k| { let _ = analyze_activity_dependencies(h, k); });
    bench_table("Case Attributes", fast, ak, 5,
        |h, k| { let _ = analyze_case_attributes(h, k); });
    bench_table("Variant Complexity", mid, ak, 5,
        |h, k| { let _ = analyze_variant_complexity(h, k); });
    bench_table("Activity Transition Matrix", mid, ak, 5,
        |h, k| { let _ = compute_activity_transition_matrix(h, k); });
    bench_table("Process Speedup (window=50)", mid, ak, 5,
        |h, _k| { let _ = analyze_process_speedup(h, tk, 50); });
    bench_table("Trace Similarity Matrix", slow, ak, 5,
        |h, k| { let _ = compute_trace_similarity_matrix(h, k); });
    bench_table("Temporal Bottlenecks", mid, ak, 5,
        |h, k| { let _ = analyze_temporal_bottlenecks(h, k, tk); });
    bench_table("Activity Ordering", fast, ak, 5,
        |h, k| { let _ = extract_activity_ordering(h, k); });

    println!("\n## CONFORMANCE CHECKING\n");
    println!("Token-Based Replay");
    println!("{:<12} {:<12} {:<10}", "Cases", "Events", "Median ms");
    println!("{}", "-".repeat(36));
    for &cases in slow {
        let log = create_eventlog(cases, 20);
        let log_h = store_log(log);
        let pn_json = discover_ilp_petri_net(&log_h, ak).expect("ILP discovery");
        let pn_data: serde_json::Value = serde_json::from_str(&pn_json).unwrap();
        let pn_handle = pn_data["handle"].as_str().unwrap().to_string();
        let lh = log_h.clone();
        let ph = pn_handle.clone();
        let ms = median_ms(|| { let _ = check_token_based_replay(&lh, &ph, ak); }, 5);
        println!("{:<12} {:<12} {:.2}", cases, cases * 20, ms);
    }

    println!("\n## I/O & SERIALIZATION\n");
    println!("JSON Serialize / Deserialize");
    println!("{:<12} {:<12} {:<16} {:<16}", "Cases", "Events", "Serialize ms", "Deserialize ms");
    println!("{}", "-".repeat(58));
    for &cases in fast {
        let log = create_eventlog(cases, 20);
        let ser = median_ms(|| { let _ = serde_json::to_string(&log).unwrap(); }, 5);
        let json = serde_json::to_string(&log).unwrap();
        let de = median_ms(|| { let _: EventLog = serde_json::from_str(&json).unwrap(); }, 5);
        println!("{:<12} {:<12} {:<16.2} {:<16.2}", cases, cases * 20, ser, de);
    }

    println!("\n## MEMORY ESTIMATES\n");
    println!("{:<12} {:<12} {:<16}", "Cases", "Events", "Est. RAM (KB)");
    println!("{}", "-".repeat(42));
    for &cases in fast {
        let log = create_eventlog(cases, 20);
        let est = (log.case_count() * 4096 + log.event_count() * 512) / 1024;
        println!("{:<12} {:<12} {}", cases, log.event_count(), est);
    }

    println!("\n================================================================\n");
}

fn bench_table_simple<F>(name: &str, sizes: &[usize], runs: usize, f: F)
where
    F: Fn(&str),
{
    println!("{}", name);
    println!("{:<12} {:<12} {:<10}", "Cases", "Events", "Median ms");
    println!("{}", "-".repeat(36));
    for &cases in sizes {
        let h = store_log(create_eventlog(cases, 20));
        let hh = h.clone();
        let ms = median_ms(|| f(&hh), runs);
        println!("{:<12} {:<12} {:.2}", cases, cases * 20, ms);
    }
    println!();
}
