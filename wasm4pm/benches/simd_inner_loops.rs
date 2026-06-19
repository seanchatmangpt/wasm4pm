//! Benchmark suite for SIMD-vectorized inner loops.
//!
//! Measures speedup of vectorized implementations against scalar baselines
//! across DFG discovery, conformance checking, variant deduplication, and token replay.
//!
//! Target speedups: 4-8x depending on CPU SIMD support (SSE4.2, AVX-2, AVX-512).

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use wasm4pm::simd_inner_loops::*;

#[path = "helpers.rs"]
mod helpers;

// ============================================================================
// Scalar baseline implementations (for comparison)
// ============================================================================

/// Scalar activity counter (baseline).
fn scalar_increment_activities(counts: &mut [u32], activity_ids: &[u32]) {
    for &id in activity_ids {
        if (id as usize) < counts.len() {
            counts[id as usize] = counts[id as usize].wrapping_add(1);
        }
    }
}

/// Scalar variant hash (baseline).
fn scalar_compute_variant_hash(trace: &[u32]) -> u64 {
    let mut hash = 14695981039346656037u64;
    const FNV_PRIME: u64 = 1099511628211u64;

    for &activity in trace {
        hash ^= activity as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }

    hash
}

/// Scalar marking fire (baseline).
fn scalar_fire_transition(marking: &mut [u32], preset: &[u32], postset: &[u32]) -> bool {
    // Check all preset places have tokens
    for &place_id in preset {
        if place_id as usize >= marking.len() || marking[place_id as usize] == 0 {
            return false;
        }
    }

    // Consume from preset
    for &place_id in preset {
        marking[place_id as usize] = marking[place_id as usize].saturating_sub(1);
    }

    // Produce to postset
    for &place_id in postset {
        marking[place_id as usize] = marking[place_id as usize].wrapping_add(1);
    }

    true
}

// ============================================================================
// Benchmark fixtures
// ============================================================================

/// Generate synthetic activity sequence (deterministic).
fn generate_activity_sequence(num_activities: u32, sequence_len: usize) -> Vec<u32> {
    let mut rng = StdRng::seed_from_u64(42);
    (0..sequence_len)
        .map(|_| rng.gen::<u32>() % num_activities)
        .collect()
}

/// Generate synthetic trace variants (deterministic).
fn generate_trace_variants(num_variants: usize, trace_len: usize) -> Vec<Vec<u32>> {
    let mut rng = StdRng::seed_from_u64(42);
    (0..num_variants)
        .map(|_| {
            (0..trace_len)
                .map(|_| rng.gen::<u32>() % 50)
                .collect::<Vec<_>>()
        })
        .collect()
}

/// Generate synthetic Petri net transitions.
fn generate_petri_transitions(
    num_places: usize,
    num_transitions: usize,
) -> Vec<(Vec<u32>, Vec<u32>)> {
    let mut rng = StdRng::seed_from_u64(42);
    (0..num_transitions)
        .map(|_| {
            let preset_len = rng.gen_range(1..3);
            let postset_len = rng.gen_range(1..3);
            let preset = (0..preset_len)
                .map(|_| rng.gen::<u32>() % num_places as u32)
                .collect();
            let postset = (0..postset_len)
                .map(|_| rng.gen::<u32>() % num_places as u32)
                .collect();
            (preset, postset)
        })
        .collect()
}

// ============================================================================
// Benchmarks: Activity Counting (DFG Discovery)
// ============================================================================

fn bench_activity_counter_scalar(c: &mut Criterion) {
    let mut group = c.benchmark_group("activity_counter_scalar");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_activities in [10, 100, 1000].iter() {
        let sequence_len = 10000;
        let activities = black_box(generate_activity_sequence(*num_activities, sequence_len));
        group.throughput(Throughput::Elements(sequence_len as u64));

        group.bench_with_input(
            BenchmarkId::from_parameter(num_activities),
            num_activities,
            |b, &num_activities| {
                b.iter(|| {
                    let mut counts = vec![0u32; num_activities as usize];
                    scalar_increment_activities(&mut counts, black_box(&activities));
                    black_box(counts);
                })
            },
        );
    }

    group.finish();
}

fn bench_activity_counter_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("activity_counter_simd");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_activities in [10, 100, 1000].iter() {
        let sequence_len = 10000;
        let activities = black_box(generate_activity_sequence(*num_activities, sequence_len));
        group.throughput(Throughput::Elements(sequence_len as u64));

        group.bench_with_input(
            BenchmarkId::from_parameter(num_activities),
            num_activities,
            |b, &num_activities| {
                b.iter(|| {
                    let mut counter = SimdActivityCounter::new(num_activities as usize);
                    counter.increment_batch(black_box(&activities));
                    black_box(counter.counts().to_vec());
                })
            },
        );
    }

    group.finish();
}

// ============================================================================
// Benchmarks: Edge Aggregation (DFG Discovery)
// ============================================================================

fn bench_edge_aggregator_scalar(c: &mut Criterion) {
    let mut group = c.benchmark_group("edge_aggregator_scalar");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_edges in [1000, 10000, 100000].iter() {
        let mut rng = StdRng::seed_from_u64(42);
        let edges: Vec<(u32, u32)> = (0..*num_edges)
            .map(|_| {
                let from = rng.gen::<u32>() % 50;
                let to = rng.gen::<u32>() % 50;
                (from, to)
            })
            .collect();
        let edges = black_box(edges);
        group.throughput(Throughput::Elements(*num_edges as u64));

        group.bench_with_input(BenchmarkId::from_parameter(num_edges), num_edges, |b, _| {
            b.iter(|| {
                let mut edge_counts: std::collections::HashMap<(u32, u32), u64> =
                    std::collections::HashMap::new();
                for (from, to) in black_box(&edges) {
                    *edge_counts.entry((*from, *to)).or_insert(0) += 1;
                }
                black_box(edge_counts);
            })
        });
    }

    group.finish();
}

fn bench_edge_aggregator_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("edge_aggregator_simd");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_edges in [1000, 10000, 100000].iter() {
        let mut rng = StdRng::seed_from_u64(42);
        let edges: Vec<(u32, u32)> = (0..*num_edges)
            .map(|_| {
                let from = rng.gen::<u32>() % 50;
                let to = rng.gen::<u32>() % 50;
                (from, to)
            })
            .collect();
        let edges = black_box(edges);
        group.throughput(Throughput::Elements(*num_edges as u64));

        group.bench_with_input(BenchmarkId::from_parameter(num_edges), num_edges, |b, _| {
            b.iter(|| {
                let mut agg = SimdEdgeAggregator::new();
                agg.increment_batch(black_box(&edges));
                black_box(agg.edges().clone());
            })
        });
    }

    group.finish();
}

// ============================================================================
// Benchmarks: Variant Hashing (Deduplication)
// ============================================================================

fn bench_variant_hash_scalar(c: &mut Criterion) {
    let mut group = c.benchmark_group("variant_hash_scalar");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for trace_len in [10, 50, 200].iter() {
        let variants = black_box(generate_trace_variants(1000, *trace_len));
        group.throughput(Throughput::Elements((1000 * *trace_len) as u64));

        group.bench_with_input(BenchmarkId::from_parameter(trace_len), trace_len, |b, _| {
            b.iter(|| {
                let mut hashes = Vec::new();
                for variant in black_box(&variants) {
                    hashes.push(scalar_compute_variant_hash(variant));
                }
                black_box(hashes);
            })
        });
    }

    group.finish();
}

fn bench_variant_hash_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("variant_hash_simd");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for trace_len in [10, 50, 200].iter() {
        let variants = black_box(generate_trace_variants(1000, *trace_len));
        group.throughput(Throughput::Elements((1000 * *trace_len) as u64));

        group.bench_with_input(BenchmarkId::from_parameter(trace_len), trace_len, |b, _| {
            b.iter(|| {
                let mut dedup = SimdVariantDeduplicator::new();
                for variant in black_box(&variants) {
                    dedup.add_variant(variant);
                }
                black_box(dedup.variants().clone());
            })
        });
    }

    group.finish();
}

// ============================================================================
// Benchmarks: Marking Updates (Token Replay / Conformance)
// ============================================================================

fn bench_marking_update_scalar(c: &mut Criterion) {
    let mut group = c.benchmark_group("marking_update_scalar");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_places in [10, 100, 1000].iter() {
        let transitions = black_box(generate_petri_transitions(*num_places, 5000));
        group.throughput(Throughput::Elements(5000));

        group.bench_with_input(
            BenchmarkId::from_parameter(num_places),
            num_places,
            |b, &num_places| {
                b.iter(|| {
                    let mut marking = vec![1u32; num_places];
                    for (preset, postset) in black_box(&transitions) {
                        let _ = scalar_fire_transition(&mut marking, preset, postset);
                    }
                    black_box(marking);
                })
            },
        );
    }

    group.finish();
}

fn bench_marking_update_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("marking_update_simd");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_places in [10, 100, 1000].iter() {
        let transitions = black_box(generate_petri_transitions(*num_places, 5000));
        group.throughput(Throughput::Elements(5000));

        group.bench_with_input(
            BenchmarkId::from_parameter(num_places),
            num_places,
            |b, &num_places| {
                b.iter(|| {
                    let mut updater = SimdMarkingUpdater::new(num_places);
                    // Initialize all places with 1 token
                    for i in 0..num_places {
                        updater.set(i, 1);
                    }
                    for (preset, postset) in black_box(&transitions) {
                        let _ = updater.fire_transition(preset, postset);
                    }
                    black_box(updater.marking().to_vec());
                })
            },
        );
    }

    group.finish();
}

// ============================================================================
// Benchmarks: Token Accumulation (Conformance Result Aggregation)
// ============================================================================

fn bench_token_accumulation_scalar(c: &mut Criterion) {
    let mut group = c.benchmark_group("token_accumulation_scalar");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_operations in [1000, 10000, 100000].iter() {
        let mut rng = StdRng::seed_from_u64(42);
        let operations: Vec<(u64, u64, u64, u64)> = (0..*num_operations)
            .map(|_| {
                (
                    rng.gen::<u64>() % 100,
                    rng.gen::<u64>() % 100,
                    rng.gen::<u64>() % 50,
                    rng.gen::<u64>() % 50,
                )
            })
            .collect();
        let operations = black_box(operations);
        group.throughput(Throughput::Elements(*num_operations as u64));

        group.bench_with_input(
            BenchmarkId::from_parameter(num_operations),
            num_operations,
            |b, _| {
                b.iter(|| {
                    let mut produced = 0u64;
                    let mut consumed = 0u64;
                    let mut missing = 0u64;
                    let mut remaining = 0u64;

                    for (p, c, m, r) in black_box(&operations) {
                        produced = produced.wrapping_add(*p);
                        consumed = consumed.wrapping_add(*c);
                        missing = missing.wrapping_add(*m);
                        remaining = remaining.wrapping_add(*r);
                    }

                    black_box((produced, consumed, missing, remaining));
                })
            },
        );
    }

    group.finish();
}

fn bench_token_accumulation_simd(c: &mut Criterion) {
    let mut group = c.benchmark_group("token_accumulation_simd");
    group.sample_size(100);
    if helpers::is_fast_mode() {
        helpers::fast_group(&mut group);
    } else {
        helpers::full_group(&mut group);
    }

    for num_operations in [1000, 10000, 100000].iter() {
        let mut rng = StdRng::seed_from_u64(42);
        let operations: Vec<(u64, u64, u64, u64)> = (0..*num_operations)
            .map(|_| {
                (
                    rng.gen::<u64>() % 100,
                    rng.gen::<u64>() % 100,
                    rng.gen::<u64>() % 50,
                    rng.gen::<u64>() % 50,
                )
            })
            .collect();
        let operations = black_box(operations);
        group.throughput(Throughput::Elements(*num_operations as u64));

        group.bench_with_input(
            BenchmarkId::from_parameter(num_operations),
            num_operations,
            |b, _| {
                b.iter(|| {
                    let mut acc = SimdTokenAccumulator::new();
                    for (p, c, m, r) in black_box(&operations) {
                        acc.add_produced(*p);
                        acc.add_consumed(*c);
                        acc.add_missing(*m);
                        acc.add_remaining(*r);
                    }
                    black_box(acc.totals());
                })
            },
        );
    }

    group.finish();
}

// ============================================================================
// Criterion configuration
// ============================================================================

criterion_group!(
    name = benches;
    config = Criterion::default().sample_size(100).measurement_time(std::time::Duration::from_secs(10));
    targets =
        bench_activity_counter_scalar,
        bench_activity_counter_simd,
        bench_edge_aggregator_scalar,
        bench_edge_aggregator_simd,
        bench_variant_hash_scalar,
        bench_variant_hash_simd,
        bench_marking_update_scalar,
        bench_marking_update_simd,
        bench_token_accumulation_scalar,
        bench_token_accumulation_simd
);

criterion_main!(benches);
