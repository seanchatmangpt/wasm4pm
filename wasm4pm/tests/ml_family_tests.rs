use wasm4pm::ml::regression::{regression_internal};
use wasm4pm::ml::forecasting::{forecast_internal};
use wasm4pm::ml::classification::{knn_internal, knn_internal_metrics};
use wasm4pm::ml::pca::{pca_internal};
use wasm4pm::ml::automl::{discover_automl_forecast_internal, discover_automl_classify_internal};

// --- 1. Regression Tests ---

#[test]
fn test_regression_linear_trend() {
    let x = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
    let y = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0];
    let res = regression_internal(&x, &y);
    assert!((res.slope - 2.0).abs() < 1e-10);
    assert!(res.intercept.abs() < 1e-10);
    assert!((res.r_squared - 1.0).abs() < 1e-10);
}

#[test]
fn test_regression_noisy_data() {
    let x = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
    let y = [0.1, 1.9, 4.2, 5.8, 8.1, 9.9, 12.2, 13.8, 16.1, 17.9];
    let res = regression_internal(&x, &y);
    assert!((res.slope - 2.0).abs() < 0.1);
    assert!(res.r_squared > 0.99);
}

#[test]
fn test_regression_constant_data() {
    let x = [0.0, 1.0, 2.0, 3.0, 4.0];
    let y = [5.0, 5.0, 5.0, 5.0, 5.0];
    let res = regression_internal(&x, &y);
    assert!(res.slope.abs() < 1e-10);
    assert!((res.intercept - 5.0).abs() < 1e-10);
    // r_squared is 0 for constant y because variance is 0
    assert!(res.r_squared.abs() < 1e-10);
}

// --- 2. Forecasting Tests ---

#[test]
fn test_forecast_increasing_trend() {
    let data = [10.0, 20.0, 30.0, 40.0, 50.0];
    let res = forecast_internal(&data, 0.5);
    // Exponential smoothing with alpha=0.5
    // s0 = 10
    // s1 = 0.5*20 + 0.5*10 = 15
    // s2 = 0.5*30 + 0.5*15 = 22.5
    // s3 = 0.5*40 + 0.5*22.5 = 31.25
    // s4 = 0.5*50 + 0.5*31.25 = 40.625
    assert!((res.next_window - 40.625).abs() < 1e-10);
}

#[test]
fn test_forecast_decreasing_trend() {
    let data = [50.0, 40.0, 30.0, 20.0, 10.0];
    let res = forecast_internal(&data, 0.3);
    // s0 = 50
    // s1 = 0.3*40 + 0.7*50 = 12 + 35 = 47
    // s2 = 0.3*30 + 0.7*47 = 9 + 32.9 = 41.9
    // s3 = 0.3*20 + 0.7*41.9 = 6 + 29.33 = 35.33
    // s4 = 0.3*10 + 0.7*35.33 = 3 + 24.731 = 27.731
    assert!((res.next_window - 27.731).abs() < 1e-10);
}

#[test]
fn test_forecast_periodic() {
    let data = [10.0, 20.0, 10.0, 20.0, 10.0, 20.0];
    let res = forecast_internal(&data, 0.9);
    // High alpha means it follows the latest value closely
    assert!(res.next_window > 15.0);
    
    let res_low = forecast_internal(&data, 0.1);
    // Low alpha means it stays closer to the average
    assert!(res_low.next_window < 15.0);
}

// --- 3. k-NN Tests ---

#[test]
fn test_knn_linearly_separable() {
    let train_x = vec![
        [1.0, 1.0], [1.1, 1.2], [1.2, 1.1], // Cluster 0
        [5.0, 5.0], [5.1, 5.2], [5.2, 5.1], // Cluster 1
    ];
    let train_y = vec![0, 0, 0, 1, 1, 1];
    let test_x = vec![[1.05, 1.05], [5.05, 5.05]];
    let test_y = vec![0, 1];
    
    let accuracy = knn_internal(&train_x, &train_y, &test_x, &test_y, 3);
    assert_eq!(accuracy, 1.0);
}

#[test]
fn test_knn_overlapping() {
    let train_x = vec![
        [1.0, 1.0], [1.1, 1.1], [2.0, 2.0], // Mostly Cluster 0
        [1.0, 1.1], [2.1, 2.1], [2.2, 2.2], // Mostly Cluster 1
    ];
    let train_y = vec![0, 0, 0, 1, 1, 1];
    // A point at [1.05, 1.05] is surrounded by [1.0, 1.0](0), [1.1, 1.1](0), [1.0, 1.1](1)
    // For K=3, it should be predicted as 0.
    let test_x = vec![[1.05, 1.05]];
    let test_y = vec![0];
    let accuracy = knn_internal(&train_x, &train_y, &test_x, &test_y, 3);
    assert_eq!(accuracy, 1.0);
}

// --- 4. PCA Tests ---

#[test]
fn test_pca_orthogonal() {
    let features = vec![
        [1.0, 0.0], [-1.0, 0.0],
        [0.0, 2.0], [0.0, -2.0],
    ];
    let res = pca_internal(&features);
    // Variance in Y (2.0^2 + (-2.0)^2 = 8) is larger than in X (1.0^2 + (-1.0)^2 = 2)
    assert!(res.eigenvalues[0] > res.eigenvalues[1]);
    assert!((res.explained_variance[0] - 0.8).abs() < 1e-10); // 8 / (8+2) = 0.8
    assert!((res.explained_variance[1] - 0.2).abs() < 1e-10);
}

#[test]
fn test_pca_correlated() {
    let features = vec![
        [1.0, 1.0], [2.0, 2.0], [3.0, 3.0], [4.0, 4.0],
    ];
    let res = pca_internal(&features);
    // Perfectly correlated, one eigenvalue should be 0
    assert!(res.explained_variance[0] > 0.99);
    assert!(res.explained_variance[1] < 0.01);
}

// --- 5. Edge Cases ---

#[test]
fn test_regression_less_than_two_points() {
    let x = [1.0];
    let y = [2.0];
    let res = regression_internal(&x, &y);
    assert_eq!(res.slope, 0.0);
    assert_eq!(res.intercept, 2.0);
    assert_eq!(res.r_squared, 0.0);
}

#[test]
fn test_forecast_empty() {
    let data: [f64; 0] = [];
    let res = forecast_internal(&data, 0.5);
    assert_eq!(res.next_window, 0.0);
}

#[test]
fn test_pca_less_than_two_samples() {
    let features = vec![[1.0, 1.0]];
    let res = pca_internal(&features);
    assert_eq!(res.eigenvalues, [0.0, 0.0]);
}

// --- 6. AutoML Convergence Tests ---

#[test]
fn test_automl_forecast_convergence() {
    // Generate data with a very strong trend (highly predictable)
    // For highly predictable data, a high alpha should be preferred if it's changing,
    // or a low alpha if it's constant.
    // Let's use a constant data + small noise.
    let mut windows = vec![10.0; 20];
    for i in 0..20 {
        windows[i] += (i as f64) * 0.1; // Small linear increase
    }
    
    let result = discover_automl_forecast_internal(&windows);
    // For this data, we expect SOME alpha that gives low RMSE.
    assert!(result.min_avg_rmse < 1.0);
    assert!(result.best_alpha > 0.0 && result.best_alpha < 1.0);
}

#[test]
fn test_automl_classify_convergence() {
    // Generate clearly separable data
    let mut features = Vec::new();
    let mut labels = Vec::new();
    
    for _ in 0..10 {
        features.push([1.0, 1.0]);
        labels.push(0);
        features.push([10.0, 10.0]);
        labels.push(1);
    }
    
    let result = discover_automl_classify_internal(&features, &labels);
    // For clearly separable data, accuracy should be 1.0
    assert_eq!(result.max_avg_accuracy, 1.0);
    assert!(result.best_k >= 1);
}

// --- 7. Quality Metric Tests (Rank-2 Domain Contracts) ---
// These would FAIL on the previous API: ForecastResult had no `mae`/`mape`
// fields and the classification surface exposed only `accuracy`.

// Domain contract: on a constant series, every one-step-ahead forecast error
// is zero, so all three error metrics must be exactly zero.
#[test]
fn test_forecast_constant_series_has_zero_mae_rmse_mape() {
    let data = [7.0_f64; 12];
    let res = forecast_internal(&data, 0.5);
    assert!(res.rmse.abs() < 1e-12, "rmse on constant series must be 0");
    assert!(res.mae.abs() < 1e-12, "mae on constant series must be 0");
    assert!(res.mape.abs() < 1e-12, "mape on constant series must be 0");
}

// Mathematical theorem (Jensen's inequality) used as a Rank-2 contract:
// the root-mean-squared error is always >= the mean absolute error for
// the same error vector. A buggy implementation that returned RMSE for both
// fields would still pass; one that swapped sums of squares and absolutes
// would break this.
#[test]
fn test_forecast_mae_le_rmse_invariant() {
    let data = [10.0, 22.0, 11.0, 25.0, 9.0, 27.0, 8.0, 30.0];
    let res = forecast_internal(&data, 0.3);
    assert!(res.mae > 0.0, "non-constant series should produce mae > 0");
    assert!(res.rmse > 0.0, "non-constant series should produce rmse > 0");
    assert!(
        res.mae <= res.rmse + 1e-10,
        "Jensen's inequality: mae ({}) must be <= rmse ({})",
        res.mae, res.rmse
    );
}

// Domain contract: MAPE on a strictly-positive series is finite and
// non-negative. Without the field, this was unassertable.
#[test]
fn test_forecast_mape_finite_on_positive_series() {
    let data = [100.0, 110.0, 90.0, 120.0, 80.0, 130.0];
    let res = forecast_internal(&data, 0.5);
    assert!(res.mape.is_finite(), "mape must be finite for positive series");
    assert!(res.mape >= 0.0, "mape must be non-negative");
}

// Domain contract: when every test point is classified correctly, the macro
// scores all equal 1.0. Accuracy alone could not certify this — a 100%
// accurate classifier on a single class would also report accuracy=1.0.
#[test]
fn test_knn_metrics_perfect_three_class_classification() {
    let train_x = vec![
        [1.0, 1.0], [1.1, 1.2], [1.2, 1.1],
        [5.0, 5.0], [5.1, 5.2], [5.2, 5.1],
        [9.0, 9.0], [9.1, 9.2], [9.2, 9.1],
    ];
    let train_y = vec![0u8, 0, 0, 1, 1, 1, 2, 2, 2];
    let test_x = vec![[1.05, 1.05], [5.05, 5.05], [9.05, 9.05]];
    let test_y = vec![0u8, 1, 2];

    let m = knn_internal_metrics(&train_x, &train_y, &test_x, &test_y, 3);
    assert!((m.accuracy - 1.0).abs() < 1e-10);
    assert!((m.macro_precision - 1.0).abs() < 1e-10);
    assert!((m.macro_recall - 1.0).abs() < 1e-10);
    assert!((m.macro_f1 - 1.0).abs() < 1e-10);

    // Cross-check: legacy `knn_internal` accuracy must equal the metric.
    let acc = knn_internal(&train_x, &train_y, &test_x, &test_y, 3);
    assert!(
        (acc - m.accuracy).abs() < 1e-10,
        "knn_internal_metrics.accuracy must match knn_internal()"
    );
}

// Domain contract: on imbalanced predictions where one class is missed
// entirely, macro_recall drops below accuracy. This is the failure mode an
// accuracy-only API hides — the central reason for adding the metrics.
#[test]
fn test_knn_metrics_macro_scores_reveal_class_imbalance() {
    // Training: 9 class-0 + 1 class-1 far away.
    let mut train_x: Vec<[f64; 2]> = (0..9).map(|i| [i as f64, 0.0]).collect();
    train_x.push([100.0, 100.0]);
    let train_y = vec![0u8, 0, 0, 0, 0, 0, 0, 0, 0, 1];

    // Test: 4 class-0 points near origin + 1 class-1 point at moderate distance.
    // For k=3, the class-1 test point's 3 nearest neighbours are the class-0
    // training points (since the single class-1 training point is far away),
    // so it is misclassified.
    let test_x = vec![[0.5, 0.0], [1.5, 0.0], [2.5, 0.0], [3.5, 0.0], [10.0, 0.0]];
    let test_y = vec![0u8, 0, 0, 0, 1];

    let m = knn_internal_metrics(&train_x, &train_y, &test_x, &test_y, 3);
    assert!((m.accuracy - 0.8).abs() < 1e-10, "4/5 correct => accuracy=0.8");
    // Class 1 has 0 recall (the only class-1 test point is missed).
    // Macro recall = (1.0 + 0.0) / 2 = 0.5, which is strictly less than
    // accuracy=0.8. The pre-existing accuracy-only API could not see this.
    assert!(
        m.macro_recall < m.accuracy,
        "macro_recall ({}) must reveal the missed class-1 point; accuracy={}",
        m.macro_recall, m.accuracy
    );
    assert!(
        m.macro_f1 < m.accuracy,
        "macro_f1 ({}) must reveal the missed class-1 point; accuracy={}",
        m.macro_f1, m.accuracy
    );
}
