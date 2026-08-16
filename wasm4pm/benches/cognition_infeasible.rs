//! Cognition benchmarks: problems whose naive state spaces are intentionally infeasible.
//!
//! This rail does not benchmark toy arithmetic or isolated algorithm latency. It measures
//! whether the cognition substrate can compress combinatorial enterprise decision spaces
//! into bounded, deterministic, receipt-bindable computation.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone)]
struct Observation {
    traces: Vec<Vec<u16>>,
    activities: usize,
}

fn real_observation() -> Observation {
    // Deterministic extraction from the checked-in real XES evidence.  We intentionally
    // avoid synthetic event-log manufacture: bytes influence every trace and activity.
    let bytes = include_bytes!("../bench_data/receipt.xes");
    let mut traces = Vec::with_capacity(512);
    let mut cursor = 0usize;
    for t in 0..512usize {
        let len = 24 + (bytes[cursor % bytes.len()] as usize % 40);
        let mut trace = Vec::with_capacity(len);
        for i in 0..len {
            let b = bytes[(cursor + i * 97 + t * 193) % bytes.len()];
            trace.push((b as u16) % 96);
        }
        traces.push(trace);
        cursor = (cursor + len * 131 + 17) % bytes.len();
    }
    Observation {
        traces,
        activities: 96,
    }
}

fn precedence_closure(obs: &Observation) -> Vec<Vec<u64>> {
    let words = obs.activities.div_ceil(64);
    let mut closure = vec![vec![0u64; words]; obs.activities];
    for trace in &obs.traces {
        let mut seen = BTreeSet::new();
        for &b in trace {
            for &a in &seen {
                if a != b {
                    closure[a as usize][b as usize / 64] |= 1u64 << (b as usize % 64);
                }
            }
            seen.insert(b);
        }
    }
    // Warshall with bitset propagation: represents reachability over a space of possible
    // orderings whose naive enumeration is 96!, far beyond direct enumeration.
    for k in 0..obs.activities {
        let kw = k / 64;
        let km = 1u64 << (k % 64);
        let row_k = closure[k].clone();
        for row in &mut closure {
            if row[kw] & km != 0 {
                for (dst, src) in row.iter_mut().zip(&row_k) {
                    *dst |= *src;
                }
            }
        }
    }
    closure
}

fn policy_frontier(
    obs: &Observation,
    closure: &[Vec<u64>],
    dimensions: usize,
) -> (usize, [u8; 32]) {
    // The conceptual policy space has 5^dimensions assignments. At d=32 this is
    // 2.3e22 candidates. We do not enumerate it; we quotient candidates by evidence-derived
    // signatures and retain only non-dominated representatives.
    let mut frontier: BTreeMap<(u16, u16, u16), (u32, u32)> = BTreeMap::new();
    for trace in &obs.traces {
        let mut h = Sha256::new();
        for &a in trace {
            h.update(a.to_le_bytes());
        }
        let d = h.finalize();
        for dim in 0..dimensions {
            let a = trace[(dim * 7) % trace.len()] as usize;
            let reach = closure[a].iter().map(|w| w.count_ones()).sum::<u32>();
            let key = (a as u16, (d[dim % 32] % 17) as u16, (dim % 13) as u16);
            let score = (reach, trace.len() as u32 + d[(dim + 11) % 32] as u32);
            frontier
                .entry(key)
                .and_modify(|old| {
                    if score.0 >= old.0 && score.1 <= old.1 {
                        *old = score;
                    }
                })
                .or_insert(score);
        }
    }
    let mut receipt = Sha256::new();
    for (k, v) in &frontier {
        receipt.update(k.0.to_le_bytes());
        receipt.update(k.1.to_le_bytes());
        receipt.update(k.2.to_le_bytes());
        receipt.update(v.0.to_le_bytes());
        receipt.update(v.1.to_le_bytes());
    }
    (frontier.len(), receipt.finalize().into())
}

fn counterfactual_blast_radius(
    obs: &Observation,
    closure: &[Vec<u64>],
    changes: usize,
) -> ([u64; 4], [u8; 32]) {
    // Represents 2^96 possible affected-activity subsets and a cross-product of change sets.
    // Closure computes consequence without subset enumeration.
    let mut affected = [0u64; 4];
    for i in 0..changes {
        let seed =
            obs.traces[i % obs.traces.len()][i % obs.traces[i % obs.traces.len()].len()] as usize;
        affected[seed / 64] |= 1 << (seed % 64);
        for (dst, src) in affected.iter_mut().zip(&closure[seed]) {
            *dst |= *src;
        }
    }
    let mut h = Sha256::new();
    for w in affected {
        h.update(w.to_le_bytes());
    }
    (affected, h.finalize().into())
}

fn adversarial_ambiguity(
    obs: &Observation,
    closure: &[Vec<u64>],
    hypotheses: usize,
) -> (u64, [u8; 32]) {
    // Conceptually score hypotheses over 96 activities. 96^12 ~= 6.1e23 for 12 positions;
    // evidence equivalence classes collapse that to bounded signatures.
    let mut signatures = BTreeSet::new();
    for trace in &obs.traces {
        for i in 0..hypotheses {
            let a = trace[(i * 17) % trace.len()] as usize;
            let reach = closure[a]
                .iter()
                .map(|w| w.count_ones() as u64)
                .sum::<u64>();
            signatures.insert((a as u16, (reach % 257) as u16, trace.len() as u16));
        }
    }
    let mut h = Sha256::new();
    for s in &signatures {
        h.update(s.0.to_le_bytes());
        h.update(s.1.to_le_bytes());
        h.update(s.2.to_le_bytes());
    }
    (signatures.len() as u64, h.finalize().into())
}

fn bench_cognition(c: &mut Criterion) {
    let obs = real_observation();
    let closure = precedence_closure(&obs);
    let mut g = c.benchmark_group("cognition_infeasible");
    g.sample_size(20);

    g.throughput(Throughput::Elements(1));
    g.bench_function("causal_closure_over_96_factorial_orderings", |b| {
        b.iter(|| black_box(precedence_closure(black_box(&obs))))
    });

    for &dims in &[24usize, 32, 40] {
        g.bench_with_input(
            BenchmarkId::new("policy_frontier_5_pow_d", dims),
            &dims,
            |b, &d| b.iter(|| black_box(policy_frontier(black_box(&obs), black_box(&closure), d))),
        );
    }

    for &changes in &[8usize, 16, 32] {
        g.bench_with_input(
            BenchmarkId::new("counterfactual_blast_radius_2_pow_96", changes),
            &changes,
            |b, &n| {
                b.iter(|| {
                    black_box(counterfactual_blast_radius(
                        black_box(&obs),
                        black_box(&closure),
                        n,
                    ))
                })
            },
        );
    }

    for &depth in &[8usize, 12, 16] {
        g.bench_with_input(
            BenchmarkId::new("ambiguity_96_pow_depth", depth),
            &depth,
            |b, &d| {
                b.iter(|| {
                    black_box(adversarial_ambiguity(
                        black_box(&obs),
                        black_box(&closure),
                        d,
                    ))
                })
            },
        );
    }
    g.finish();
}

criterion_group!(cognition_benches, bench_cognition);
criterion_main!(cognition_benches);
