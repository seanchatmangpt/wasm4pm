use wasm4pm::ml::regression::{regression_internal};
use wasm4pm::ml::forecasting::{forecast_internal};
use wasm4pm::ml::classification::{knn_internal};
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
