//! Quick batch vs streaming comparison using synthetic data.
//! Run: cargo test --test bench_compare -- --nocapture

use std::collections::HashMap;
use std::time::Instant;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::state::{get_or_init_state, StoredObject};
use wasm4pm::discovery::discover_dfg;
use wasm4pm::more_discovery::discover_inductive_miner;
use wasm4pm::fast_discovery::{discover_astar, discover_hill_climbing};
use wasm4pm::streaming::StreamingAlgorithm;
use wasm4pm::streaming::streaming_alpha::StreamingAlphaPlusBuilder;
use wasm4pm::streaming::streaming_declare::StreamingDeclareBuilder;
use wasm4pm::streaming::streaming_inductive::StreamingInductiveBuilder;
use wasm4pm::streaming::streaming_hill_climbing::StreamingHillClimbingBuilder;
use wasm4pm::streaming::streaming_noise_filtered_dfg::StreamingNoiseFilteredDfgBuilder;
use wasm4pm::streaming::streaming_astar::StreamingAStarBuilder;
use wasm4pm::incremental_dfg::{IncrementalDFG, StreamingDFG};

fn make_log(cases: usize) -> String {
    let activities = ["Start", "A", "B", "C", "D", "End"];
    let mut log = EventLog::new();
    for case_id in 0..cases {
        let mut trace = Trace { attributes: HashMap::new(), events: Vec::new() };
        trace.attributes.insert("case_id".to_string(), AttributeValue::String(format!("{}", case_id)));
        for evt in 0..20usize {
            let act = activities[evt % activities.len()];
            let mut attrs = HashMap::new();
            attrs.insert("concept:name".to_string(), AttributeValue::String(act.to_string()));
            attrs.insert("time:timestamp".to_string(), AttributeValue::String(format!("2024-01-01T{:02}:{:02}:00Z", evt / 60, evt % 60)));
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    get_or_init_state().store_object(StoredObject::EventLog(log)).expect("store")
}

fn make_traces(cases: usize) -> Vec<(String, Vec<String>)> {
    let activities = ["Start", "A", "B", "C", "D", "End"];
    let mut traces = Vec::new();
    for case_id in 0..cases {
        let events: Vec<String> = (0..20).map(|e| activities[e % activities.len()].to_string()).collect();
        traces.push((format!("case_{}", case_id), events));
    }
    traces
}

fn ms<F: Fn()>(f: F, runs: usize) -> f64 {
    let mut t: Vec<f64> = (0..runs).map(|_| { let s = Instant::now(); f(); s.elapsed().as_secs_f64() * 1000.0 }).collect();
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    t[t.len() / 2]
}

fn fmt_ratio(ratio: f64) -> String {
    format!("{:.2}x", ratio)
}

#[test]
fn compare_batch_vs_streaming() {
    let ak = "concept:name";
    let sizes = [100usize, 1_000, 5_000, 10_000];

    println!("\n{}", "=".repeat(76));
    println!("BATCH vs STREAMING — Synthetic Data (20 events/case, 6 activities)");
    println!("Median of 5 runs | Debug build");
    println!("{}", "=".repeat(76));

    for &n in &sizes {
        println!("\n--- {} cases / {} events ---", n, n * 20);

        // Batch Algorithms
        let h = make_log(n);
        let batch_dfg = ms(|| { let _ = discover_dfg(&h, ak); }, 5);
        let batch_astar = ms(|| { let _ = discover_astar(&h, ak, 1000); }, 5);
        let batch_hc = ms(|| { let _ = discover_hill_climbing(&h, ak); }, 5);
        let batch_ind = ms(|| { let _ = discover_inductive_miner(&h, ak); }, 5);

        // Streaming Algorithms
        let traces = make_traces(n);

        let stream_dfg = ms(|| {
            let mut b = StreamingDFG::new();
            for (cid, evts) in &traces { for a in evts { b.process_event(a); } b.end_trace(); }
            let _ = b.snapshot();
        }, 5);

        let stream_alpha = ms(|| {
            let mut b = StreamingAlphaPlusBuilder::new();
            for (cid, evts) in &traces { for a in evts { b.add_event(cid, a); } b.close_trace(cid); }
            let _ = b.snapshot();
        }, 5);

        let stream_declare = ms(|| {
            let mut b = StreamingDeclareBuilder::new().with_threshold(0.6);
            for (cid, evts) in &traces { for a in evts { b.add_event(cid, a); } b.close_trace(cid); }
            let _ = b.snapshot();
        }, 5);

        let stream_inductive = ms(|| {
            let mut b = StreamingInductiveBuilder::new();
            for (cid, evts) in &traces { for a in evts { b.add_event(cid, a); } b.close_trace(cid); }
            let _ = b.snapshot();
        }, 5);

        let stream_hc = ms(|| {
            let mut b = StreamingHillClimbingBuilder::new();
            for (cid, evts) in &traces { for a in evts { b.add_event(cid, a); } b.close_trace(cid); }
            let _ = b.snapshot();
        }, 5);

        let stream_noise = ms(|| {
            let mut b = StreamingNoiseFilteredDfgBuilder::new().with_noise_threshold(0.2);
            for (cid, evts) in &traces { for a in evts { b.add_event(cid, a); } b.close_trace(cid); }
            let _ = b.snapshot();
        }, 5);

        let stream_astar = ms(|| {
            let mut b = StreamingAStarBuilder::new().with_heuristic_weight(0.5);
            for (cid, evts) in &traces { for a in evts { b.add_event(cid, a); } b.close_trace(cid); }
            let _ = b.snapshot();
        }, 5);

        let inc_dfg = ms(|| {
            let mut d = IncrementalDFG::new();
            for (cid, evts) in &traces { for (i, _a) in evts.iter().enumerate() { d.process_event(i as u32, i == 0); } d.end_trace(); }
            let _ = d.snapshot();
        }, 5);

        println!("\n{:<32} {:>10} {:>10}", "Algorithm", "ms", "vs Batch");
        println!("{}", "-".repeat(54));
        println!("{:<32} {:>10.2} {:>10}", "Batch DFG (baseline)", batch_dfg, "1.00x");
        println!("{:<32} {:>10.2} {:>10}", format!("Batch A* (1000 iter)"), batch_astar, fmt_ratio(batch_dfg / batch_astar));
        println!("{:<32} {:>10.2} {:>10}", "Batch Hill Climbing", batch_hc, fmt_ratio(batch_dfg / batch_hc));
        println!("{:<32} {:>10.2} {:>10}", "Batch Inductive Miner", batch_ind, fmt_ratio(batch_dfg / batch_ind));
        println!("{}", "-".repeat(54));
        println!("{:<32} {:>10.2} {:>10}", "Streaming DFG", stream_dfg, fmt_ratio(batch_dfg / stream_dfg));
        println!("{:<32} {:>10.2} {:>10}", "Streaming Alpha++", stream_alpha, fmt_ratio(batch_dfg / stream_alpha));
        println!("{:<32} {:>10.2} {:>10}", "Streaming DECLARE", stream_declare, fmt_ratio(batch_dfg / stream_declare));
        println!("{:<32} {:>10.2} {:>10}", "Streaming Inductive", stream_inductive, fmt_ratio(batch_dfg / stream_inductive));
        println!("{:<32} {:>10.2} {:>10}", "Streaming Hill Climbing", stream_hc, fmt_ratio(batch_dfg / stream_hc));
        println!("{:<32} {:>10.2} {:>10}", "Streaming Noise-Filtered DFG", stream_noise, fmt_ratio(batch_dfg / stream_noise));
        println!("{:<32} {:>10.2} {:>10}", "Streaming A*", stream_astar, fmt_ratio(batch_dfg / stream_astar));
        println!("{:<32} {:>10.2} {:>10}", "Incremental DFG (raw)", inc_dfg, fmt_ratio(batch_dfg / inc_dfg));
    }

    println!("\n{}", "=".repeat(76));
}
