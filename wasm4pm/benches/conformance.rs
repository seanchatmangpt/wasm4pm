/// Criterion benchmarks for conformance checking pipeline.
/// Discovers a model first, then replays the log against it.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use pictl::conformance::check_token_based_replay;
use pictl::discovery::discover_dfg;
use pictl::ilp_discovery::discover_ilp_petri_net;
use pictl::models::PetriNet;
use pictl::state::{get_or_init_state, StoredObject};
use std::time::Duration;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes_slow, make_handle, ACTIVITY_KEY};

/// Store a PetriNet handle from ILP discovery output (or minimal fallback).
fn make_petri_net_handle(log_handle: &str) -> String {
    if let Ok(js_val) = discover_ilp_petri_net(log_handle, ACTIVITY_KEY) {
        // On native targets, to_js wraps JSON in JsValue::from_str → as_string() works.
        if let Some(json_str) = js_val.as_string() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(h) = val["handle"].as_str() {
                    return h.to_string();
                }
            }
        }
    }
    // Fallback: store a minimal empty PetriNet
    get_or_init_state()
        .store_object(StoredObject::PetriNet(PetriNet::new()))
        .expect("bench: store PetriNet failed")
}

fn bench_token_replay(c: &mut Criterion) {
    let mut group = c.benchmark_group("conformance/token_replay");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(20);

    for shape in bench_sizes_slow() {
        let (log_handle, events) = make_handle(&shape);
        let pn_handle = make_petri_net_handle(&log_handle);

        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &(log_handle, pn_handle),
            |b, (lh, pnh)| b.iter(|| check_token_based_replay(lh, pnh, ACTIVITY_KEY).unwrap()),
        );
    }
    group.finish();
}

fn bench_discover_and_replay(c: &mut Criterion) {
    // End-to-end: DFG discovery + conformance check in one measurement
    let mut group = c.benchmark_group("conformance/discover_and_replay");
    group.measurement_time(Duration::from_secs(15));
    group.warm_up_time(Duration::from_secs(3));
    group.sample_size(15);

    for shape in bench_sizes_slow() {
        let (log_handle, events) = make_handle(&shape);
        let pn_handle = make_petri_net_handle(&log_handle);

        group.throughput(Throughput::Elements(events as u64));
        group.bench_with_input(
            BenchmarkId::new("cases", shape.num_cases),
            &(log_handle, pn_handle),
            |b, (lh, pnh)| {
                b.iter(|| {
                    let _ = discover_dfg(lh, ACTIVITY_KEY).unwrap();
                    check_token_based_replay(lh, pnh, ACTIVITY_KEY).unwrap()
                })
            },
        );
    }
    group.finish();
}

criterion_group!(
    conformance_benches,
    bench_token_replay,
    bench_discover_and_replay
);
criterion_main!(conformance_benches);
