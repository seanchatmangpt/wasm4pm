// Benchmarks for cache-efficient data structures
// Run with: cargo bench --bench cache_efficiency_bench

#![feature(test)]
extern crate test;

use pictl::cache_resident::{encode_rl_state, decode_rl_state, QTable, VariantMap};
use pictl::RlState;

#[bench]
fn bench_encode_state(b: &mut test::Bencher) {
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
        let idx = encode_rl_state(&state);
        test::black_box(idx);
    });
}

#[bench]
fn bench_decode_state(b: &mut test::Bencher) {
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
        let decoded = decode_rl_state(idx);
        test::black_box(decoded);
    });
}

#[bench]
fn bench_qtable_insert_sequential(b: &mut test::Bencher) {
    let mut table: QTable<460_800> = QTable::new();

    b.iter(|| {
        for i in 0..1000 {
            table.insert(i as u32, (i % 8) as u8, 0.5 + (i as f32) * 0.001);
        }
    });
}

#[bench]
fn bench_qtable_get_sequential(b: &mut test::Bencher) {
    let mut table: QTable<460_800> = QTable::new();
    for i in 0..1000 {
        table.insert(i as u32, (i % 8) as u8, 0.5);
    }

    b.iter(|| {
        let mut sum = 0.0;
        for i in 0..1000 {
            if let Some(q) = table.get(i as u32, (i % 8) as u8) {
                sum += q;
            }
        }
        test::black_box(sum);
    });
}

#[bench]
fn bench_qtable_get_random(b: &mut test::Bencher) {
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
            if let Some(q) = table.get(idx, (idx % 8) as u8) {
                sum += q;
            }
        }
        test::black_box(sum);
    });
}

#[bench]
fn bench_variant_map_insert(b: &mut test::Bencher) {
    let mut map = VariantMap::with_capacity(100_000);

    b.iter(|| {
        for i in 0..10000 {
            let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
            map.insert(fp, 1);
        }
    });
}

#[bench]
fn bench_variant_map_get_sequential(b: &mut test::Bencher) {
    let mut map = VariantMap::with_capacity(100_000);
    for i in 0..10000 {
        let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
        map.insert(fp, 1);
    }

    b.iter(|| {
        let mut sum = 0u64;
        for i in 0..10000 {
            let fp = (i as u64).wrapping_mul(0x9e3779b97f4a7c15);
            if let Some(count) = map.get(fp) {
                sum += count as u64;
            }
        }
        test::black_box(sum);
    });
}

#[bench]
fn bench_variant_map_memory_overhead(b: &mut test::Bencher) {
    b.iter(|| {
        let map = VariantMap::with_capacity(1_000_000);
        let size_mb = map.size_bytes() as f64 / (1024.0 * 1024.0);
        test::black_box(size_mb);
    });
}

#[bench]
fn bench_qtable_full_memory_creation(b: &mut test::Bencher) {
    b.iter(|| {
        let table: QTable<460_800> = QTable::new();
        test::black_box(table.size_bytes());
    });
}
