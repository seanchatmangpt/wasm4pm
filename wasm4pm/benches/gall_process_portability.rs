//! Criterion benchmarks for the GALL-021..023 portable process qualification
//! courts (`wasm4pm::gall_process_portability`).
//!
//! These courts qualify already-observed result digests and canonical result
//! sets; they never read event logs, so the inputs here are structural
//! qualification subjects (digests, POWL trees, OCPQ binding sets), not
//! synthetic process data.
//!
//! `ocpq_canonicalize/digest_key_sort` re-implements the pre-hardening
//! canonicalization (sort each binding by its SHA-256 JSON digest) as the
//! comparison baseline for the Ord-based sort that replaced it.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::time::Duration;
use wasm4pm::gall_process_portability::{
    powl_preservation_witness, qualify_ocpq, qualify_portable_execution, verify_powl_preservation,
    HostCapabilityFence, OcpqCanonicalResult, OcpqViolation, PortableProcessSubject, PowlNode,
    RuntimeWitness,
};

fn d(i: u64) -> String {
    format!("sha256:{:064x}", i)
}

fn subject() -> PortableProcessSubject {
    PortableProcessSubject {
        source_digest: d(1),
        process_digest: d(2),
        module_digest: d(3),
        parameters_digest: d(4),
    }
}

fn witnesses(n: usize) -> Vec<RuntimeWitness> {
    (0..n)
        .map(|i| RuntimeWitness {
            runtime_id: format!("runtime-{i}"),
            semantic_result_digest: d(99),
            performance_measurement_digest: Some(d(1000 + i as u64)),
            host_fence: HostCapabilityFence::default(),
        })
        .collect()
}

/// Balanced POWL tree mixing every supported construct; `width` children per
/// partial order, `depth` levels of hierarchy.
fn powl(depth: usize, width: usize, next: &mut usize) -> PowlNode {
    if depth == 0 {
        *next += 1;
        return PowlNode::Task {
            id: format!("t{next}"),
        };
    }
    let children: Vec<PowlNode> = (0..width).map(|_| powl(depth - 1, width, next)).collect();
    let first_ids: Vec<String> = children
        .iter()
        .filter_map(|c| match c {
            PowlNode::Task { id } | PowlNode::Hierarchy { id, .. } => Some(id.clone()),
            _ => None,
        })
        .collect();
    let edges = first_ids
        .windows(2)
        .map(|w| (w[0].clone(), w[1].clone()))
        .collect();
    *next += 1;
    PowlNode::Hierarchy {
        id: format!("h{next}"),
        child: Box::new(PowlNode::Choice {
            children: vec![
                PowlNode::PartialOrder { children, edges },
                PowlNode::Loop {
                    body: Box::new(PowlNode::Task {
                        id: format!("lb{next}"),
                    }),
                    redo: Box::new(PowlNode::Task {
                        id: format!("lr{next}"),
                    }),
                },
            ],
        }),
    }
}

fn bindings(n: usize) -> Vec<BTreeMap<String, String>> {
    (0..n)
        .rev()
        .map(|i| {
            let mut m = BTreeMap::new();
            m.insert("order".to_string(), format!("o{i:07}"));
            m.insert("item".to_string(), format!("i{:07}", (i * 7919) % n.max(1)));
            m
        })
        .collect()
}

fn digest_key_sort(mut b: Vec<BTreeMap<String, String>>) -> Vec<BTreeMap<String, String>> {
    b.sort_by_key(|x| {
        format!(
            "sha256:{:x}",
            Sha256::digest(serde_json::to_vec(x).unwrap())
        )
    });
    b.dedup();
    b
}

fn bench_portable_execution(c: &mut Criterion) {
    let mut g = c.benchmark_group("gall021_qualify_portable_execution");
    g.measurement_time(Duration::from_secs(3));
    for n in [2usize, 8, 64] {
        let ws = witnesses(n);
        let s = subject();
        g.throughput(Throughput::Elements(n as u64));
        g.bench_with_input(BenchmarkId::from_parameter(n), &ws, |b, ws| {
            b.iter(|| qualify_portable_execution(black_box(&s), black_box(ws)).unwrap())
        });
    }
    g.finish();
}

fn bench_powl(c: &mut Criterion) {
    let mut g = c.benchmark_group("gall022_powl_preservation");
    g.measurement_time(Duration::from_secs(3));
    for (depth, width) in [(2usize, 4usize), (3, 4), (4, 4)] {
        let mut next = 0;
        let model = powl(depth, width, &mut next);
        let label = format!("d{depth}w{width}_n{next}");
        g.throughput(Throughput::Elements(next as u64));
        g.bench_with_input(BenchmarkId::new("witness", &label), &model, |b, m| {
            b.iter(|| powl_preservation_witness(&d(1), &d(2), &d(3), black_box(m)).unwrap())
        });
        let w = powl_preservation_witness(&d(1), &d(2), &d(3), &model).unwrap();
        g.bench_with_input(BenchmarkId::new("verify", &label), &w, |b, w| {
            b.iter(|| verify_powl_preservation(black_box(w), black_box(w)).unwrap())
        });
    }
    g.finish();
}

fn bench_ocpq(c: &mut Criterion) {
    let mut g = c.benchmark_group("gall023_ocpq_canonicalize");
    g.measurement_time(Duration::from_secs(3));
    for n in [1_000usize, 10_000] {
        let b = bindings(n);
        g.throughput(Throughput::Elements(n as u64));
        g.bench_with_input(BenchmarkId::new("ord_sort", n), &b, |bn, b| {
            bn.iter(|| {
                OcpqCanonicalResult {
                    bindings: black_box(b.clone()),
                    violations: vec![],
                }
                .canonicalized()
            })
        });
        g.bench_with_input(BenchmarkId::new("digest_key_sort", n), &b, |bn, b| {
            bn.iter(|| digest_key_sort(black_box(b.clone())))
        });
        let violations: Vec<OcpqViolation> = (0..n / 10)
            .map(|i| OcpqViolation {
                class: "missing_relation".into(),
                subject: format!("o{i}"),
            })
            .collect();
        let reference = OcpqCanonicalResult {
            bindings: b.clone(),
            violations: violations.clone(),
        };
        let mut portable = reference.clone();
        portable.bindings.reverse();
        portable.violations.reverse();
        g.bench_with_input(
            BenchmarkId::new("qualify", n),
            &(reference, portable),
            |bn, (r, p)| {
                bn.iter(|| {
                    qualify_ocpq(&d(1), &d(2), black_box(r.clone()), black_box(p.clone())).unwrap()
                })
            },
        );
    }
    g.finish();
}

criterion_group!(benches, bench_portable_execution, bench_powl, bench_ocpq);
criterion_main!(benches);
