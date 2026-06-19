// Benchmarks for cache-efficient data structures
// Run with: cargo bench --bench cache_efficiency_bench
//
// Domain note: this bench measures wasm4pm's cache-resident RL data structures
// (QTable, VariantMap) and the RlState encode/decode codec. These are purely
// internal, synthetic numeric workloads — there is no XES/OCEL event-log input
// to ground on, so no real-data fixture is loaded here. Inputs are deterministic
// (no RNG) and every measured result is fed through `black_box` so the optimizer
// cannot elide the work, and size-parameterized loops are reported with
// `Throughput::Elements` so per-element cost is comparable across sizes.

use criterion::{
    black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput,
};
use wasm4pm::cache_resident::{decode_rl_state, encode_rl_state, QTable, VariantMap};
use wasm4pm::RlState;

const SAMPLE_STATE: RlState = RlState {
    health_level: 2,
    event_rate_q: 5,
    activity_count_q: 3,
    spc_alert_level: 1,
    drift_status: 2,
    rework_ratio_q: 7,
    circuit_state: 1,
    cycle_phase: 3,
};

/// Representative element counts for size-parameterized lookups/inserts.
const SIZES: &[usize] = &[1_000, 10_000, 100_000];

fn bench_encode_state(c: &mut Criterion) {
    c.bench_function("encode_rl_state", |b| {
        let state = SAMPLE_STATE;
        b.iter(|| black_box(encode_rl_state(black_box(&state))));
    });
}

fn bench_decode_state(c: &mut Criterion) {
    c.bench_function("decode_rl_state", |b| {
        let idx = encode_rl_state(&SAMPLE_STATE);
        b.iter(|| black_box(decode_rl_state(black_box(idx))));
    });
}

fn bench_qtable_insert(c: &mut Criterion) {
    let mut group = c.benchmark_group("qtable_insert_sequential");
    for &n in SIZES {
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &n| {
            b.iter(|| {
                let mut table: QTable<460_800> = QTable::new();
                for i in 0..n {
                    table.insert(
                        black_box(i as u32),
                        black_box((i % 8) as u8),
                        black_box(0.5 + (i as f32) * 0.001),
                    );
                }
                black_box(table.size_bytes());
            });
        });
    }
    group.finish();
}

fn bench_qtable_get_sequential(c: &mut Criterion) {
    let mut group = c.benchmark_group("qtable_get_sequential");
    for &n in SIZES {
        let mut table: QTable<460_800> = QTable::new();
        for i in 0..n {
            table.insert(i as u32, (i % 8) as u8, 0.5);
        }
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &n| {
            b.iter(|| {
                let mut sum = 0.0f32;
                for i in 0..n {
                    if let Some(q) = table.get(black_box(i as u32), black_box((i % 8) as u8)) {
                        sum += q;
                    }
                }
                black_box(sum)
            });
        });
    }
    group.finish();
}

fn bench_qtable_get_random(c: &mut Criterion) {
    let mut group = c.benchmark_group("qtable_get_random");
    for &n in SIZES {
        let mut table: QTable<460_800> = QTable::new();
        for i in 0..n {
            table.insert(i as u32, (i % 8) as u8, 0.5);
        }
        // Pre-generate deterministic pseudo-random lookups (no RNG in measured loop).
        let lookups: Vec<u32> = (0..n).map(|i| ((i * 7919) % n) as u32).collect();
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, _| {
            b.iter(|| {
                let mut sum = 0.0f32;
                for &idx in &lookups {
                    if let Some(q) = table.get(black_box(idx), black_box((idx % 8) as u8)) {
                        sum += q;
                    }
                }
                black_box(sum)
            });
        });
    }
    group.finish();
}

fn bench_variant_map_insert(c: &mut Criterion) {
    let mut group = c.benchmark_group("variant_map_insert");
    for &n in SIZES {
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &n| {
            b.iter(|| {
                let mut map = VariantMap::with_capacity(n * 10);
                for i in 0..n {
                    let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
                    map.insert(black_box(fp), black_box(1));
                }
                black_box(map.size_bytes());
            });
        });
    }
    group.finish();
}

fn bench_variant_map_get_sequential(c: &mut Criterion) {
    let mut group = c.benchmark_group("variant_map_get_sequential");
    for &n in SIZES {
        let mut map = VariantMap::with_capacity(n * 10);
        for i in 0..n {
            let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
            map.insert(fp, 1);
        }
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &n| {
            b.iter(|| {
                let mut sum = 0u64;
                for i in 0..n {
                    let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
                    if let Some(count) = map.get(black_box(fp)) {
                        sum += count as u64;
                    }
                }
                black_box(sum)
            });
        });
    }
    group.finish();
}

fn bench_variant_map_memory_overhead(c: &mut Criterion) {
    c.bench_function("variant_map_memory_overhead_1m", |b| {
        b.iter(|| {
            let map = VariantMap::with_capacity(black_box(1_000_000));
            black_box(map.size_bytes())
        });
    });
}

fn bench_qtable_full_memory_creation(c: &mut Criterion) {
    c.bench_function("qtable_full_memory_creation_460k", |b| {
        b.iter(|| {
            let table: QTable<460_800> = QTable::new();
            black_box(table.size_bytes())
        });
    });
}

criterion_group!(
    benches,
    bench_encode_state,
    bench_decode_state,
    bench_qtable_insert,
    bench_qtable_get_sequential,
    bench_qtable_get_random,
    bench_variant_map_insert,
    bench_variant_map_get_sequential,
    bench_variant_map_memory_overhead,
    bench_qtable_full_memory_creation,
);
criterion_main!(benches);
