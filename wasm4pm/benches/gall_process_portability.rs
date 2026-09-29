//! Criterion benchmarks for GALL-021..023 portable process execution.
//!
//! * `gall022_lower_powl` — POWL -> minimal DFA -> WASM module (compiler).
//! * `gall022_reference_language` — generative reference language (oracle).
//! * `gall021_execute` — one real execution per installed engine (process
//!   spawn + engine instantiate + run); skipped per engine when not installed.
//! * `gall021_qualify` / `gall022_verify` — court cost over real witnesses
//!   (includes module inspection and, for GALL-022, the rebuild check).
//! * `gall023_canonical_sort` — Ord sort of canonical bindings vs the
//!   pre-hardening digest-keyed sort (regression bound: >= 5x at n = 10000,
//!   enforced by `gall_023_canonical_sort_regression_bound_vs_digest_key_sort`).
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use sha2::{Digest, Sha256};
use std::time::Duration;
use wasm4pm::gall_process_portability::{
    qualify_portable_execution, verify_powl_preservation, PortableProcessSubject,
};
use wasm4pm::gall_runtime_harness::{discover_runtimes, witness_powl_probe};
use wasm4pm::gall_wasm_lowering::{
    gall017_reference_evaluate, lower_powl, powl_reference_language, Gall017Binding, Gall017Event,
    Gall017Ocel, Gall017Query, LanguageProbe, PowlSubject,
};

fn sha(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

/// `width` tasks in a partial order with a chain over the first half, nested
/// in a hierarchy, in choice with a loop.
fn model(width: usize) -> PowlSubject {
    let tasks: Vec<String> = (0..width).map(|i| format!("\"t{i}\"")).collect();
    let chain: Vec<String> = (1..width / 2)
        .map(|i| format!("[\"t{}\",\"t{}\"]", i - 1, i))
        .collect();
    let json = format!(
        r#"{{"type":"choice","children":[{{"type":"hierarchy","id":"h","child":{{"type":"partial_order","children":[{}],"order":[{}]}}}},{{"type":"loop","body":"lb","redo":"lr"}}]}}"#,
        tasks.join(","),
        chain.join(",")
    );
    PowlSubject::from_gall016_json(json.as_bytes()).expect("bench model")
}

fn bench_lowering(c: &mut Criterion) {
    let mut g = c.benchmark_group("gall022_lower_powl");
    g.measurement_time(Duration::from_secs(3));
    for width in [3usize, 5, 7] {
        let subject = model(width);
        g.bench_with_input(BenchmarkId::from_parameter(width), &subject, |b, s| {
            b.iter(|| lower_powl(black_box(s)).unwrap())
        });
    }
    g.finish();

    let mut g = c.benchmark_group("gall022_reference_language");
    g.measurement_time(Duration::from_secs(3));
    for width in [3usize, 5] {
        let subject = model(width);
        let bound = LanguageProbe::for_subject(&subject).bound();
        g.bench_with_input(
            BenchmarkId::new(format!("w{width}"), bound),
            &subject,
            |b, s| b.iter(|| powl_reference_language(black_box(s), bound).unwrap()),
        );
    }
    g.finish();
}

fn bench_execution(c: &mut Criterion) {
    let hosts = discover_runtimes();
    let subject = model(3);
    let module = lower_powl(&subject).unwrap();
    let probe = LanguageProbe::for_subject(&subject);
    let mut g = c.benchmark_group("gall021_execute");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(5));
    for host in &hosts {
        g.bench_function(host.engine.as_str(), |b| {
            b.iter(|| witness_powl_probe(host, &module, &probe).unwrap())
        });
    }
    g.finish();
    if hosts.len() < 2 {
        eprintln!("SKIP gall021_qualify/gall022_verify: fewer than 2 engines installed");
        return;
    }
    let witnesses: Vec<_> = hosts
        .iter()
        .map(|h| witness_powl_probe(h, &module, &probe).unwrap())
        .collect();
    let s =
        PortableProcessSubject::new(subject.source_digest(), &module, probe.input(), &sha(b"{}"));
    c.bench_function("gall021_qualify", |b| {
        b.iter(|| {
            qualify_portable_execution(black_box(&s), &module, black_box(&witnesses)).unwrap()
        })
    });
    c.bench_function("gall022_verify", |b| {
        b.iter(|| {
            verify_powl_preservation(black_box(&subject), &module, &probe, black_box(&witnesses))
                .unwrap()
        })
    });
}

fn bindings(n: usize) -> Vec<Gall017Binding> {
    (0..n)
        .rev()
        .map(|i| Gall017Binding {
            event_id: format!("e{i:07}"),
            activity: Some("ship".into()),
            sequence: Some(i as i64),
            objects: vec![(
                format!("i{:07}", (i * 7919) % n.max(1)),
                "item".into(),
                "contains".into(),
            )],
        })
        .collect()
}

fn bench_ocpq(c: &mut Criterion) {
    let mut g = c.benchmark_group("gall023_canonical_sort");
    g.measurement_time(Duration::from_secs(3));
    for n in [1_000usize, 10_000] {
        let b = bindings(n);
        g.throughput(Throughput::Elements(n as u64));
        g.bench_with_input(BenchmarkId::new("ord_sort", n), &b, |bn, b| {
            bn.iter(|| {
                let mut v = black_box(b.clone());
                v.sort();
                v
            })
        });
        g.bench_with_input(BenchmarkId::new("digest_key_sort", n), &b, |bn, b| {
            bn.iter(|| {
                let mut v = black_box(b.clone());
                v.sort_by_key(|x| sha(&serde_json::to_vec(x).unwrap()));
                v
            })
        });
    }
    g.finish();

    let mut g = c.benchmark_group("gall023_reference_evaluate");
    g.measurement_time(Duration::from_secs(3));
    for n in [100usize, 1_000] {
        let ocel = Gall017Ocel {
            events: (0..n)
                .map(|i| Gall017Event {
                    id: format!("e{i}"),
                    activity: Some(if i % 2 == 0 { "create" } else { "ship" }.into()),
                    sequence: Some(i as i64),
                    objects: vec![(format!("o{i}"), "item".into(), "contains".into())],
                })
                .collect(),
        };
        let query = Gall017Query::from_json(
            br#"{"activity":"ship","object_type":"item","after_activity":"create"}"#,
        )
        .unwrap();
        g.bench_with_input(BenchmarkId::from_parameter(n), &ocel, |b, o| {
            b.iter(|| gall017_reference_evaluate(black_box(o), &query))
        });
    }
    g.finish();
}

criterion_group!(benches, bench_lowering, bench_execution, bench_ocpq);
criterion_main!(benches);
