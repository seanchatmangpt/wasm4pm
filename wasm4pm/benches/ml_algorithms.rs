/// Criterion benchmarks for all 6 ML algorithms.
///
/// Each benchmark targets the pure internal function (not the WASM binding) so
/// that measured time reflects algorithm cost only, with no state-lookup or
/// serialisation overhead.  Where no standalone internal exists the handle-based
/// function is used instead (ml_cluster).
///
/// Benchmark matrix
/// ─────────────────────────────────────────────────────────────────────────────
/// Algorithm  | Internal fn            | Input sizes        | Param sweep
/// -----------+------------------------+--------------------+------------------
/// ml_classify| knn_internal           | 100 / 1K / 10K     | k ∈ {3, 5, 10}
/// ml_cluster | cluster_traces         | 100 / 1K / 10K     | k ∈ {3, 5, 10}
/// ml_forecast| forecast_internal      | 100 / 1K / 10K     | α ∈ {0.1, 0.2, 0.3}
/// ml_anomaly | score_edges (pure loop)| 100 / 1K / 10K     | —
/// ml_regress | regression_internal    | 100 / 1K / 10K     | —
/// ml_pca     | pca_internal           | 100 / 1K / 10K     | —
///
/// Edge cases: empty input and single-row input for each algorithm.
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use std::time::Duration;
use wasm4pm::fast_discovery::cluster_traces;
use wasm4pm::ml::classification::{extract_features, knn_internal};
use wasm4pm::ml::forecasting::forecast_internal;
use wasm4pm::ml::pca::pca_internal;
use wasm4pm::ml::regression::regression_internal;

#[path = "helpers.rs"]
mod helpers;
use helpers::{bench_sizes, bench_sizes_slow, make_handle, Lcg, LogShape, ACTIVITY_KEY};

// ─────────────────────────────────────────────────────────────────────────────
// Pure-data generators (no APP_STATE required)
// ─────────────────────────────────────────────────────────────────────────────

/// Generate (features, labels) pairs — same distribution as `extract_features`.
fn make_classify_data(n: usize) -> (Vec<[f64; 2]>, Vec<u8>) {
    let mut rng = Lcg::new(0xFEED_FACE_CAFE_BABE);
    let features: Vec<[f64; 2]> = (0..n)
        .map(|_| {
            let len = 1.0 + rng.next_f64_unit() * 49.0; // trace length 1-50
            let uniq = 1.0 + rng.next_f64_unit() * 14.0; // unique activities 1-15
            [len, uniq]
        })
        .collect();
    let labels: Vec<u8> = features
        .iter()
        .map(|f| {
            if f[0] < 10.0 {
                0
            } else if f[0] <= 30.0 {
                1
            } else {
                2
            }
        })
        .collect();
    (features, labels)
}

/// Generate (x, y) pairs for regression (trace_length → case_duration).
fn make_regression_data(n: usize) -> (Vec<f64>, Vec<f64>) {
    let mut rng = Lcg::new(0xDEAD_BEEF_0000_0001);
    let x: Vec<f64> = (0..n).map(|i| i as f64 + rng.next_f64_unit()).collect();
    let y: Vec<f64> = x
        .iter()
        .map(|&xi| 2.5 * xi + 100.0 + rng.next_f64_unit() * 10.0)
        .collect();
    (x, y)
}

/// Generate a windowed event-rate series for forecasting.
fn make_forecast_data(n: usize) -> Vec<f64> {
    let mut rng = Lcg::new(0xABCD_EF01_2345_6789);
    (0..n)
        .map(|i| {
            let base = 10.0 + 0.05 * i as f64;
            (base + rng.next_f64_unit() * 2.0 - 1.0).max(0.0)
        })
        .collect()
}

/// Generate 2-D features for PCA.
fn make_pca_data(n: usize) -> Vec<[f64; 2]> {
    let mut rng = Lcg::new(0x1234_5678_9ABC_DEF0);
    (0..n)
        .map(|_| [rng.next_f64_unit() * 50.0, rng.next_f64_unit() * 15.0])
        .collect()
}

/// Compute anomaly score for a single trace against a synthetic frequency map.
///
/// Mirrors the inner loop of `score_log_anomalies` without APP_STATE.
/// Returns the mean -log2(p) cost per step.
fn score_trace_pure(activities: &[usize], freq_map: &[u32], vocab: usize) -> f64 {
    const MISSING: f64 = 10.0;
    if activities.len() < 2 {
        return 0.0;
    }
    let steps = activities.len() - 1;
    let mut cost = 0.0_f64;
    for i in 0..steps {
        let from = activities[i];
        let to = activities[i + 1];
        // total outgoing from `from`
        let from_total: u32 = (0..vocab).map(|t| freq_map[from * vocab + t]).sum::<u32>().max(1);
        let freq = freq_map[from * vocab + to];
        cost += if freq == 0 {
            MISSING
        } else {
            -(freq as f64 / from_total as f64).log2()
        };
    }
    cost / steps as f64
}

/// Benchmark anomaly scoring across `n` traces of length 10.
fn bench_anomaly_pure(n: usize) -> f64 {
    let vocab = 20usize;
    let mut rng = Lcg::new(0x5678_9ABC_DEF0_1234);
    // Build a synthetic frequency matrix
    let freq_map: Vec<u32> = (0..vocab * vocab)
        .map(|_| (rng.next() % 20) as u32)
        .collect();
    let mut total = 0.0_f64;
    for _ in 0..n {
        let len = 5 + (rng.next() as usize % 10);
        let activities: Vec<usize> = (0..len).map(|_| rng.next() as usize % vocab).collect();
        total += score_trace_pure(&activities, &freq_map, vocab);
    }
    total
}

// ─────────────────────────────────────────────────────────────────────────────
// ml_classify — knn_internal
// ─────────────────────────────────────────────────────────────────────────────

fn bench_ml_classify(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml_classify");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for &n in &[100_usize, 1_000, 10_000] {
        let (features, labels) = make_classify_data(n);
        let train_size = (n as f64 * 0.8) as usize;
        let train_x = features[..train_size].to_vec();
        let train_y = labels[..train_size].to_vec();
        let test_x = features[train_size..].to_vec();
        let test_y = labels[train_size..].to_vec();

        group.throughput(Throughput::Elements(n as u64));
        for k in [3_usize, 5, 10] {
            group.bench_with_input(
                BenchmarkId::new(format!("k{}", k), n),
                &k,
                |b, &k| {
                    b.iter(|| {
                        black_box(knn_internal(
                            black_box(&train_x),
                            black_box(&train_y),
                            black_box(&test_x),
                            black_box(&test_y),
                            k,
                        ))
                    })
                },
            );
        }
    }

    // Edge cases
    group.bench_function("empty", |b| {
        b.iter(|| {
            black_box(knn_internal(
                black_box(&[]),
                black_box(&[]),
                black_box(&[]),
                black_box(&[]),
                3,
            ))
        })
    });
    group.bench_function("single_row", |b| {
        let f = vec![[5.0_f64, 3.0]];
        let l = vec![0u8];
        b.iter(|| black_box(knn_internal(black_box(&f), black_box(&l), black_box(&f), black_box(&l), 1)))
    });

    group.finish();
}

// ─────────────────────────────────────────────────────────────────────────────
// ml_cluster — cluster_traces (handle-based; no standalone internal)
// ─────────────────────────────────────────────────────────────────────────────

fn bench_ml_cluster(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml_cluster");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(30);

    for shape in bench_sizes_slow() {
        let (handle, events) = make_handle(&shape);
        group.throughput(Throughput::Elements(events as u64));
        for k in [3_usize, 5, 10] {
            group.bench_with_input(
                BenchmarkId::new(format!("k{}_n{}", k, shape.num_cases), shape.num_cases),
                &(&handle, k),
                |b, (h, k)| b.iter(|| black_box(cluster_traces(h, ACTIVITY_KEY, *k).unwrap())),
            );
        }
    }

    group.finish();
}

// ─────────────────────────────────────────────────────────────────────────────
// ml_forecast — forecast_internal
// ─────────────────────────────────────────────────────────────────────────────

fn bench_ml_forecast(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml_forecast");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for &n in &[100_usize, 1_000, 10_000] {
        let data = make_forecast_data(n);
        group.throughput(Throughput::Elements(n as u64));
        for alpha in [0.1_f64, 0.2, 0.3] {
            group.bench_with_input(
                BenchmarkId::new(format!("a{:.1}", alpha), n),
                &alpha,
                |b, &alpha| b.iter(|| black_box(forecast_internal(black_box(&data), alpha))),
            );
        }
    }

    // Edge cases
    group.bench_function("empty", |b| {
        b.iter(|| black_box(forecast_internal(black_box(&[]), 0.3)))
    });
    group.bench_function("single_point", |b| {
        let data = vec![5.0_f64];
        b.iter(|| black_box(forecast_internal(black_box(&data), 0.3)))
    });

    group.finish();
}

// ─────────────────────────────────────────────────────────────────────────────
// ml_anomaly — pure edge-scoring loop (mirrors score_log_anomalies inner loop)
// ─────────────────────────────────────────────────────────────────────────────

fn bench_ml_anomaly(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml_anomaly");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for &n in &[100_usize, 1_000, 10_000] {
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(n),
            &n,
            |b, &n| b.iter(|| black_box(bench_anomaly_pure(n))),
        );
    }

    // Edge cases
    group.bench_function("empty_trace", |b| {
        let vocab = 5usize;
        let freq_map = vec![1u32; vocab * vocab];
        b.iter(|| black_box(score_trace_pure(black_box(&[]), black_box(&freq_map), vocab)))
    });
    group.bench_function("single_activity_trace", |b| {
        let vocab = 5usize;
        let freq_map = vec![1u32; vocab * vocab];
        b.iter(|| black_box(score_trace_pure(black_box(&[2usize]), black_box(&freq_map), vocab)))
    });

    group.finish();
}

// ─────────────────────────────────────────────────────────────────────────────
// ml_regress — regression_internal
// ─────────────────────────────────────────────────────────────────────────────

fn bench_ml_regress(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml_regress");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for &n in &[100_usize, 1_000, 10_000] {
        let (x, y) = make_regression_data(n);
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(n),
            &n,
            |b, _| b.iter(|| black_box(regression_internal(black_box(&x), black_box(&y)))),
        );
    }

    // Edge cases
    group.bench_function("empty", |b| {
        b.iter(|| black_box(regression_internal(black_box(&[]), black_box(&[]))))
    });
    group.bench_function("single_point", |b| {
        b.iter(|| black_box(regression_internal(black_box(&[1.0]), black_box(&[2.5]))))
    });

    group.finish();
}

// ─────────────────────────────────────────────────────────────────────────────
// ml_pca — pca_internal
// ─────────────────────────────────────────────────────────────────────────────

fn bench_ml_pca(c: &mut Criterion) {
    let mut group = c.benchmark_group("ml_pca");
    group.measurement_time(Duration::from_secs(10));
    group.warm_up_time(Duration::from_secs(2));
    group.sample_size(50);

    for &n in &[100_usize, 1_000, 10_000] {
        let features = make_pca_data(n);
        group.throughput(Throughput::Elements(n as u64));
        group.bench_with_input(
            BenchmarkId::from_parameter(n),
            &n,
            |b, _| b.iter(|| black_box(pca_internal(black_box(&features)))),
        );
    }

    // Edge cases
    group.bench_function("empty", |b| {
        b.iter(|| black_box(pca_internal(black_box(&[]))))
    });
    group.bench_function("single_row", |b| {
        let features = vec![[5.0_f64, 3.0]];
        b.iter(|| black_box(pca_internal(black_box(&features))))
    });
    group.bench_function("degenerate_identical_rows", |b| {
        let features = vec![[5.0_f64, 3.0]; 100];
        b.iter(|| black_box(pca_internal(black_box(&features))))
    });

    group.finish();
}

criterion_group!(
    ml_benches,
    bench_ml_classify,
    bench_ml_cluster,
    bench_ml_forecast,
    bench_ml_anomaly,
    bench_ml_regress,
    bench_ml_pca,
);
criterion_main!(ml_benches);
