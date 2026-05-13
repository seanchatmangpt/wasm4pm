//! Trustworthy Comprehensive Performance Benchmarks — wminml
//!
//! Uses warmup + repeated iterations with nanosecond precision.
//! Prevents dead-code elimination via std::hint::black_box.
//! Reports mean, median, and coefficient of variation (CV%).
//!
//! Run: cargo run --bin bench_all --release

#![allow(unused_must_use)]
#![allow(dead_code)]
//!
//! Uses warmup + repeated iterations with nanosecond precision.
//! Prevents dead-code elimination via std::hint::black_box.
//! Reports mean, median, and coefficient of variation (CV%).
//!
//! Run: cargo run --bin bench_all --release

use std::hint::black_box;
use std::time::Instant;

use wminml::*;
use wminml::optimization::genetic::GeneticAlgorithm;
use wminml::optimization::genetic::rand_f64;
use wminml::optimization::pso::PSO;
use wminml::optimization::annealing::SimulatedAnnealing;
use wminml::optimization::drift::*;
use wminml::optimization::anomaly::*;
use wminml::optimization::{FitnessFunction, Individual};

// ── helpers ──────────────────────────────────────────────────────────

fn gen_data(n: usize, f: usize) -> Vec<f64> {
    (0..n * f).map(|i| ((i as f64) * 0.12345) % 1.0).collect()
}

fn gen_labels(n: usize, classes: u32) -> Vec<f64> {
    (0..n).map(|i| ((i as f64) * 0.7321 % classes as f64).floor()).collect()
}

fn ts_data(n: usize) -> Vec<f64> {
    (0..n).map(|i| 100.0 + (i as f64) * 0.1 + ((i as f64 * 0.3).sin() * 10.0)).collect()
}

/// Benchmark result with statistics
struct BenchResult {
    mean_ns: f64,
    median_ns: f64,
    cv: f64, // coefficient of variation %
}

/// Time a function with warmup, repeated iterations, and nanosecond precision.
/// Uses black_box to prevent compiler dead-code elimination.
fn bench(warmup: usize, iters: usize, f: impl Fn()) -> BenchResult {
    // Warmup: stabilize caches and branch prediction
    for _ in 0..warmup {
        f();
    }
    black_box(());

    // Timed iterations
    let mut samples = Vec::with_capacity(iters);
    for _ in 0..iters {
        let t = Instant::now();
        f();
        let elapsed_ns = t.elapsed().as_nanos() as u64;
        black_box(elapsed_ns);
        samples.push(elapsed_ns);
    }

    // Compute statistics
    let mean = samples.iter().sum::<u64>() as f64 / iters as f64;
    let mut sorted = samples.clone();
    sorted.sort_unstable();
    let median = sorted[iters / 2] as f64;
    let variance = samples.iter().map(|s| (*s as f64 - mean).powi(2)).sum::<f64>() / iters as f64;
    let stddev = variance.sqrt();
    let cv = if mean > 0.0 { (stddev / mean) * 100.0 } else { 0.0 };

    BenchResult { mean_ns: mean, median_ns: median, cv }
}

/// Format a duration in nanoseconds to human-readable string with appropriate unit.
fn fmt_duration(ns: f64) -> String {
    if ns < 1000.0 {
        format!("{:.0}μs", ns / 1000.0) // actually <1μs, but avoid "0μs"
    } else if ns < 1_000_000.0 {
        format!("{:.1}μs", ns / 1000.0)
    } else if ns < 1_000_000_000.0 {
        format!("{:.2}ms", ns / 1_000_000.0)
    } else {
        format!("{:.2}s", ns / 1_000_000_000.0)
    }
}

/// Format duration for the results table (always in ms for consistency)
fn fmt_ms(ns: f64) -> String {
    if ns < 1000.0 {
        format!("{:.4}", ns / 1_000_000.0) // sub-millisecond with 4 decimal places
    } else if ns < 1_000_000_000.0 {
        format!("{:.2}", ns / 1_000_000.0)
    } else {
        format!("{:.2}", ns / 1_000_000_000.0 * 1000.0) // seconds → ms
    }
}

// ── Sphere fitness for optimization benchmarks ───────────────────────

struct SphereFitness;

impl FitnessFunction<f64> for SphereFitness {
    fn evaluate(&self, individual: &Individual<f64>) -> f64 {
        individual.genes.iter().map(|x| x * x).sum::<f64>()
    }
    fn dimension(&self) -> usize { 20 }
}

// ── main ─────────────────────────────────────────────────────────────

fn main() {
    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║  wminml — Trustworthy Performance Benchmarks            ║");
    println!("║  Methodology: warmup + N iterations, nanosecond precision    ║");
    println!("║  Anti-optimization: std::hint::black_box on all results     ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();

    let mut results: Vec<(&'static str, &'static str, f64)> = Vec::new();

    macro_rules! bench_row {
        ($cat:expr, $label:expr, $warmup:expr, $iters:expr, $expr:expr) => {
            let r = bench($warmup, $iters, $expr);
            let dur_str = fmt_duration(r.mean_ns);
            results.push(($cat, $label, r.mean_ns));
            println!("  {:50} {:>12}  cv={:5.1}%", $label, dur_str, r.cv);
        };
    }

    // ═══════════════════════ CLASSIFICATION ═══════════════════════
    println!("── Classification ──");

    let x = gen_data(5000, 100);
    let y = gen_labels(5000, 3);
    bench_row!("Classification", "KNN (5000x100, k=5)", 3, 10, || {
        black_box(knn_fit_impl(&x, 100, &y, 5));
    });

    let x = gen_data(5000, 50);
    let y = gen_labels(5000, 3);
    bench_row!("Classification", "Decision Tree (5000x50)", 3, 10, || {
        black_box(decision_tree_impl(&x, 50, &y, 10, 2, true));
    });

    let x = gen_data(10000, 100);
    let y = gen_labels(10000, 3);
    bench_row!("Classification", "Naive Bayes (10000x100)", 10, 50, || {
        black_box(naive_bayes_impl(&x, 100, &y));
    });

    let x = gen_data(2000, 50);
    let y = gen_labels(2000, 2);
    bench_row!("Classification", "Logistic Regression (2000x50)", 3, 10, || {
        black_box(logistic_regression_impl(&x, 50, &y, 0.01, 1000, 0.001));
    });

    bench_row!("Classification", "Perceptron (2000x50)", 3, 10, || {
        black_box(perceptron_impl(&x, 50, &y, 0.01, 1000));
    });

    let x = gen_data(2000, 50);
    let y = gen_labels(2000, 2);
    bench_row!("Classification", "Linear SVM (2000x50)", 3, 10, || {
        black_box(linear_svm_impl(&x, 50, &y, 0.01, 1000, 0.01));
    });

    // ═══════════════════════ ENSEMBLE METHODS ═══════════════════════
    println!("\n── Ensemble Methods ──");

    let x = gen_data(1000, 20);
    let y = gen_labels(1000, 3);
    bench_row!("Ensemble", "Random Forest (1000x20, 100 trees)", 1, 5, || {
        black_box(random_forest_impl(&x, 20, &y, 100, 10, 2, true));
    });

    let x = gen_data(1000, 20);
    let y = gen_labels(1000, 2);
    bench_row!("Ensemble", "Gradient Boosting (1000x20, 50 trees)", 1, 5, || {
        black_box(gradient_boosting_impl(&x, 20, &y, 50, 5, 0.1));
    });

    bench_row!("Ensemble", "AdaBoost (1000x20, 50 est)", 1, 5, || {
        black_box(adaboost_impl(&x, 20, &y, 50, 0.1));
    });

    // ═══════════════════════ REGRESSION ═══════════════════════
    println!("\n── Regression ──");

    let x: Vec<f64> = (0..100000).map(|i| i as f64).collect();
    let y: Vec<f64> = (0..100000).map(|i| i as f64 * 2.0 + 1.0).collect();
    bench_row!("Regression", "Linear Regression (100K)", 50, 1000, || {
        black_box(linear_regression_impl(&x, &y));
    });

    let data = gen_data(50000, 50);
    let targets: Vec<f64> = (0..50000).map(|i| i as f64 * 0.5).collect();
    bench_row!("Regression", "Ridge Regression (50Kx50)", 5, 50, || {
        black_box(ridge_regression_impl(&data, 50, &targets, 1.0));
    });

    bench_row!("Regression", "Lasso Regression (50Kx50)", 5, 50, || {
        black_box(lasso_regression_impl(&data, 50, &targets, 1.0, 1000, 1e-4));
    });

    let x: Vec<f64> = (0..10000).map(|i| i as f64 / 100.0).collect();
    let y: Vec<f64> = (0..10000).map(|i| (i as f64 / 100.0).powi(2)).collect();
    bench_row!("Regression", "Polynomial Regression (10K, deg 3)", 50, 1000, || {
        black_box(polynomial_regression_impl(&x, &y, 3));
    });

    let y: Vec<f64> = (0..10000).map(|i| (1.05_f64).powf(i as f64 / 100.0)).collect();
    bench_row!("Regression", "Exponential Regression (10K)", 50, 1000, || {
        black_box(exponential_regression_impl(&x, &y));
    });

    let x_log: Vec<f64> = (1..10001).map(|i| i as f64 / 100.0).collect();
    bench_row!("Regression", "Logarithmic Regression (10K)", 50, 1000, || {
        black_box(logarithmic_regression_impl(&x_log, &y));
    });

    bench_row!("Regression", "Power Regression (10K)", 50, 1000, || {
        black_box(power_regression_impl(&x_log, &y));
    });

    // ═══════════════════════ CLUSTERING ═══════════════════════
    println!("\n── Clustering ──");

    let x = gen_data(5000, 50);
    bench_row!("Clustering", "K-Means (5000x50, k=20)", 3, 10, || {
        black_box(kmeans_impl(&x, 50, 20, 100));
    });

    bench_row!("Clustering", "K-Means++ (5000x50, k=20)", 3, 10, || {
        black_box(kmeans_plus_impl(&x, 50, 20, 100));
    });

    let x = gen_data(5000, 20);
    bench_row!("Clustering", "DBSCAN (5000x20)", 3, 10, || {
        black_box(dbscan_impl(&x, 20, 0.5, 5));
    });

    let x = gen_data(1000, 20);
    bench_row!("Clustering", "Hierarchical (1000x20, k=10)", 1, 5, || {
        black_box(hierarchical_impl(&x, 20, 10));
    });

    // ═══════════════════════ PREPROCESSING ═══════════════════════
    println!("\n── Preprocessing ──");

    let x = gen_data(100000, 100);
    bench_row!("Preprocessing", "Standard Scaler (100Kx100)", 100, 1000, || {
        let mut s = standard_scaler(100);
        black_box(s.fit_transform(&x));
    });

    bench_row!("Preprocessing", "MinMax Scaler (100Kx100)", 100, 1000, || {
        let mut s = minmax_scaler(100);
        black_box(s.fit_transform(&x));
    });

    bench_row!("Preprocessing", "Robust Scaler (100Kx100)", 100, 1000, || {
        let mut s = robust_scaler(100);
        black_box(s.fit_transform(&x));
    });

    bench_row!("Preprocessing", "Normalizer (100Kx100)", 100, 1000, || {
        let s = normalizer(100, "l2".to_string());
        black_box(s.fit_transform(&x));
    });

    let y = gen_labels(100000, 10);

    bench_row!("Preprocessing", "Label Encoder (100K)", 100, 1000, || {
        let mut e = label_encoder();
        black_box(e.fit_transform(&y));
    });

    bench_row!("Preprocessing", "One-Hot Encoder (100K, 50 classes)", 100, 1000, || {
        let mut e = one_hot_encoder(50);
        black_box(e.fit_transform(&y));
    });

    bench_row!("Preprocessing", "Ordinal Encoder (100K)", 100, 1000, || {
        let mut e = ordinal_encoder(50);
        black_box(e.fit_transform(&y));
    });

    let mut x_missing = gen_data(100000, 50);
    for i in (0..x_missing.len()).step_by(100) { x_missing[i] = f64::NAN; }
    bench_row!("Preprocessing", "Imputer (100Kx50)", 100, 1000, || {
        let mut imp = simple_imputer(50, "mean".to_string(), 0.0);
        black_box(imp.fit_transform(&x_missing));
    });

    // ═══════════════════════ DIMENSIONALITY REDUCTION ═══════════════════════
    println!("\n── Dimensionality Reduction ──");

    let x = gen_data(5000, 100);
    bench_row!("Dim. Reduction", "PCA (5000x100 → 20)", 5, 20, || {
        black_box(pca_impl(&x, 100, 20));
    });

    // ═══════════════════════ TIME SERIES ═══════════════════════
    println!("\n── Time Series ──");

    let data = ts_data(100000);

    bench_row!("Time Series", "SMA (100K, w=50)", 100, 1000, || {
        black_box(sma(&data, 50));
    });

    bench_row!("Time Series", "EMA (100K, w=50)", 100, 1000, || {
        black_box(ema(&data, 50));
    });

    bench_row!("Time Series", "WMA (100K, w=50)", 100, 1000, || {
        black_box(wma(&data, 50));
    });

    bench_row!("Time Series", "Exponential Smoothing (100K)", 100, 1000, || {
        black_box(exponential_smoothing_impl(&data, 0.5));
    });

    bench_row!("Time Series", "Moving Average generic (100K)", 100, 1000, || {
        black_box(moving_average(&data, 50, MovingAverageType::SMA));
    });

    bench_row!("Time Series", "Trend Forecast (100K)", 100, 1000, || {
        black_box(trend_forecast(&data, 50));
    });

    bench_row!("Time Series", "Rate of Change (100K)", 100, 1000, || {
        black_box(rate_of_change(&data, 50));
    });

    bench_row!("Time Series", "Momentum (100K)", 100, 1000, || {
        black_box(momentum(&data, 50));
    });

    bench_row!("Time Series", "Peak Detection (100K)", 100, 1000, || {
        black_box(find_peaks(&data));
    });

    bench_row!("Time Series", "Trough Detection (100K)", 100, 1000, || {
        black_box(find_troughs(&data));
    });

    bench_row!("Time Series", "Autocorrelation (100K, lag=100)", 10, 100, || {
        black_box(autocorrelation(&data, 100));
    });

    let data_decompose = ts_data(10000);
    bench_row!("Time Series", "Seasonal Decompose (10K, p=12)", 10, 100, || {
        black_box(seasonal_decompose_impl(&data_decompose, 12));
    });

    // ═══════════════════════ METRICS ═══════════════════════
    println!("\n── Metrics ──");

    let yt: Vec<f64> = (0..100000).map(|i| (i % 3) as f64).collect();
    let yp: Vec<f64> = (0..100000).map(|i| ((i + 1) % 3) as f64).collect();

    bench_row!("Metrics", "Confusion Matrix (100K)", 100, 1000, || {
        black_box(confusion_matrix_impl(&yt, &yp));
    });

    let x = gen_data(5000, 50);
    let labels = gen_labels(5000, 3);
    bench_row!("Metrics", "Silhouette Score (5000x50)", 3, 10, || {
        black_box(silhouette_score_impl(&x, 50, &labels));
    });

    bench_row!("Metrics", "Davies-Bouldin (5000x50)", 10, 50, || {
        black_box(davies_bouldin_impl(&x, 50, &labels));
    });

    bench_row!("Metrics", "Calinski-Harabasz (5000x50)", 10, 50, || {
        black_box(calinski_harabasz_impl(&x, 50, &labels));
    });

    bench_row!("Metrics", "Matthews Corrcoef (100K)", 100, 1000, || {
        black_box(matthews_corrcoef_impl(&yt, &yp));
    });

    bench_row!("Metrics", "Cohen's Kappa (100K)", 100, 1000, || {
        black_box(cohens_kappa_impl(&yt, &yp));
    });

    bench_row!("Metrics", "Balanced Accuracy (100K)", 100, 1000, || {
        black_box(balanced_accuracy_impl(&yt, &yp));
    });

    let yt_r: Vec<f64> = (0..100000).map(|i| i as f64 * 2.0).collect();
    let yp_r: Vec<f64> = (0..100000).map(|i| i as f64 * 2.0 + 1.0).collect();

    bench_row!("Metrics", "MSE (100K)", 100, 1000, || {
        black_box(mean_squared_error_impl(&yt_r, &yp_r));
    });

    bench_row!("Metrics", "RMSE (100K)", 100, 1000, || {
        black_box(root_mean_squared_error_impl(&yt_r, &yp_r));
    });

    bench_row!("Metrics", "MAE (100K)", 100, 1000, || {
        black_box(mean_absolute_error_impl(&yt_r, &yp_r));
    });

    // ═══════════════════════ NEURAL NETWORKS ═══════════════════════
    println!("\n── Neural Networks ──");

    let x = gen_data(1000, 10);
    let net = NeuralNet::new(ActivationType::ReLU)
        .add_layer(Layer::dense(10, 32))
        .add_layer(Layer::dense(32, 2))
        .with_optimizer(Optimizer::sgd(0.01));

    bench_row!("Neural Nets", "Forward pass (1000 samples)", 3, 10, || {
        for i in 0..1000 {
            black_box(net.forward(&x[i * 10..(i + 1) * 10]));
        }
    });

    let x_train = gen_data(500, 20);
    let y_train = gen_labels(500, 2);
    bench_row!("Neural Nets", "Train (500x20, 50 epochs)", 3, 10, || {
        let mut net2 = NeuralNet::new(ActivationType::ReLU)
            .add_layer(Layer::dense(20, 32))
            .add_layer(Layer::dense(32, 2))
            .with_optimizer(Optimizer::sgd(0.01));
        black_box(net2.train(&x_train, &y_train, 500, 20, 50, 32));
    });

    // ═══════════════════════ AUTOML ═════════════════════════
    println!("\n── AutoML ──");

    let x = gen_data(500, 20);
    let y = gen_labels(500, 2);
    bench_row!("AutoML", "AutoFit Classification (500x20)", 3, 10, || {
        black_box(auto_fit_classification(&x, &y, 500, 20));
    });

    let y_r: Vec<f64> = (0..500).map(|i| i as f64 * 0.5).collect();
    bench_row!("AutoML", "AutoFit Regression (500x20)", 3, 10, || {
        black_box(auto_fit_regression(&x, &y_r, 500, 20));
    });

    // ═══════════════════════ OPTIMIZATION SUITE ═══════════════════════
    println!("\n── Optimization Suite ──");

    let fitness = SphereFitness;
    let gene_factory = || rand_f64();

    bench_row!("Optimization", "GA (dim=20, pop=50, gen=100)", 3, 10, || {
        let mut ga = GeneticAlgorithm::new();
        black_box(ga.optimize(&fitness, &gene_factory, 20));
    });

    bench_row!("Optimization", "PSO (dim=20, particles=50)", 3, 10, || {
        let mut pso = PSO::new();
        black_box(pso.optimize(&fitness, 20));
    });

    let initial: Vec<f64> = (0..20).map(|i| (i as f64) * 0.5).collect();
    bench_row!("Optimization", "Simulated Annealing (dim=20)", 3, 10, || {
        let mut sa = SimulatedAnnealing::new();
        let neighbor = |state: &[f64]| -> Vec<f64> {
            state.iter().map(|&x| x + (rand_f64() - 0.5) * 2.0).collect()
        };
        black_box(sa.optimize(&fitness, initial.clone(), &neighbor));
    });

    // ═══════════════════════ DRIFT DETECTION ═══════════════════════
    println!("\n── Drift Detection ──");

    let seqs: Vec<Vec<String>> = (0..1000).map(|i| vec![format!("A{}", i), format!("B{}", i + 1)]).collect();
    bench_row!("Drift Detection", "Jaccard Window (1000 seqs)", 50, 100, || {
        black_box(detect_drift(&seqs, 20, 0.5));
    });

    let values: Vec<f64> = (0..100000).map(|i| {
        if i > 50000 { 100.0 + i as f64 * 0.2 } else { 50.0 + i as f64 * 0.05 }
    }).collect();
    let reference: Vec<f64> = (0..50000).map(|i| 50.0 + i as f64 * 0.05).collect();

    bench_row!("Drift Detection", "Statistical Drift (100K)", 50, 100, || {
        black_box(detect_statistical_drift(&values, 50, 2.0));
    });

    bench_row!("Drift Detection", "Page-Hinkley (100K)", 50, 100, || {
        black_box(page_hinkley_test(&values, 50.0, 0.01));
    });

    // ═══════════════════════ ANOMALY DETECTION ═══════════════════════
    println!("\n── Anomaly Detection ──");

    bench_row!("Anomaly Detection", "Statistical Outlier (100K)", 50, 100, || {
        black_box(detect_statistical_outliers(&values, &reference, 2.0));
    });

    let point = vec![200.0, 300.0];
    let reference_vecs: Vec<Vec<f64>> = (0..1000).map(|i| vec![i as f64, (i + 1) as f64]).collect();
    bench_row!("Anomaly Detection", "Isolation Forest (1K ref, 100 trees)", 10, 50, || {
        black_box(isolation_forest_score(&point, &reference_vecs, 100, 10));
    });

    // ═══════════════════════ CAUSAL INFERENCE ═══════════════════════
    println!("\n── Causal Inference ──");

    let n = 5000;
    let treatment: Vec<f64> = (0..n).map(|i| (i % 2) as f64).collect();
    let covariates = gen_data(n, 10);
    let outcome: Vec<f64> = (0..n).map(|i| 2.0 * treatment[i] + covariates[i * 10] + 1.0).collect();

    bench_row!("Causal", "Propensity Score Matching (5Kx10)", 50, 100, || {
        black_box(propensity_score_matching_impl(&treatment, &covariates, &outcome, n, 10));
    });

    let instrument: Vec<f64> = (0..n).map(|i| ((i * 7 + 3) % 10) as f64).collect();
    bench_row!("Causal", "Instrumental Variables (5K)", 50, 100, || {
        black_box(instrumental_variables_impl(&outcome, &treatment, &instrument, n));
    });

    let treated_pre: Vec<f64> = (0..5000).map(|i| 10.0 + i as f64 * 0.1).collect();
    let treated_post: Vec<f64> = (0..5000).map(|i| 15.0 + i as f64 * 0.1).collect();
    let control_pre: Vec<f64> = (0..5000).map(|i| 10.0 + i as f64 * 0.1).collect();
    let control_post: Vec<f64> = (0..5000).map(|i| 10.0 + i as f64 * 0.1).collect();
    bench_row!("Causal", "Difference-in-Differences (5Kx4)", 50, 100, || {
        black_box(difference_in_differences_impl(&treated_pre, &treated_post, &control_pre, &control_post));
    });

    // ═══════════════════════ DATA AUGMENTATION ═════════════════════════
    println!("\n── Data Augmentation ──");

    let x = gen_data(100000, 50);
    use std::cell::Cell;
    let rng_state = Cell::new(42u64);
    let rng = || {
        let mut s = rng_state.get();
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        rng_state.set(s);
        (s as f64) / (u64::MAX as f64)
    };

    bench_row!("Augmentation", "Noise Injection (100Kx50)", 100, 1000, || {
        black_box(inject_noise_impl(&x, 0.1, "gaussian", 100000, 50, &rng));
    });

    // ═══════════════════════ PERSISTENCE ═════════════════════════
    println!("\n── Persistence ──");

    let data = gen_data(100000, 50);
    bench_row!("Persistence", "Data Hash (100Kx50)", 100, 1000, || {
        black_box(compute_data_hash(&data));
    });

    // ═══════════════════════ MONTE CARLO ═════════════════════════
    println!("\n── Monte Carlo ──");

    bench_row!("Monte Carlo", "MC Integration 1D (1M samples)", 10, 100, || {
        black_box(mc_integrate_impl(|x| x.sin() * x.exp(), 0.0, 1.0, 1_000_000, 42));
    });

    let lower = vec![0.0, 0.0, 0.0];
    let upper = vec![1.0, 1.0, 1.0];
    bench_row!("Monte Carlo", "MC Integration 3D (100K)", 10, 50, || {
        black_box(mc_integrate_multidim_impl(
            |args| (args[0].sin() * args[1].cos() * args[2].exp()),
            &lower, &upper, 100_000, 42,
        ));
    });

    bench_row!("Monte Carlo", "MC Estimate Pi (1M)", 10, 100, || {
        black_box(mc_estimate_pi_impl(1_000_000, 42));
    });

    let bootstrap_data: Vec<f64> = (0..10000).map(|i| 5.0 + (i as f64) * 0.01 + ((i as f64 * 0.7).sin())).collect();
    bench_row!("Monte Carlo", "MC Bootstrap (10K, 1000 resamples)", 3, 10, || {
        black_box(mc_bootstrap_impl(&bootstrap_data, 1000, "mean", 0.95, 42));
    });

    // ═══════════════════════ MARKOV CHAINS ═════════════════════════
    println!("\n── Markov Chains ──");

    let n_states = 20;
    let mut transition_matrix = vec![0.0; n_states * n_states];
    for i in 0..n_states {
        let mut row_sum = 0.0;
        for j in 0..n_states {
            transition_matrix[i * n_states + j] = (i as f64 + j as f64 + 1.0);
            row_sum += transition_matrix[i * n_states + j];
        }
        for j in 0..n_states {
            transition_matrix[i * n_states + j] /= row_sum;
        }
    }

    bench_row!("Markov", "Steady State (20 states)", 10, 100, || {
        black_box(compute_steady_state_impl(&transition_matrix, n_states, 1000, 1e-10));
    });

    bench_row!("Markov", "N-Step Probability (20 states, 100 steps)", 10, 100, || {
        black_box(n_step_probability_impl(&transition_matrix, n_states, 100));
    });

    bench_row!("Markov", "Simulate Chain (20 states, 100K steps)", 10, 100, || {
        black_box(simulate_chain_impl(&transition_matrix, n_states, 0, 100_000, 42));
    });

    // HMM benchmarks
    let hmm_n_states = 5;
    let hmm_n_obs = 10;
    let hmm_init: Vec<f64> = vec![0.2, 0.2, 0.2, 0.2, 0.2];
    let mut hmm_trans = vec![0.0; hmm_n_states * hmm_n_states];
    for i in 0..hmm_n_states {
        for j in 0..hmm_n_states {
            hmm_trans[i * hmm_n_states + j] = if j == i { 0.6 } else { 0.1 };
        }
    }
    let mut hmm_emission = vec![0.0; hmm_n_states * hmm_n_obs];
    for i in 0..hmm_n_states {
        for j in 0..hmm_n_obs {
            hmm_emission[i * hmm_n_obs + j] = 1.0 / hmm_n_obs as f64;
        }
    }
    let hmm_obs: Vec<usize> = (0..5000).map(|i| i % hmm_n_obs).collect();

    bench_row!("Markov", "HMM Forward (5 states, 5K obs)", 10, 50, || {
        black_box(hmm_forward_impl(&hmm_init, &hmm_trans, &hmm_emission, &hmm_obs, hmm_n_states, hmm_n_obs));
    });

    bench_row!("Markov", "HMM Viterbi (5 states, 5K obs)", 10, 50, || {
        black_box(hmm_viterbi_impl(&hmm_init, &hmm_trans, &hmm_emission, &hmm_obs, hmm_n_states, hmm_n_obs));
    });

    bench_row!("Markov", "HMM Baum-Welch (5 states, 1K obs)", 1, 5, || {
        let obs_short: Vec<usize> = (0..1000).map(|i| i % hmm_n_obs).collect();
        black_box(hmm_train_baum_welch_impl(&obs_short, hmm_n_states, hmm_n_obs, 50, 1e-4, 42));
    });

    // MCMC benchmark
    bench_row!("Markov", "Metropolis-Hastings (10K samples)", 10, 50, || {
        black_box(metropolis_hastings_impl(
            |x| -(x * x) / 2.0,  // standard normal log posterior
            1.0, 10000, 2000, 42, 0.0,
        ).unwrap());
    });

    // ═══════════════════════ DISTRIBUTIONS ═════════════════════════
    println!("\n── Distributions ──");

    bench_row!("Distributions", "Normal PDF (100K)", 100, 1000, || {
        for i in 0..100000 {
            black_box(normal_pdf(i as f64 / 1000.0, 0.0, 1.0));
        }
    });

    bench_row!("Distributions", "Normal CDF (100K)", 100, 1000, || {
        for i in 0..100000 {
            black_box(normal_cdf(i as f64 / 1000.0, 0.0, 1.0));
        }
    });

    bench_row!("Distributions", "Normal PPF (100K)", 10, 100, || {
        for i in 0..100000 {
            black_box(normal_ppf(i as f64 / 100000.0, 0.0, 1.0));
        }
    });

    bench_row!("Distributions", "Gamma Function (10K)", 100, 1000, || {
        for i in 1..10001 {
            black_box(gamma_function(i as f64 / 10.0));
        }
    });

    bench_row!("Distributions", "Binomial CDF (100K)", 10, 100, || {
        for i in 0..100000 {
            black_box(binomial_cdf((i % 100) as i64, 100, 0.3));
        }
    });

    bench_row!("Distributions", "Poisson PMF (100K)", 100, 1000, || {
        for i in 0..100000 {
            black_box(poisson_pmf((i % 50) as i64, 5.0));
        }
    });

    bench_row!("Distributions", "Normal Sample (1M)", 10, 50, || {
        black_box(normal_sample(1_000_000, 0.0, 1.0, 42));
    });

    // ═══════════════════════ STATISTICAL TESTS ═════════════════════════
    println!("\n── Statistical Tests ──");

    let stat_data1: Vec<f64> = (0..10000).map(|i| 5.0 + (i as f64) * 0.001 + ((i as f64 * 0.5).sin() * 0.5)).collect();
    let stat_data2: Vec<f64> = (0..10000).map(|i| 5.2 + (i as f64) * 0.001 + ((i as f64 * 0.5).sin() * 0.5)).collect();

    bench_row!("Stats", "T-Test One Sample (10K)", 50, 100, || {
        black_box(t_test_one_sample_impl(&stat_data1, 5.0, 0.05));
    });

    bench_row!("Stats", "T-Test Two Sample (10K)", 50, 100, || {
        black_box(t_test_two_sample_impl(&stat_data1, &stat_data2, 0.05));
    });

    bench_row!("Stats", "Mann-Whitney U (10K)", 10, 50, || {
        black_box(mann_whitney_u_impl(&stat_data1, &stat_data2));
    });

    bench_row!("Stats", "Chi-Square Test (100 bins)", 50, 100, || {
        let observed: Vec<f64> = (0..100).map(|i| (100.0 + (i as f64 * 2.3) % 20.0)).collect();
        let expected: Vec<f64> = (0..100).map(|_| 105.0).collect();
        black_box(chi_square_test_impl(&observed, &expected));
    });

    let group1: Vec<f64> = (0..1000).map(|i| 50.0 + (i as f64 * 0.05) % 10.0).collect();
    let group2: Vec<f64> = (0..1000).map(|i| 55.0 + (i as f64 * 0.05) % 10.0).collect();
    let group3: Vec<f64> = (0..1000).map(|i| 60.0 + (i as f64 * 0.05) % 10.0).collect();
    let mut anova_groups = Vec::new();
    anova_groups.extend_from_slice(&group1);
    anova_groups.extend_from_slice(&group2);
    anova_groups.extend_from_slice(&group3);
    let anova_sizes = vec![1000usize, 1000, 1000];
    bench_row!("Stats", "One-Way ANOVA (3 x 1K)", 50, 100, || {
        black_box(one_way_anova_impl(&anova_groups, &anova_sizes));
    });

    bench_row!("Stats", "Descriptive Stats (100K)", 100, 1000, || {
        black_box(describe_impl(&stat_data1));
    });

    // ═══════════════════════ EXTENDED REGRESSION ═════════════════════════
    println!("\n── Extended Regression ──");

    let x_reg = gen_data(10000, 20);
    let y_reg: Vec<f64> = (0..10000).map(|i| i as f64 * 0.5).collect();

    bench_row!("Regression", "Elastic Net (10Kx20)", 5, 20, || {
        black_box(elastic_net_impl(&x_reg, 20, &y_reg, 0.1, 0.5, 1000, 1e-6));
    });

    bench_row!("Regression", "SVR (5Kx20)", 5, 20, || {
        let x_svr = &x_reg[..100000];
        let y_svr = &y_reg[..5000];
        black_box(svr_fit_impl(x_svr, 20, y_svr, 0.1, 1.0, 1000, 0.01, 42));
    });

    bench_row!("Regression", "Quantile Regression (10Kx20)", 5, 20, || {
        black_box(quantile_regression_fit_impl(&x_reg, 20, &y_reg, 0.5, 1000, 0.01, 1e-6));
    });

    // ═══════════════════════ KERNEL METHODS ═════════════════════════
    println!("\n── Kernel Methods ──");

    let kernel_data = gen_data(1000, 50);

    bench_row!("Kernels", "RBF Kernel Matrix (1000x1000)", 5, 20, || {
        black_box(rbf_kernel_matrix_impl(&kernel_data, 1000, 50, 1.0));
    });

    bench_row!("Kernels", "Polynomial Kernel Matrix (1000x1000)", 5, 20, || {
        black_box(polynomial_kernel_matrix_impl(&kernel_data, 1000, 50, 3.0, 1.0, 1.0));
    });

    bench_row!("Kernels", "Sigmoid Kernel Matrix (1000x1000)", 5, 20, || {
        black_box(sigmoid_kernel_matrix_impl(&kernel_data, 1000, 50, 0.1, 0.0));
    });

    // ═══════════════════════ BAYESIAN METHODS ═════════════════════════
    println!("\n── Bayesian Methods ──");

    let bayes_data = gen_data(5000, 10);
    let bayes_targets: Vec<f64> = (0..5000).map(|i| i as f64 * 0.1).collect();

    bench_row!("Bayesian", "Bayesian Linear Regression (5Kx10)", 3, 10, || {
        black_box(bayesian_linear_regression_impl(&bayes_data, 10, &bayes_targets, 0.01, 1.0, 1.0));
    });

    bench_row!("Bayesian", "Bayesian Estimate MCMC (10K samples)", 3, 10, || {
        black_box(bayesian_estimate_impl(
            |x: f64| -(x * x) / 2.0,
            |x: f64| 0.0,
            10000, 2000, 42, 0.0, 1.0,
        ));
    });

    // ═══════════════════════ GAUSSIAN PROCESS ═════════════════════════
    println!("\n── Gaussian Process ──");

    let gp_data = gen_data(500, 5);
    let gp_targets: Vec<f64> = (0..500).map(|i| (i as f64 * 0.01).sin()).collect();

    bench_row!("GP", "GP Fit (500x5, RBF)", 3, 10, || {
        black_box(gp_fit_impl(&gp_data, 5, &gp_targets, "rbf", &[1.0], 0.1));
    });

    // Pre-fit for predict benchmark
    let gp_model = gp_fit_impl(&gp_data, 5, &gp_targets, "rbf", &[1.0], 0.1).unwrap();
    let gp_test = gen_data(100, 5);
    bench_row!("GP", "GP Predict (100x5)", 10, 50, || {
        black_box(gp_predict_impl(&gp_model, &gp_test));
    });

    // ═══════════════════════ ASSOCIATION RULES ═════════════════════════
    println!("\n── Association Rules ──");

    let assoc_txn: Vec<f64> = (0..5000).map(|i| ((i % 20) + 1) as f64).collect();
    let assoc_lengths: Vec<usize> = (0..1000).map(|_| 5).collect();

    bench_row!("Association", "Apriori (1K txns, 20 items)", 3, 10, || {
        black_box(apriori_impl(&assoc_txn, &assoc_lengths, 0.1, 0.5));
    });

    // ═══════════════════════ SURVIVAL ANALYSIS ═════════════════════════
    println!("\n── Survival Analysis ──");

    let surv_times: Vec<f64> = (0..10000).map(|i| 10.0 + (i as f64) * 0.01 + ((i as f64 * 0.3).sin() * 2.0)).collect();
    let surv_events: Vec<f64> = (0..10000).map(|i| if i % 7 < 5 { 1.0 } else { 0.0 }).collect();

    bench_row!("Survival", "Kaplan-Meier (10K)", 50, 100, || {
        black_box(kaplan_meier_impl(&surv_times, &surv_events));
    });

    let surv_features = gen_data(1000, 5);
    let surv_times_cox: Vec<f64> = (0..1000).map(|i| 5.0 + i as f64 * 0.01).collect();
    let surv_events_cox: Vec<f64> = (0..1000).map(|i| if i % 5 < 3 { 1.0 } else { 0.0 }).collect();

    bench_row!("Survival", "Cox PH (1Kx5)", 3, 10, || {
        black_box(cox_proportional_hazards_impl(&surv_features, 5, &surv_times_cox, &surv_events_cox, 1000, 0.01));
    });

    // ═══════════════════════ RECOMMENDATION ═════════════════════════
    println!("\n── Recommendation ──");

    let mut ratings = vec![0.0; 500 * 200]; // 500 users, 200 items
    for i in 0..500 {
        for j in 0..200 {
            if (i + j) % 3 != 0 {
                ratings[i * 200 + j] = ((i * 7 + j * 13) % 50) as f64 / 10.0 + 1.0;
            }
        }
    }

    bench_row!("Recommendation", "Matrix Factorization (500x200, k=20)", 3, 10, || {
        black_box(matrix_factorization_impl(&ratings, 500, 200, 20, 100, 0.01, 0.1, 42));
    });

    bench_row!("Recommendation", "User-User Collaborative (500x200, k=10)", 10, 50, || {
        black_box(user_user_collaborative_impl(&ratings, 500, 200, 0, 10));
    });

    // ═══════════════════════ GRAPH ALGORITHMS ═════════════════════════
    println!("\n── Graph Algorithms ──");

    let n_nodes = 500;
    let mut adjacency = vec![0.0; n_nodes * n_nodes];
    for i in 0..n_nodes {
        for j in 0..n_nodes {
            if i != j && (i + j) % 3 == 0 {
                adjacency[i * n_nodes + j] = 1.0;
            }
        }
    }

    bench_row!("Graph", "PageRank (500 nodes)", 10, 50, || {
        black_box(pagerank_impl(&adjacency, n_nodes, 0.85, 100, 1e-6));
    });

    bench_row!("Graph", "Shortest Path Dijkstra (500 nodes)", 10, 50, || {
        // Make weighted for Dijkstra
        let mut weighted = adjacency.clone();
        for w in weighted.iter_mut() {
            if *w > 0.0 { *w = (*w * 10.0).abs() + 1.0; }
        }
        black_box(shortest_path_impl(&weighted, n_nodes, 0));
    });

    bench_row!("Graph", "Community Detection (500 nodes)", 10, 50, || {
        black_box(community_detection_impl(&adjacency, n_nodes, 100));
    });

    // ═══════════════════════ SUMMARY ═══════════════════════
    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║  Summary                                                     ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();

    let times: Vec<f64> = results.iter().map(|(_, _, t)| *t).collect();
    let avg = times.iter().sum::<f64>() / times.len() as f64;
    let max_t = times.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let min_t = times.iter().cloned().fold(f64::INFINITY, f64::min);

    let mut fast = 0usize;    // <1ms
    let mut moderate = 0usize; // 1-100ms
    let mut slow = 0usize;    // >100ms
    for (_, _, t) in &results {
        if *t < 1_000_000.0 { fast += 1; }
        else if *t < 100_000_000.0 { moderate += 1; }
        else { slow += 1; }
    }

    println!("Total benchmarks: {}", results.len());
    println!("Average: {}  Min: {}  Max: {}", fmt_duration(avg), fmt_duration(min_t), fmt_duration(max_t));
    println!();
    println!("  Fast (<1ms):       {}", fast);
    println!("  Moderate (1-100ms): {}", moderate);
    println!("  Slow (>100ms):     {}", slow);

    println!();
    println!("── By Category ──");
    let mut cat_order: Vec<&str> = Vec::new();
    for (cat, _, _) in &results {
        if !cat_order.contains(cat) { cat_order.push(cat); }
    }
    for cat in &cat_order {
        let entries: Vec<(&str, f64)> = results.iter().filter(|(c, _, _)| c == cat).map(|(_, l, t)| (*l, *t)).collect();
        let count = entries.len();
        let total: f64 = entries.iter().map(|(_, t)| *t).sum();
        let max: f64 = entries.iter().map(|(_, t)| *t).fold(f64::NEG_INFINITY, f64::max);
        println!("  {:20} {:3} benchmarks  total={:>12}  max={}", cat, count, fmt_duration(total), fmt_duration(max));
    }

    println!();
}
