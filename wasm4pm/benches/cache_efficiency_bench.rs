// Benchmarks for cache-efficient data structures
// Run with: cargo bench --bench cache_efficiency_bench

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use pictl::cache_resident::{encode_rl_state, decode_rl_state, QTable, VariantMap};
use pictl::RlState;

fn bench_encode_state(c: &mut Criterion) {
    c.bench_function("encode_rl_state", |b| {
        let state = RlState {
            health_level: 2,
            event_rate_q: 5,
            activity_count_q: 3,
            spc_alert_level: 1,
            drift_status: 2,
            rework_ratio_q: 7,
            circuit_state: 1,
            cycle_phase: 3,
        };

        b.iter(|| {
            let idx = encode_rl_state(black_box(&state));
            black_box(idx);
        });
    });
}

fn bench_decode_state(c: &mut Criterion) {
    c.bench_function("decode_rl_state", |b| {
        let state = RlState {
            health_level: 2,
            event_rate_q: 5,
            activity_count_q: 3,
            spc_alert_level: 1,
            drift_status: 2,
            rework_ratio_q: 7,
            circuit_state: 1,
            cycle_phase: 3,
        };
        let idx = encode_rl_state(&state);

        b.iter(|| {
            let decoded = decode_rl_state(black_box(idx));
            black_box(decoded);
        });
    });
}

fn bench_qtable_insert_sequential(c: &mut Criterion) {
    c.bench_function("qtable_insert_sequential_1000", |b| {
        let mut table: QTable<460_800> = QTable::new();

        b.iter(|| {
            for i in 0..1000 {
                table.insert(i as u32, (i % 8) as u8, 0.5 + (i as f32) * 0.001);
            }
        });
    });
}

fn bench_qtable_get_sequential(c: &mut Criterion) {
    c.bench_function("qtable_get_sequential_1000", |b| {
        let mut table: QTable<460_800> = QTable::new();
        for i in 0..1000 {
            table.insert(i as u32, (i % 8) as u8, 0.5);
        }

        b.iter(|| {
            let mut sum = 0.0;
            for i in 0..1000 {
                if let Some(q) = table.get(black_box(i as u32), (i % 8) as u8) {
                    sum += q;
                }
            }
            black_box(sum);
        });
    });
}

fn bench_qtable_get_random(c: &mut Criterion) {
    c.bench_function("qtable_get_random_10000", |b| {
        let mut table: QTable<460_800> = QTable::new();
        for i in 0..10000 {
            table.insert(i as u32, (i % 8) as u8, 0.5);
        }

        // Pre-generate random lookups to avoid RNG in benchmark
        let lookups: Vec<u32> = (0..10000)
            .map(|i| ((i * 7919) % 10000) as u32)
            .collect();

        b.iter(|| {
            let mut sum = 0.0;
            for &idx in &lookups {
                if let Some(q) = table.get(black_box(idx), (idx % 8) as u8) {
                    sum += q;
                }
            }
            black_box(sum);
        });
    });
}

fn bench_variant_map_insert(c: &mut Criterion) {
    c.bench_function("variant_map_insert_10000", |b| {
        let mut map = VariantMap::with_capacity(100_000);

        b.iter(|| {
            for i in 0..10000 {
                let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
                map.insert(black_box(fp), 1);
            }
        });
    });
}

fn bench_variant_map_get_sequential(c: &mut Criterion) {
    c.bench_function("variant_map_get_sequential_10000", |b| {
        let mut map = VariantMap::with_capacity(100_000);
        for i in 0..10000 {
            let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
            map.insert(fp, 1);
        }

        b.iter(|| {
            let mut sum = 0u64;
            for i in 0..10000 {
                let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
                if let Some(count) = map.get(black_box(fp)) {
                    sum += count as u64;
                }
            }
            black_box(sum);
        });
    });
}

fn bench_variant_map_memory_overhead(c: &mut Criterion) {
    c.bench_function("variant_map_memory_overhead_1m", |b| {
        b.iter(|| {
            let map = VariantMap::with_capacity(1_000_000);
            let size_mb = map.size_bytes() as f64 / (1024.0 * 1024.0);
            black_box(size_mb);
        });
    });
}

fn bench_qtable_full_memory_creation(c: &mut Criterion) {
    c.bench_function("qtable_full_memory_creation_460k", |b| {
        b.iter(|| {
            let table: QTable<460_800> = QTable::new();
            black_box(table.size_bytes());
        });
    });
}

criterion_group!(
    benches,
    bench_encode_state,
    bench_decode_state,
    bench_qtable_insert_sequential,
    bench_qtable_get_sequential,
    bench_qtable_get_random,
    bench_variant_map_insert,
    bench_variant_map_get_sequential,
    bench_variant_map_memory_overhead,
    bench_qtable_full_memory_creation,
);
criterion_main!(benches);
