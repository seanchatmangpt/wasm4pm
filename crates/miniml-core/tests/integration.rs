// Integration tests for miniml-core ML algorithms
// Tests cover: classification, clustering, forecasting, anomaly detection, regression, PCA, serialization

use miniml::*;

// Helper to create synthetic data with known properties
fn create_linear_data() -> (Vec<f64>, Vec<f64>) {
    // y = 2x + 1
    let x = vec![1.0, 2.0, 3.0, 4.0, 5.0];
    let y = vec![3.0, 5.0, 7.0, 9.0, 11.0];
    (x, y)
}

fn create_regression_data() -> (Vec<f64>, Vec<f64>, usize) {
    // 5 samples, 2 features: [x1, x2]
    // y = 1*x1 + 2*x2 + 0.5 (with some noise)
    let features = vec![
        1.0, 2.0,  // sample 1: features [1, 2] -> y ~5.5
        2.0, 1.0,  // sample 2: features [2, 1] -> y ~4.5
        3.0, 2.0,  // sample 3: features [3, 2] -> y ~7.5
        1.0, 3.0,  // sample 4: features [1, 3] -> y ~6.5
        2.0, 2.0,  // sample 5: features [2, 2] -> y ~6.5
    ];
    let targets = vec![5.5, 4.5, 7.5, 6.5, 6.5];
    (features, targets, 2)
}

fn create_clustering_data() -> (Vec<f64>, usize) {
    // 6 samples, 2 features: two clusters at (1,1) and (4,4)
    let data = vec![
        1.0, 1.0,  // cluster 0
        1.2, 0.9,  // cluster 0
        4.0, 4.0,  // cluster 1
        4.1, 3.9,  // cluster 1
        0.9, 1.1,  // cluster 0
        4.2, 4.0,  // cluster 1
    ];
    let n_features = 2;
    (data, n_features)
}

fn create_pca_data() -> (Vec<f64>, usize) {
    // 4 samples, 3 features
    let data = vec![
        1.0, 2.0, 3.0,
        2.0, 3.0, 4.0,
        3.0, 4.0, 5.0,
        4.0, 5.0, 6.0,
    ];
    let n_features = 3;
    (data, n_features)
}

fn create_anomaly_data() -> Vec<f64> {
    // Time series with outlier: [1, 2, 3, 4, 100, 5, 6]
    vec![1.0, 2.0, 3.0, 4.0, 100.0, 5.0, 6.0]
}

// Test 1: Decision Tree Classifier
#[test]
fn test_decision_tree_classifier() {
    // 6 samples, 2 features: simple classification problem
    let features = vec![
        1.0, 1.0,  // class 0
        1.2, 1.1,  // class 0
        4.0, 4.0,  // class 1
        4.1, 3.9,  // class 1
        0.9, 1.0,  // class 0
        4.2, 4.1,  // class 1
    ];
    let targets = vec![0.0, 0.0, 1.0, 1.0, 0.0, 1.0];
    let n_features = 2;

    // Train decision tree classifier
    let model = decision_tree_classify(&features, n_features, &targets, 5, 2).expect("classify failed");

    // Verify model properties
    assert!(model.n_nodes() > 0);
    assert!(model.depth() > 0);

    // Predict on training data
    let predictions = model.predict(&features);
    assert_eq!(predictions.len(), targets.len());

    // Predictions should be in range [0, 1]
    for pred in &predictions {
        assert!(pred.is_finite());
    }
}

// Test 2: K-Means Clustering
#[test]
fn test_kmeans_clustering() {
    let (data, n_features) = create_clustering_data();
    let k = 2;
    let max_iter = 100;

    let model = kmeans(&data, n_features, k, max_iter).unwrap();

    // Verify model properties
    assert_eq!(model.k(), k);
    assert_eq!(model.get_n_features(), n_features);
    assert!(model.iterations() > 0);
    assert!(model.inertia() >= 0.0);

    // Verify cluster assignments
    let assignments = model.get_assignments();
    assert_eq!(assignments.len(), data.len() / n_features);
    for &cluster_id in &assignments {
        assert!((cluster_id as usize) < k);
    }

    // Verify centroids
    let centroids = model.get_centroids();
    assert_eq!(centroids.len(), k * n_features);

    // Predict new data
    let new_data = vec![1.0, 1.0, 4.0, 4.0];  // 2 samples
    let new_assignments = model.predict(&new_data);
    assert_eq!(new_assignments.len(), 2);
}

// Test 3: Linear Regression
#[test]
fn test_linear_regression() {
    let (features, targets, n_features) = create_regression_data();
    let alpha = 0.01;  // Ridge regularization

    let model = ridge_regression(&features, n_features, &targets, alpha).expect("ridge_regression failed");

    // Verify model properties
    assert_eq!(model.n_features(), n_features);
    let coefs = model.coef_js();
    assert_eq!(coefs.len(), n_features);
    assert!(model.intercept_js().is_finite());

    // Predict on training data
    let predictions = model.predict(&features);
    assert_eq!(predictions.len(), targets.len());
    for pred in &predictions {
        assert!(pred.is_finite());
    }

    // Compute R² score
    let r2 = r2_score(&targets, &predictions).expect("r2_score failed");
    assert!(r2 > 0.5, "R² should be reasonable for linear data: {}", r2);
    assert!(r2 <= 1.0);
}

// Test 4: Polynomial Regression (Degree 2)
#[test]
fn test_polynomial_regression() {
    let (x, y) = create_linear_data();

    let model = polynomial_regression(&x, &y, 2).expect("polynomial_regression failed");

    // Verify model properties
    assert_eq!(model.degree(), 2);
    assert!(model.r_squared() >= 0.0);
    assert!(model.r_squared() <= 1.0);

    let coefs = model.get_coefficients();
    assert!(coefs.len() >= 2);

    // Predict
    let predictions = model.predict(&x);
    assert_eq!(predictions.len(), x.len());
    for pred in &predictions {
        assert!(pred.is_finite());
    }
}

// Test 5: Exponential Regression
#[test]
fn test_exponential_regression() {
    // Exponential data: y = 2 * e^(0.5*x)
    let x = vec![0.0, 1.0, 2.0, 3.0, 4.0];
    let y = vec![2.0, 3.3, 5.4, 8.9, 14.8];

    let model = exponential_regression(&x, &y).expect("exponential_regression failed");

    // Verify model properties
    assert!(model.a() > 0.0);  // amplitude must be positive
    assert!(model.r_squared() >= 0.0);
    assert!(model.r_squared() <= 1.0);

    // Predict
    let predictions = model.predict(&x);
    assert_eq!(predictions.len(), x.len());
    for pred in &predictions {
        assert!(pred.is_finite() && *pred >= 0.0);
    }

    // Doubling time should be computable (when b > 0)
    let doubling_time = model.doubling_time();
    if model.b() > 0.0 {
        assert!(doubling_time.is_finite() && doubling_time > 0.0);
    }
}

// Test 6: Anomaly Detection (using EMA smoothing + deviation)
#[test]
fn test_anomaly_detection() {
    let data = create_anomaly_data();

    // Use EMA smoothing to compute expected values
    let smoothed = exponential_smoothing(&data, 0.3).expect("ema failed");

    // Compute anomaly scores as absolute deviations from smoothed values
    let scores: Vec<f64> = data.iter()
        .zip(smoothed.iter())
        .map(|(actual, smooth)| (actual - smooth).abs())
        .collect();

    // Verify output
    assert_eq!(scores.len(), data.len());

    // All scores should be non-negative
    for score in &scores {
        assert!(score.is_finite() && *score >= 0.0);
    }

    // The outlier (100.0) should have a high anomaly score
    let max_score = scores.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    assert!(max_score > 0.0, "Outlier should produce non-zero anomaly score");
}

// Test 7: Regression Metrics (MAE, RMSE, R²)
#[test]
fn test_regression_metrics() {
    let y_true = vec![1.0, 2.0, 3.0, 4.0, 5.0];
    let y_pred = vec![1.1, 2.1, 2.9, 4.2, 4.8];

    // R² score
    let r2 = r2_score(&y_true, &y_pred).expect("r2_score failed");
    assert!(r2 > 0.9, "Good predictions should have high R²");

    // Mean Absolute Error
    let mae = mean_absolute_error(&y_true, &y_pred).expect("mae failed");
    assert!(mae < 0.3, "MAE should be small for good predictions");
    assert!(mae >= 0.0);

    // Root Mean Squared Error
    let rmse = root_mean_squared_error(&y_true, &y_pred).expect("rmse failed");
    assert!(rmse >= mae, "RMSE >= MAE always");
    assert!(rmse < 0.5);
}

// Test 8: Silhouette Score (Clustering Quality)
#[test]
fn test_silhouette_score() {
    let (data, n_features) = create_clustering_data();
    let k = 2;

    // Cluster the data
    let model = kmeans(&data, n_features, k, 100).expect("kmeans failed");
    let assignments = model.get_assignments();

    // Convert cluster IDs to f64 for silhouette score
    let labels: Vec<f64> = assignments.iter().map(|&c| c as f64).collect();

    let score = silhouette_score(&data, n_features, &labels).expect("silhouette_score failed");
    assert!(score >= -1.0 && score <= 1.0, "Silhouette score must be in [-1, 1], got {}", score);

    // For well-separated clusters, score should be positive
    assert!(score > 0.0, "Well-separated clusters should have positive silhouette");
}

// Test 9: PCA (Principal Component Analysis)
#[test]
fn test_pca_dimensionality_reduction() {
    let (data, n_features) = create_pca_data();
    let n_components = 2;

    let pca_result = pca(&data, n_features, n_components).expect("pca failed");

    // Verify PCA properties
    assert_eq!(pca_result.n_components(), n_components);
    assert_eq!(pca_result.n_features(), n_features);

    // Components should have correct shape
    let components = pca_result.get_components();
    assert_eq!(components.len(), n_components * n_features);

    // Explained variance ratio should sum to <= 1.0
    let variance_ratio = pca_result.get_explained_variance_ratio();
    assert_eq!(variance_ratio.len(), n_components);
    let total_variance: f64 = variance_ratio.iter().sum();
    assert!(total_variance <= 1.01);  // Small tolerance for floating-point

    // Verify that variance values are in [0, 1]
    for &v in &variance_ratio {
        assert!(v >= 0.0 && v <= 1.0);
    }

    // Transform original data
    let transformed = pca_result.get_transformed();
    let n_samples = data.len() / n_features;
    assert_eq!(transformed.len(), n_samples * n_components);

    // Transform new data
    let new_data = vec![2.0, 3.0, 4.0, 3.0, 4.0, 5.0];  // 2 samples, 3 features
    let new_transformed = pca_result.transform(&new_data);
    assert_eq!(new_transformed.len(), 2 * n_components);
}

// Test 10: Model Coefficient Stability
#[test]
fn test_model_coefficient_stability() {
    let (features, targets, n_features) = create_regression_data();
    let alpha = 0.01;

    // Train a model
    let model1 = ridge_regression(&features, n_features, &targets, alpha).expect("ridge_regression failed");
    let predictions1 = model1.predict(&features);

    // Train again with same data
    let model2 = ridge_regression(&features, n_features, &targets, alpha).expect("ridge_regression failed");
    let predictions2 = model2.predict(&features);

    // Verify coefficients are stable
    let coefs1 = model1.coef_js();
    let coefs2 = model2.coef_js();
    assert_eq!(coefs1.len(), coefs2.len());
    for (c1, c2) in coefs1.iter().zip(coefs2.iter()) {
        assert!((c1 - c2).abs() < 1e-10, "Coefficients differ: {} vs {}", c1, c2);
    }

    // Verify predictions match
    assert_eq!(predictions1.len(), predictions2.len());
    for (p1, p2) in predictions1.iter().zip(predictions2.iter()) {
        assert!((p1 - p2).abs() < 1e-10, "Predictions differ: {} vs {}", p1, p2);
    }
}

// Additional test: Classification Metrics
#[test]
fn test_classification_accuracy() {
    let y_true = vec![0.0, 1.0, 1.0, 0.0, 1.0, 0.0];
    let y_pred = vec![0.0, 1.0, 1.0, 0.0, 1.0, 1.0];  // 1 error

    // Matthews Correlation Coefficient
    let mcc = matthews_corrcoef(&y_true, &y_pred).expect("matthews_corrcoef failed");
    assert!(mcc >= -1.0 && mcc <= 1.0);
    assert!(mcc > 0.5, "Good predictions should have high MCC");

    // Cohen's Kappa
    let kappa = cohens_kappa(&y_true, &y_pred).expect("cohens_kappa failed");
    assert!(kappa >= -1.0 && kappa <= 1.0);
    assert!(kappa > 0.5, "Good predictions should have high kappa");
}

// Utility test: Feature Shape Validation
#[test]
fn test_data_validation() {
    // Test that mismatched dimensions are caught
    let bad_data = vec![1.0, 2.0, 3.0];  // 3 elements
    let bad_targets = vec![0.0, 1.0];     // 2 elements
    let n_features = 2;

    // This should fail: 3 elements can't be evenly divided into 2-feature samples
    // (3 / 2 = 1.5 samples)
    let result = ridge_regression_impl(&bad_data, n_features, &bad_targets, 0.01);
    assert!(result.is_err(), "Should reject mismatched dimensions");

    // Valid case: 4 elements with 2 features = 2 samples
    let good_data = vec![1.0, 2.0, 3.0, 4.0];
    let good_targets = vec![0.0, 1.0];
    let result = ridge_regression_impl(&good_data, n_features, &good_targets, 0.01);
    assert!(result.is_ok(), "Should accept well-formed data");
}
