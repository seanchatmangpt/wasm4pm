//! Comprehensive WASM Performance Benchmarks
//!
//! Direct Rust benchmarks for all ML algorithms in miniml-core.
//! This measures pure WASM performance without TypeScript wrapper overhead.

use std::time::{Duration, Instant};

// Criterion benchmark setup
use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};

// Import all algorithms
use wminml::{
    // Classification
    knn_fit_impl, KnnModel,
    decision_tree_impl, DecisionTreeModel,
    naive_bayes_fit_impl, NaiveBayesModel,
    logistic_regression, LogisticRegressionModel,
    perceptron, PerceptronModel,

    // Ensemble
    random_forest_impl, RandomForestModel,
    gradient_boosting_impl, GradientBoostingClassifier,
    adaboost_impl, AdaBoostClassifier,

    // Regression
    linear_regression::linear_regression,
    linear_regression::ridge_regression,
    polynomial_regression,

    // Clustering
    kmeans_impl, KmeansModel,
    kmeans_plus_impl,
    dbscan_impl,
    hierarchical_clustering_impl,

    // Preprocessing
    standard_scaler,
    minmax_scaler,
    robust_scaler,
    label_encoder,
    one_hot_encoder,

    // Metrics
    confusion_matrix,
    silhouette_score,
    classification_report,

    // Dimensionality Reduction
    pca_impl, PcaModel,

    // SVM
    linear_svm,

    // Time Series
    exponential_smoothing,
    moving_average,
};

// Helper to generate test data
fn generate_data(n_samples: usize, n_features: usize) -> Vec<f64> {
    (0..n_samples * n_features).map(|i| {
        // Use deterministic random based on index for reproducibility
        let x = ((i as f64) * 0.12345) % 1.0;
        x
    }).collect()
}

fn generate_labels(n_samples: usize, n_classes: u32) -> Vec<f64> {
    (0..n_samples).map(|i| {
        ((i as f64) * 0.7321 % n_classes as f64).floor()
    }).collect()
}

fn benchmark_group(c: &mut Criterion) {
    // ==================== CLASSIFICATION ====================
    c.bench_function("knn_fit_1000x100", |b| {
        let x = generate_data(1000, 100);
        let y = generate_labels(1000, 3);
        b.iter(|| {
            black_box(knn_fit_impl(&x, 100, &y, 5).unwrap())
        })
    });

    c.bench_function("knn_predict_single", |b| {
        let x = generate_data(1000, 100);
        let y = generate_labels(1000, 3);
        let model = knn_fit_impl(&x, 100, &y, 5).unwrap();
        let test_point = &generate_data(1, 100);
        b.iter(|| {
            black_box(model.predict(test_point))
        })
    });

    c.bench_function("decision_tree_1000x20", |b| {
        let x = generate_data(1000, 20);
        let y = generate_labels(1000, 3);
        b.iter(|| {
            black_box(decision_tree_impl(&x, 20, &y, 10).unwrap())
        })
    });

    c.bench_function("naive_bayes_1000x100", |b| {
        let x = generate_data(1000, 100);
        let y = generate_labels(1000, 3);
        b.iter(|| {
            black_box(naive_bayes_fit_impl(&x, 100, &y).unwrap())
        })
    });

    c.bench_function("logistic_regression_1000x50", |b| {
        let x = generate_data(1000, 50);
        let y = generate_labels(1000, 2);
        b.iter(|| {
            black_box(logistic_regression(&x, 1000, 50, &y, 1000, 0.01).unwrap())
        })
    });

    c.bench_function("perceptron_1000x50", |b| {
        let x = generate_data(1000, 50);
        let y = generate_labels(1000, 2);
        b.iter(|| {
            black_box(perceptron(&x, 1000, 50, &y, 0.01, 1000).unwrap())
        })
    });

    // ==================== ENSEMBLE METHODS ====================
    c.bench_function("random_forest_1000x20_100trees", |b| {
        let x = generate_data(1000, 20);
        let y = generate_labels(1000, 3);
        b.iter(|| {
            black_box(random_forest_impl(&x, 20, &y, 100, 10, true).unwrap())
        })
    });

    c.bench_function("gradient_boosting_500x10_50trees", |b| {
        let x = generate_data(500, 10);
        let y = generate_labels(500, 2);
        b.iter(|| {
            black_box(gradient_boosting_impl(&x, 10, &y, 50, 5, 0.1).unwrap())
        })
    });

    c.bench_function("adaboost_500x10_50estimators", |b| {
        let x = generate_data(500, 10);
        let y = generate_labels(500, 2);
        b.iter(|| {
            black_box(adaboost_impl(&x, 10, &y, 50).unwrap())
        })
    });

    // ==================== REGRESSION ====================
    c.bench_function("linear_regression_1000x50", |b| {
        let x = generate_data(1000, 50);
        let y: Vec<f64> = (0..1000).map(|i| i as f64 * 2.0 + 1.0).collect();
        b.iter(|| {
            black_box(linear_regression(&x, 1000, 50, &y))
        })
    });

    c.bench_function("ridge_regression_1000x50", |b| {
        let x = generate_data(1000, 50);
        let y: Vec<f64> = (0..1000).map(|i| i as f64 * 2.0 + 1.0).collect();
        b.iter(|| {
            black_box(ridge_regression(&x, &y, 1.0, 1000, 50))
        })
    });

    c.bench_function("polynomial_regression_500x5_degree3", |b| {
        let x = generate_data(500, 5);
        let y: Vec<f64> = (0..500).map(|i| (i as f64).powi(2)).collect();
        b.iter(|| {
            black_box(polynomial_regression(&x, 500, 5, &y, 3))
        })
    });

    // ==================== CLUSTERING ====================
    c.bench_function("kmeans_1000x20_10clusters", |b| {
        let x = generate_data(1000, 20);
        b.iter(|| {
            black_box(kmeans_impl(&x, 20, 10, 100).unwrap())
        })
    });

    c.bench_function("kmeans_plus_1000x20_10clusters", |b| {
        let x = generate_data(1000, 20);
        b.iter(|| {
            black_box(kmeans_plus_impl(&x, 10, 100, 1000, 20).unwrap())
        })
    });

    c.bench_function("dbscan_500x10", |b| {
        let x = generate_data(500, 10);
        b.iter(|| {
            black_box(dbscan_impl(&x, 10, 0.5, 5))
        })
    });

    c.bench_function("hierarchical_clustering_500x10_5clusters", |b| {
        let x = generate_data(500, 10);
        b.iter(|| {
            black_box(hierarchical_clustering_impl(&x, 10, 5))
        })
    });

    // ==================== PREPROCESSING ====================
    c.bench_function("standard_scaler_1000x100", |b| {
        let x = generate_data(1000, 100);
        b.iter(|| {
            black_box(standard_scaler(&x, 1000, 100))
        })
    });

    c.bench_function("minmax_scaler_1000x100", |b| {
        let x = generate_data(1000, 100);
        b.iter(|| {
            black_box(minmax_scaler(&x, 1000, 100))
        })
    });

    c.bench_function("robust_scaler_1000x100", |b| {
        let x = generate_data(1000, 100);
        b.iter(|| {
            black_box(robust_scaler(&x, 1000, 100))
        })
    });

    c.bench_function("label_encoder_1000", |b| {
        let y: Vec<f64> = (0..1000).map(|i| (i % 10) as f64).collect();
        b.iter(|| {
            black_box(label_encoder(&y))
        })
    });

    c.bench_function("one_hot_encoder_500_5classes", |b| {
        let y: Vec<f64> = (0..500).map(|i| (i % 5) as f64).collect();
        b.iter(|| {
            black_box(one_hot_encoder(&y, 5))
        })
    });

    // ==================== DIMENSIONALITY REDUCTION ====================
    c.bench_function("pca_1000x50_to_10", |b| {
        let x = generate_data(1000, 50);
        b.iter(|| {
            black_box(pca_impl(&x, 1000, 50, 10).unwrap())
        })
    });

    // ==================== METRICS ====================
    c.bench_function("confusion_matrix_1000", |b| {
        let y_true: Vec<f64> = (0..1000).map(|i| (i % 3) as f64).collect();
        let y_pred: Vec<f64> = (0..1000).map(|i| ((i + 1) % 3) as f64).collect();
        b.iter(|| {
            black_box(confusion_matrix(&y_true, &y_pred))
        })
    });

    c.bench_function("silhouette_score_500x10", |b| {
        let x = generate_data(500, 10);
        let labels = generate_labels(500, 3);
        b.iter(|| {
            black_box(silhouette_score(&x, &labels, 500, 10))
        })
    });

    // ==================== SVM ====================
    c.bench_function("linear_svm_500x20", |b| {
        let x = generate_data(500, 20);
        let y = generate_labels(500, 2);
        b.iter(|| {
            black_box(line_svm(&x, &y, 0.01, 1000, 500, 20))
        })
    });

    // ==================== TIME SERIES ====================
    c.bench_function("exponential_smoothing_500", |b| {
        let data: Vec<f64> = (0..500).map(|i| 100.0 + (i as f64) * 0.1).collect();
        b.iter(|| {
            black_box(exponential_smoothing(&data, 0.5))
        })
    });

    c.bench_function("moving_average_500_window10", |b| {
        let data: Vec<f64> = (0..500).map(|i| 100.0 + (i as f64) * 0.1).collect();
        b.iter(|| {
            black_box(moving_average(&data, 10))
        })
    });
}

// Scaling benchmarks - test performance with different input sizes
fn scaling_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("scaling");

    for &n_samples in &[100, 500, 1000, 5000] {
        for &n_features in &[10, 50, 100] {
            group.bench_with_input(
                BenchmarkId::new(format!("knn_{}x{}", n_samples, n_features)),
                (n_samples, n_features),
                |b, (n_samples, n_features)| {
                    let x = generate_data(n_samples, n_features);
                    let y = generate_labels(n_samples, 3);
                    b.iter(|| {
                        black_box(knn_fit_impl(&x, n_features, &y, 5).unwrap())
                    })
                },
            );
        }
    }

    group.finish();
}

// SIMD benchmarks - compare scalar vs SIMD performance
fn simd_benchmarks(c: &mut Criterion) {
    let mut group = c.benchmark_group("simd");

    // Distance calculation benchmarks
    for n_features in &[10, 50, 100, 500] {
        let data = generate_data(1000, n_features);

        group.bench_with_input(
            BenchmarkId::new(format!("euclidean_dist_scalar_{}", n_features)),
            n_features,
            |b, n_features| {
                let a = 0;
                let b_idx = 500;
                b.iter(|| {
                    let mut sum = 0.0;
                    for j in 0..n_features {
                        let d = data[a * n_features + j] - data[b_idx * n_features + j];
                        sum += d * d;
                    }
                    black_box(sum)
                })
            },
        );

        #[cfg(target_arch = "wasm32")]
        group.bench_with_input(
            BenchmarkId::new(format!("euclidean_dist_simd_{}", n_features)),
            n_features,
            |b, n_features| {
                let a = 0;
                let b_idx = 500;
                b.iter(|| {
                    black_box(euclidean_dist_sq_simd(&data, n_features, a, b_idx))
                })
            },
        );
    }

    group.finish();
}

criterion_group!(benches, benchmark_group, scaling_benchmarks, simd_benchmarks);
criterion_main!(benches);
