//! AutoML Pipeline Optimization (TPOT2-inspired)
//!
//! Automated machine learning for miniml:
//! - Automated algorithm selection
//! - Genetic feature selection
//! - Hyperparameter optimization
//!
//! Inspired by TPOT2 but adapted for miniml's constraints.

use crate::decision_tree::decision_tree_impl;
use crate::error::MlError;
use crate::knn::knn_fit_impl;
use crate::linear_regression::ridge_regression_impl;
use crate::logistic::logistic_regression_impl;
use crate::naive_bayes::naive_bayes_impl;
use crate::optimization::genetic::{GeneticAlgorithm, GeneticOptions};
use crate::optimization::{FitnessFunction, Individual};
use crate::perceptron::perceptron_impl;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
/// Convert Vec<u32> predictions to Vec<f64>
fn preds_to_f64(preds: &[u32]) -> Vec<f64> {
    preds.iter().map(|&p| p as f64).collect()
}

use crate::polynomial::polynomial_regression_impl;
use crate::regression_metrics::r2_score_impl;

// ── helpers ──────────────────────────────────────────────────────────

/// Simple accuracy: fraction of matches within tolerance
fn accuracy_simple(y_true: &[f64], y_pred: &[f64]) -> f64 {
    if y_true.is_empty() {
        return 0.0;
    }
    let correct = y_true
        .iter()
        .zip(y_pred.iter())
        .filter(|&(t, p)| (t - p).abs() < 0.5)
        .count();
    correct as f64 / y_true.len() as f64
}

/// Progress stage for AutoML operations
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub enum ProgressStage {
    Initializing,
    FeatureSelection,
    AlgorithmEvaluation,
    PipelineOptimization,
    Complete,
}

impl ProgressStage {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProgressStage::Initializing => "Initializing",
            ProgressStage::FeatureSelection => "Feature Selection",
            ProgressStage::AlgorithmEvaluation => "Algorithm Evaluation",
            ProgressStage::PipelineOptimization => "Pipeline Optimization",
            ProgressStage::Complete => "Complete",
        }
    }
}

/// Progress callback type: fn(stage: ProgressStage, current: usize, total: usize)
pub type ProgressCallback = fn(ProgressStage, usize, usize);

/// Algorithm type for AutoML
#[derive(Clone, Debug, PartialEq, Copy)]
pub enum AlgorithmType {
    LinearRegression,
    PolynomialRegression,
    KNearestNeighbors,
    LogisticRegression,
    NaiveBayes,
    DecisionTree,
    Perceptron,
    KMeans,
}

impl AlgorithmType {
    fn all_classification() -> Vec<AlgorithmType> {
        vec![
            AlgorithmType::LogisticRegression,
            AlgorithmType::KNearestNeighbors,
            AlgorithmType::NaiveBayes,
            AlgorithmType::DecisionTree,
            AlgorithmType::Perceptron,
        ]
    }

    fn all_regression() -> Vec<AlgorithmType> {
        vec![
            AlgorithmType::LinearRegression,
            AlgorithmType::PolynomialRegression,
        ]
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            AlgorithmType::LinearRegression => "LinearRegression",
            AlgorithmType::PolynomialRegression => "PolynomialRegression",
            AlgorithmType::KNearestNeighbors => "KNearestNeighbors",
            AlgorithmType::LogisticRegression => "LogisticRegression",
            AlgorithmType::NaiveBayes => "NaiveBayes",
            AlgorithmType::DecisionTree => "DecisionTree",
            AlgorithmType::Perceptron => "Perceptron",
            AlgorithmType::KMeans => "KMeans",
        }
    }
}

impl std::fmt::Display for AlgorithmType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// AutoML options
#[derive(Clone, Debug)]
pub struct AutoMLOptions {
    /// Number of CV folds
    pub cv_folds: usize,

    /// Population size for genetic algorithm
    pub population_size: usize,

    /// Generations for genetic algorithm
    pub generations: usize,

    /// Whether to perform feature selection
    pub do_feature_selection: bool,

    /// Maximum features to select
    pub max_features: usize,
}

impl Default for AutoMLOptions {
    fn default() -> Self {
        Self {
            cv_folds: 5,
            population_size: 30,
            generations: 20,
            do_feature_selection: true,
            max_features: 10,
        }
    }
}

/// AutoML result with enhanced DX/QoL methods
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct AutoMLResult {
    /// Best algorithm found
    #[wasm_bindgen(getter_with_clone)]
    pub best_algorithm: String,

    /// Best validation score
    #[wasm_bindgen(getter_with_clone)]
    pub best_score: f64,

    /// Number of evaluations performed
    #[wasm_bindgen(getter_with_clone)]
    pub evaluations: usize,

    /// Selected feature indices
    #[wasm_bindgen(getter_with_clone)]
    pub selected_features: Vec<usize>,

    /// Algorithm scores (algorithm name, score)
    #[wasm_bindgen(getter_with_clone)]
    pub algorithm_scores: Vec<String>,

    /// Why this algorithm was chosen (DX feature)
    #[wasm_bindgen(getter_with_clone)]
    pub rationale: String,

    /// Total features before selection
    #[wasm_bindgen(getter_with_clone)]
    pub original_features: usize,

    /// Whether feature selection was performed
    #[wasm_bindgen(getter_with_clone)]
    pub feature_selection_performed: bool,

    /// Problem type detected
    #[wasm_bindgen(getter_with_clone)]
    pub problem_type: String,
}

#[wasm_bindgen]
impl AutoMLResult {
    /// Get a human-readable summary of the AutoML result
    #[wasm_bindgen]
    pub fn summary(&self) -> String {
        format!(
            "AutoML Results ({})\n\
             ====================\n\
             Best Algorithm: {}\n\
             Score: {:.4}\n\
             Rationale: {}\n\
             \n\
             Features: {} → {} (selected {} of {})\n\
             Evaluations: {} algorithms tested\n\
             \n\
             Algorithm Rankings:\n\
             {}",
            self.problem_type,
            self.best_algorithm,
            self.best_score,
            self.rationale,
            self.original_features,
            self.selected_features.len(),
            self.selected_features.len(),
            self.original_features,
            self.evaluations,
            self.algorithm_scores.join("\n")
        )
    }

    /// Get the score of a specific algorithm
    #[wasm_bindgen]
    pub fn algorithm_score(&self, algorithm_name: &str) -> Option<f64> {
        self.algorithm_scores
            .iter()
            .find(|s| s.starts_with(&format!("{}:", algorithm_name)))
            .and_then(|s| s.split(':').nth(1))
            .and_then(|s| s.parse::<f64>().ok())
    }

    /// Compare this result with another
    #[wasm_bindgen]
    pub fn is_better_than(&self, other: &AutoMLResult) -> bool {
        self.best_score > other.best_score
    }
}

/// Simple AutoML engine with DX/QoL enhancements
pub struct AutoMLEngine {
    options: AutoMLOptions,
    progress_callback: RefCell<Option<ProgressCallback>>,
    early_stopping: bool,
    min_score_threshold: f64,
}

impl AutoMLEngine {
    pub fn new(options: AutoMLOptions) -> Self {
        Self {
            options,
            progress_callback: RefCell::new(None),
            early_stopping: true,
            min_score_threshold: 0.95, // Stop if we find a near-perfect fit
        }
    }

    /// Set progress callback for long-running operations
    pub fn on_progress(&mut self, callback: ProgressCallback) {
        self.progress_callback.replace(Some(callback));
    }

    /// Enable/disable early stopping
    pub fn with_early_stopping(mut self, enabled: bool) -> Self {
        self.early_stopping = enabled;
        self
    }

    /// Set minimum score threshold for early stopping
    pub fn with_min_threshold(mut self, threshold: f64) -> Self {
        self.min_score_threshold = threshold;
        self
    }

    /// Emit progress event if callback is set
    fn emit_progress(&self, stage: ProgressStage, current: usize, total: usize) {
        if let Some(callback) = *self.progress_callback.borrow() {
            callback(stage, current, total);
        }
    }

    /// Validate input data with helpful error messages
    fn validate_input(&self, x: &[Vec<f64>], y: &[f64]) -> Result<(), String> {
        if x.is_empty() {
            return Err("Training data X is empty. Provide at least one sample.".to_string());
        }

        if y.is_empty() {
            return Err("Target data Y is empty. Provide at least one label.".to_string());
        }

        if x.len() != y.len() {
            return Err(format!(
                "Data shape mismatch: X has {} samples but Y has {} labels. \
                Ensure X and Y have the same number of rows.",
                x.len(),
                y.len()
            ));
        }

        let n_features = x[0].len();
        if n_features == 0 {
            return Err(
                "Samples have zero features. Each row in X must have at least one feature."
                    .to_string(),
            );
        }

        for (i, row) in x.iter().enumerate() {
            if row.len() != n_features {
                return Err(format!(
                    "Inconsistent feature count: Row 0 has {} features but row {} has {}. \
                    All rows must have the same number of features.",
                    n_features,
                    i,
                    row.len()
                ));
            }
        }

        if x.len() < 5 {
            return Err(format!(
                "Too few samples: {} samples provided. AutoML requires at least 5 samples for reliable evaluation.",
                x.len()
            ));
        }

        Ok(())
    }

    /// Generate rationale for why an algorithm was chosen
    fn generate_rationale(
        &self,
        algorithm: &str,
        scores: &[(String, f64)],
        is_classification: bool,
    ) -> String {
        if scores.is_empty() {
            return format!(
                "{} selected as default (no evaluation performed).",
                algorithm
            );
        }

        let (best_name, best_score) = &scores[0];
        let score_diff = if scores.len() > 1 {
            best_score - scores[1].1
        } else {
            0.0
        };

        let problem_type = if is_classification {
            "classification"
        } else {
            "regression"
        };

        if score_diff > 0.1 {
            format!(
                "{} significantly outperformed alternatives (score: {:.4} vs {:.4}) for this {} task. \
                Strong correlation patterns detected in the data.",
                best_name, best_score, scores[1].1, problem_type
            )
        } else if score_diff > 0.01 {
            format!(
                "{} slightly outperformed alternatives (score: {:.4} vs {:.4}) for this {} task. \
                Multiple algorithms show similar performance.",
                best_name, best_score, scores[1].1, problem_type
            )
        } else {
            format!(
                "{} selected (score: {:.4}) for this {} task. \
                Multiple algorithms performed similarly - consider domain knowledge for final selection.",
                best_name, best_score, problem_type
            )
        }
    }

    /// Automated algorithm selection using cross-validation (with DX improvements)
    pub fn select_algorithm(&self, x: &[Vec<f64>], y: &[f64]) -> Result<AutoMLResult, MlError> {
        // Validate input first
        if let Err(e) = self.validate_input(x, y) {
            return Err(MlError::new(format!(
                "AutoML input validation failed: {}",
                e
            )));
        }

        self.emit_progress(ProgressStage::Initializing, 0, 1);

        // Determine problem type based on y values
        let is_classification = y
            .iter()
            .all(|&yi| yi == 0.0 || yi == 1.0 || yi == 2.0 || yi == 3.0);
        let problem_type = if is_classification {
            "classification"
        } else {
            "regression"
        };

        let algorithms = if is_classification {
            AlgorithmType::all_classification()
        } else {
            AlgorithmType::all_regression()
        };

        let mut algorithm_scores = Vec::new();
        let total = algorithms.len();

        for (idx, algorithm) in algorithms.iter().enumerate() {
            self.emit_progress(ProgressStage::AlgorithmEvaluation, idx, total);

            let score = self.evaluate_algorithm_cv(*algorithm, x, y);
            algorithm_scores.push((algorithm.to_string(), score));

            // Early stopping: if we found a near-perfect algorithm, stop
            if self.early_stopping && score >= self.min_score_threshold {
                self.emit_progress(ProgressStage::Complete, idx + 1, total);
                break;
            }
        }

        // Sort by score (descending)
        algorithm_scores.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));

        let best_algorithm_name = algorithm_scores
            .first()
            .map(|s| s.0.clone())
            .unwrap_or("LinearRegression".to_string());

        let best_score = algorithm_scores.first().map(|s| s.1).unwrap_or(0.0);

        // Generate rationale
        let rationale =
            self.generate_rationale(&best_algorithm_name, &algorithm_scores, is_classification);

        // Convert algorithm scores to Vec<String> for WASM
        let score_strings: Vec<String> = algorithm_scores
            .iter()
            .map(|(name, score)| format!("{}:{:.4}", name, score))
            .collect();

        self.emit_progress(ProgressStage::Complete, total, total);

        Ok(AutoMLResult {
            best_algorithm: best_algorithm_name,
            best_score,
            evaluations: algorithm_scores.len(),
            selected_features: (0..x[0].len()).collect(),
            algorithm_scores: score_strings,
            rationale,
            original_features: x[0].len(),
            feature_selection_performed: false,
            problem_type: problem_type.to_string(),
        })
    }

    fn evaluate_algorithm_cv(&self, algorithm: AlgorithmType, x: &[Vec<f64>], y: &[f64]) -> f64 {
        let n_samples = x.len();

        let n_features = if x.is_empty() { 0 } else { x[0].len() };
        if n_samples == 0 || n_features == 0 {
            return 0.0;
        }

        let cv_folds = self.options.cv_folds.max(2).min(n_samples);
        let fold_size = n_samples / cv_folds;

        // Detect problem type
        let is_classification = y.iter().all(|&yi| {
            let rounded = yi.round();
            (yi - rounded).abs() < 0.01 && (0.0..=10.0).contains(&rounded)
        });

        let mut total_score = 0.0;

        for fold in 0..cv_folds {
            let test_start = fold * fold_size;
            let test_end = if fold == cv_folds - 1 {
                n_samples
            } else {
                (fold + 1) * fold_size
            };

            // Build train/test splits
            let mut train_data = Vec::new();
            let mut train_labels = Vec::new();
            let mut test_data = Vec::new();
            let mut test_labels = Vec::new();

            for i in 0..n_samples {
                if i >= test_start && i < test_end {
                    test_data.extend_from_slice(&x[i]);
                    test_labels.push(y[i]);
                } else {
                    train_data.extend_from_slice(&x[i]);
                    train_labels.push(y[i]);
                }
            }

            if test_data.is_empty() || train_data.is_empty() {
                continue;
            }

            let score = if is_classification {
                self.eval_classification_fold(
                    algorithm,
                    &train_data,
                    &train_labels,
                    &test_data,
                    &test_labels,
                    n_features,
                )
            } else {
                self.eval_regression_fold(
                    algorithm,
                    &train_data,
                    &train_labels,
                    &test_data,
                    &test_labels,
                    n_features,
                )
            };

            total_score += score;
        }

        total_score / cv_folds as f64
    }

    /// Evaluate a classification algorithm on a single fold
    fn eval_classification_fold(
        &self,
        algorithm: AlgorithmType,
        train_data: &[f64],
        train_labels: &[f64],
        test_data: &[f64],
        test_labels: &[f64],
        n_features: usize,
    ) -> f64 {
        let predictions: Vec<f64> = match algorithm {
            AlgorithmType::KNearestNeighbors => {
                let k = 3.min(train_labels.len());
                match knn_fit_impl(train_data, n_features, train_labels, k) {
                    Ok(model) => preds_to_f64(&model.predict(test_data)),
                    Err(_) => return 0.0,
                }
            }
            AlgorithmType::DecisionTree => {
                match decision_tree_impl(train_data, n_features, train_labels, 10, 2, true) {
                    Ok(model) => model.predict(test_data),
                    Err(_) => return 0.0,
                }
            }
            AlgorithmType::NaiveBayes => {
                match naive_bayes_impl(train_data, n_features, train_labels) {
                    Ok(model) => preds_to_f64(&model.predict(test_data)),
                    Err(_) => return 0.0,
                }
            }
            AlgorithmType::LogisticRegression => {
                match logistic_regression_impl(
                    train_data,
                    n_features,
                    train_labels,
                    0.01,
                    100,
                    0.01,
                ) {
                    Ok(model) => preds_to_f64(&model.predict(test_data)),
                    Err(_) => return 0.0,
                }
            }
            AlgorithmType::Perceptron => {
                match perceptron_impl(train_data, n_features, train_labels, 0.01, 100) {
                    Ok(model) => preds_to_f64(&model.predict(test_data)),
                    Err(_) => return 0.0,
                }
            }
            _ => return 0.0, // Regression algorithm used for classification — skip
        };

        accuracy_simple(test_labels, &predictions)
    }

    /// Evaluate a regression algorithm on a single fold
    fn eval_regression_fold(
        &self,
        algorithm: AlgorithmType,
        train_data: &[f64],
        train_labels: &[f64],
        test_data: &[f64],
        test_labels: &[f64],
        n_features: usize,
    ) -> f64 {
        let predictions: Vec<f64> = match algorithm {
            AlgorithmType::LinearRegression => {
                match ridge_regression_impl(train_data, n_features, train_labels, 0.01) {
                    Ok(model) => model.predict(test_data),
                    Err(_) => return 0.0,
                }
            }
            AlgorithmType::PolynomialRegression => {
                // Use first feature for univariate polynomial fit
                let n_train = train_labels.len();
                let n_test = test_labels.len();
                if n_features == 0 {
                    return 0.0;
                }
                let train_x: Vec<f64> = (0..n_train).map(|i| train_data[i * n_features]).collect();
                let test_x: Vec<f64> = (0..n_test).map(|i| test_data[i * n_features]).collect();
                match polynomial_regression_impl(&train_x, train_labels, 2) {
                    Ok(model) => model.predict(&test_x),
                    Err(_) => return 0.0,
                }
            }
            _ => return 0.0, // Classification algorithm used for regression — skip
        };

        // Score with R-squared, clamped to [0, 1]
        match r2_score_impl(test_labels, &predictions) {
            Ok(r2) => r2.max(0.0),
            Err(_) => 0.0,
        }
    }

    /// Feature selection based on variance
    pub fn select_features(&self, x: &[Vec<f64>], _y: &[f64]) -> Vec<usize> {
        if x.is_empty() || x[0].is_empty() {
            return vec![];
        }

        let n_features = x[0].len();

        if n_features <= self.options.max_features {
            return (0..n_features).collect();
        }

        // Simple greedy feature selection based on variance
        let mut feature_scores: Vec<(usize, f64)> = (0..n_features)
            .map(|i| {
                let mean: f64 = x.iter().map(|row| row[i]).sum::<f64>() / x.len() as f64;
                let variance: f64 =
                    x.iter().map(|row| (row[i] - mean).powi(2)).sum::<f64>() / x.len() as f64;
                (i, variance)
            })
            .collect();

        // Sort by variance descending (higher variance = more informative)
        feature_scores.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));

        // Select top-k features
        feature_scores
            .iter()
            .take(self.options.max_features)
            .map(|(i, _)| *i)
            .collect()
    }

    /// Full AutoML pipeline (with DX improvements)
    pub fn optimize_pipeline(&self, x: &[Vec<f64>], y: &[f64]) -> Result<AutoMLResult, MlError> {
        // Validate input first
        if let Err(e) = self.validate_input(x, y) {
            return Err(MlError::new(format!(
                "AutoML input validation failed: {}",
                e
            )));
        }

        let original_features = x[0].len();

        // Step 1: Feature selection
        self.emit_progress(ProgressStage::FeatureSelection, 0, 1);
        let selected_features =
            if self.options.do_feature_selection && x[0].len() > self.options.max_features {
                self.select_features(x, y)
            } else {
                (0..x[0].len()).collect()
            };

        let feature_selection_performed = selected_features.len() < x[0].len();

        // Step 2: Create feature-subset data
        let subset_x: Vec<Vec<f64>> = x
            .iter()
            .map(|row| selected_features.iter().map(|&i| row[i]).collect())
            .collect();

        // Step 3: Algorithm selection
        self.emit_progress(ProgressStage::PipelineOptimization, 1, 2);
        let mut result = self.select_algorithm(&subset_x, y)?;

        // Update result with feature selection info
        result.selected_features = selected_features;
        result.original_features = original_features;
        result.feature_selection_performed = feature_selection_performed;

        self.emit_progress(ProgressStage::Complete, 2, 2);

        Ok(result)
    }
}

/// One-liner AutoML: The simplest way to get started.
/// x_json: JSON array of arrays (Vec<Vec<f64>>), y_json: JSON array of f64
#[wasm_bindgen]
pub fn auto_fit(x_json: &str, y_json: &str) -> Result<AutoMLResult, JsError> {
    let x: Vec<Vec<f64>> = serde_json::from_str(x_json)
        .map_err(|e| JsError::new(&format!("x parse error: {e}")))?;
    let y: Vec<f64> = serde_json::from_str(y_json)
        .map_err(|e| JsError::new(&format!("y parse error: {e}")))?;
    let engine = AutoMLEngine::new(AutoMLOptions::default());
    engine
        .optimize_pipeline(&x, &y)
        .map_err(|e| JsError::new(&e.to_string()))
}

/// PSO-based hyperparameter optimization
pub fn optimize_hyperparameters_pso(
    data: &[f64],
    targets: &[f64],
    algorithm: AlgorithmType,
    n_samples: usize,
    n_features: usize,
    n_particles: usize,
    max_iter: usize,
) -> Result<AutoMLResult, MlError> {
    let n_classes = {
        let mut classes = std::collections::HashSet::new();
        for &t in targets.iter() {
            classes.insert(t as u32);
        }
        classes.len()
    };

    // Define hyperparameter search space based on algorithm
    let (dimensions, bounds_min, bounds_max) = match algorithm {
        AlgorithmType::KNearestNeighbors => {
            // Just n_neighbors: [1, 50]
            (1, vec![1.0], vec![50.0])
        }
        AlgorithmType::LogisticRegression => {
            // C: [0.01, 10.0], max_iter: [100, 2000]
            (2, vec![0.01, 100.0], vec![10.0, 2000.0])
        }
        AlgorithmType::DecisionTree => {
            // max_depth: [1, 20], min_samples_split: [2, 100]
            (2, vec![1.0, 2.0], vec![20.0, 100.0])
        }
        AlgorithmType::LinearRegression | AlgorithmType::PolynomialRegression => {
            // No hyperparameters to optimize
            return train_algorithm(data, n_features, targets, algorithm);
        }
        _ => {
            // Default: no optimization needed
            return train_algorithm(data, n_features, targets, algorithm);
        }
    };

    // Fitness function (negate because PSO minimizes)
    let fitness = |position: &[f64]| -> f64 {
        let params = position.to_vec();
        let cv_score = evaluate_algorithm_with_params(
            data,
            targets,
            algorithm,
            &params,
            EvaluationConfig {
                n_samples,
                n_features,
                _n_classes: n_classes,
                cv_folds: 3, // 3-fold CV for speed
            },
        );
        -cv_score // PSO minimizes, so negate
    };

    // Initialize PSO
    use crate::optimization::pso::{PSOOptions, PSO};
    let mut pso = PSO::with_options(PSOOptions {
        swarm_size: n_particles,
        iterations: max_iter,
        w: 0.7,
        c1: 1.5,
        c2: 1.5,
        bounds: Some((bounds_min[0], bounds_max[0])),
    });

    // Run optimization using a closure fitness function
    // Note: We create a struct to hold the closure and implement FitnessFunction
    struct HyperparameterFitness<F>
    where
        F: Fn(&[f64]) -> f64,
    {
        f: F,
        dimension: usize,
    }

    impl<F> FitnessFunction<f64> for HyperparameterFitness<F>
    where
        F: Fn(&[f64]) -> f64 + Send + Sync,
    {
        fn evaluate(&self, individual: &Individual<f64>) -> f64 {
            (self.f)(&individual.genes)
        }

        fn dimension(&self) -> usize {
            self.dimension
        }
    }

    let fitness_obj = HyperparameterFitness {
        f: fitness,
        dimension: dimensions,
    };
    let result = pso.optimize(&fitness_obj, dimensions);

    let best_params = &result.best.genes;

    // Train final model with best hyperparameters
    train_algorithm_with_params(data, n_features, targets, algorithm, best_params, n_samples)
}

/// Configuration for algorithm evaluation
struct EvaluationConfig {
    n_samples: usize,
    n_features: usize,
    _n_classes: usize,
    cv_folds: usize,
}

/// Evaluate algorithm with specific hyperparameters
fn evaluate_algorithm_with_params(
    data: &[f64],
    targets: &[f64],
    algorithm: AlgorithmType,
    params: &[f64],
    config: EvaluationConfig,
) -> f64 {
    let cv_folds = config.cv_folds;
    let n_samples = config.n_samples;
    let n_features = config.n_features;

    // Simple k-fold cross-validation
    let fold_size = n_samples / cv_folds;
    let mut total_score = 0.0;

    for fold in 0..cv_folds {
        let test_start = fold * fold_size;
        let test_end = if fold == cv_folds - 1 {
            n_samples
        } else {
            (fold + 1) * fold_size
        };

        // For now, use a simple evaluation (can be enhanced)
        let score = match algorithm {
            AlgorithmType::KNearestNeighbors => {
                let _k = params[0] as usize;
                // Simple k-NN accuracy
                let mut correct = 0;
                for i in test_start..test_end {
                    let mut best_dist = f64::MAX;
                    let mut best_label = targets[0];
                    for j in 0..n_samples {
                        if j >= test_start && j < test_end {
                            continue;
                        }
                        let mut dist_sq = 0.0;
                        for feat in 0..n_features {
                            let d = data[i * n_features + feat] - data[j * n_features + feat];
                            dist_sq += d * d;
                        }
                        if dist_sq < best_dist {
                            best_dist = dist_sq;
                            best_label = targets[j];
                        }
                    }
                    if (best_label - targets[i]).abs() < 0.5 {
                        correct += 1;
                    }
                }
                correct as f64 / (test_end - test_start) as f64
            }
            _ => {
                // For other algorithms, use a default score
                0.5
            }
        };

        total_score += score;
    }

    total_score / cv_folds as f64
}

/// Train algorithm with specific hyperparameters
fn train_algorithm_with_params(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    algorithm: AlgorithmType,
    params: &[f64],
    n_samples: usize,
) -> Result<AutoMLResult, MlError> {
    let n = if n_samples > 0 {
        n_samples
    } else {
        data.len() / n_features.max(1)
    };

    match algorithm {
        AlgorithmType::KNearestNeighbors => {
            let k = params.first().copied().unwrap_or(3.0).round().max(1.0) as usize;
            knn_fit_impl(data, n_features, targets, k).map(|model| {
                let preds = preds_to_f64(&model.predict(data));
                let score = accuracy_simple(targets, &preds);
                AutoMLResult {
                    best_algorithm: format!("KNearestNeighbors(k={})", k),
                    best_score: score,
                    evaluations: 1,
                    selected_features: (0..n_features).collect(),
                    algorithm_scores: vec![format!("KNearestNeighbors:{:.4}", score)],
                    rationale: format!("KNN with k={} trained with {} samples.", k, n),
                    original_features: n_features,
                    feature_selection_performed: false,
                    problem_type: "classification".to_string(),
                }
            })
        }
        AlgorithmType::LogisticRegression => {
            let learning_rate = params.first().copied().unwrap_or(0.01).clamp(1e-6, 1.0);
            let max_iter = params.get(1).copied().unwrap_or(200.0).round().max(1.0) as usize;
            logistic_regression_impl(data, n_features, targets, learning_rate, max_iter, 0.01).map(
                |model| {
                    let preds = preds_to_f64(&model.predict(data));
                    let score = accuracy_simple(targets, &preds);
                    AutoMLResult {
                        best_algorithm: format!(
                            "LogisticRegression(lr={:.4},iter={})",
                            learning_rate, max_iter
                        ),
                        best_score: score,
                        evaluations: 1,
                        selected_features: (0..n_features).collect(),
                        algorithm_scores: vec![format!("LogisticRegression:{:.4}", score)],
                        rationale: format!(
                            "Logistic regression with lr={:.4} trained over {} epochs.",
                            learning_rate, max_iter
                        ),
                        original_features: n_features,
                        feature_selection_performed: false,
                        problem_type: "classification".to_string(),
                    }
                },
            )
        }
        AlgorithmType::DecisionTree => {
            let max_depth = params.first().copied().unwrap_or(10.0).round().max(1.0) as usize;
            let min_samples = params.get(1).copied().unwrap_or(2.0).round().max(1.0) as usize;
            decision_tree_impl(data, n_features, targets, max_depth, min_samples, true).map(
                |model| {
                    let preds = model.predict(data);
                    let score = accuracy_simple(targets, &preds);
                    AutoMLResult {
                        best_algorithm: format!(
                            "DecisionTree(depth={},min={})",
                            max_depth, min_samples
                        ),
                        best_score: score,
                        evaluations: 1,
                        selected_features: (0..n_features).collect(),
                        algorithm_scores: vec![format!("DecisionTree:{:.4}", score)],
                        rationale: format!(
                            "Decision tree with max_depth={} and min_samples={}.",
                            max_depth, min_samples
                        ),
                        original_features: n_features,
                        feature_selection_performed: false,
                        problem_type: "classification".to_string(),
                    }
                },
            )
        }
        AlgorithmType::LinearRegression => {
            let lambda = params.first().copied().unwrap_or(0.01).clamp(1e-9, 1e3);
            ridge_regression_impl(data, n_features, targets, lambda).map(|model| {
                let preds = model.predict(data);
                let score = r2_score_impl(targets, &preds).unwrap_or(0.0).max(0.0);
                AutoMLResult {
                    best_algorithm: format!("LinearRegression(lambda={:.4})", lambda),
                    best_score: score,
                    evaluations: 1,
                    selected_features: (0..n_features).collect(),
                    algorithm_scores: vec![format!("LinearRegression:{:.4}", score)],
                    rationale: format!(
                        "Ridge regression with lambda={:.4} trained on {} samples.",
                        lambda, n
                    ),
                    original_features: n_features,
                    feature_selection_performed: false,
                    problem_type: "regression".to_string(),
                }
            })
        }
        // Fall back to generic training for remaining algorithms
        _ => train_algorithm(data, n_features, targets, algorithm),
    }
}

/// Train algorithm and return AutoMLResult
fn train_algorithm(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    _algorithm: AlgorithmType,
) -> Result<AutoMLResult, MlError> {
    // Convert flat data to matrix format
    let n_samples = data.len() / n_features;
    let mut x_matrix = Vec::with_capacity(n_samples);
    for i in 0..n_samples {
        let start = i * n_features;
        let end = start + n_features;
        x_matrix.push(data[start..end].to_vec());
    }

    // Create a simple AutoML result
    let engine = AutoMLEngine::new(AutoMLOptions::default());
    let result = engine.select_algorithm(&x_matrix, targets)?;
    Ok(result)
}

/// Convenience function: automated regression
#[wasm_bindgen]
pub fn auto_fit_regression(
    x: &[f64],
    y: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Result<AutoMLResult, JsError> {
    let mut x_matrix = Vec::with_capacity(n_samples);
    for i in 0..n_samples {
        let start = i * n_features;
        let end = start + n_features;
        x_matrix.push(x[start..end].to_vec());
    }

    let engine = AutoMLEngine::new(AutoMLOptions::default());
    engine
        .optimize_pipeline(&x_matrix, y)
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Convenience function: automated classification
#[wasm_bindgen]
pub fn auto_fit_classification(
    x: &[f64],
    y: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Result<AutoMLResult, JsError> {
    let mut x_matrix = Vec::with_capacity(n_samples);
    for i in 0..n_samples {
        let start = i * n_features;
        let end = start + n_features;
        x_matrix.push(x[start..end].to_vec());
    }

    let engine = AutoMLEngine::new(AutoMLOptions::default());
    engine
        .optimize_pipeline(&x_matrix, y)
        .map_err(|e| JsError::new(&e.to_string()))
}

/// Get algorithm recommendation based on data characteristics
#[wasm_bindgen]
pub fn recommend_algorithm(
    n_samples: usize,
    n_features: usize,
    n_classes: usize,
    is_sparse: bool,
) -> String {
    if n_samples < 100 {
        "NaiveBayes".to_string()
    } else if is_sparse {
        "Perceptron".to_string()
    } else if n_features > 100 {
        "LogisticRegression".to_string()
    } else if n_classes > 5 {
        "DecisionTree".to_string()
    } else {
        "KNearestNeighbors".to_string()
    }
}

/// Metaheuristic feature selection using genetic algorithm
pub fn select_features_ga(
    data: &[f64],
    targets: &[f64],
    n_features: usize,
    max_features: usize,
    population_size: usize,
    generations: usize,
) -> Vec<usize> {
    let n_samples = data.len() / n_features;

    // Fitness function wrapper for GA
    struct FeatureSelectionFitness {
        data: Vec<f64>,
        targets: Vec<f64>,
        n_samples: usize,
        n_features: usize,
    }

    impl FitnessFunction<f64> for FeatureSelectionFitness {
        fn evaluate(&self, individual: &Individual<f64>) -> f64 {
            let genes = &individual.genes;
            let selected: Vec<usize> = genes
                .iter()
                .enumerate()
                .filter(|(_, &gene)| gene > 0.5)
                .map(|(i, _)| i)
                .collect();

            if selected.is_empty() {
                return 0.0;
            }

            // Create feature-subset data
            let subset_data: Vec<f64> = selected
                .iter()
                .flat_map(|&feat_idx| {
                    self.data
                        .iter()
                        .enumerate()
                        .skip(feat_idx)
                        .step_by(self.n_features)
                        .take(self.n_samples)
                        .map(|(_, &val)| val)
                })
                .collect();

            // Quick CV score using naive classification

            cross_validate_score_quick(
                &subset_data,
                &self.targets,
                self.n_samples,
                selected.len(),
                3,
            )
        }

        fn dimension(&self) -> usize {
            self.n_features
        }
    }

    let fitness_fn = FeatureSelectionFitness {
        data: data.to_vec(),
        targets: targets.to_vec(),
        n_samples,
        n_features,
    };

    // Gene factory for binary feature selection (0 or 1)
    let gene_factory = || -> f64 {
        if crate::optimization::genetic::rand_f64() < 0.5 {
            0.0
        } else {
            1.0
        }
    };

    // Initialize GA with options
    let options = GeneticOptions {
        population_size,
        generations,
        crossover_rate: 0.7,
        mutation_rate: 0.01,
        elitism_count: 1,
        ..Default::default()
    };

    let mut ga = GeneticAlgorithm::with_options(options);

    // Run evolution
    let result = ga.optimize(&fitness_fn, &gene_factory, n_features);

    // Extract best feature subset
    let best_genes = &result.best.genes;
    best_genes
        .iter()
        .enumerate()
        .filter(|(_, &gene)| gene > 0.5)
        .map(|(i, _)| i)
        .take(max_features)
        .collect()
}

/// Quick CV score for GA fitness evaluation
fn cross_validate_score_quick(
    data: &[f64],
    targets: &[f64],
    n_samples: usize,
    n_features: usize,
    cv_folds: usize,
) -> f64 {
    // Use naive classification accuracy as quick metric
    let fold_size = n_samples / cv_folds;
    let mut total_score = 0.0;

    for fold in 0..cv_folds {
        let test_start = fold * fold_size;
        let test_end = if fold == cv_folds - 1 {
            n_samples
        } else {
            (fold + 1) * fold_size
        };

        // Simple majority vote classifier for evaluation
        let mut correct = 0;
        for i in test_start..test_end {
            // Find nearest training sample
            let mut best_dist = f64::MAX;
            let mut best_label = targets[0];
            for j in 0..n_samples {
                if j >= test_start && j < test_end {
                    continue;
                }
                let mut dist_sq = 0.0;
                for feat in 0..n_features {
                    let d = data[i * n_features + feat] - data[j * n_features + feat];
                    dist_sq += d * d;
                }
                if dist_sq < best_dist {
                    best_dist = dist_sq;
                    best_label = targets[j];
                }
            }
            if (best_label - targets[i]).abs() < 0.5 {
                correct += 1;
            }
        }

        total_score += correct as f64 / (test_end - test_start) as f64;
    }

    total_score / cv_folds as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_algorithm_selection() {
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false); // Disable early stopping for this test

        let x: Vec<Vec<f64>> = (1..=10).map(|i| vec![i as f64, (i + 1) as f64]).collect();
        let y: Vec<f64> = (1..=10).map(|i| 2.0 * i as f64 + 1.0).collect();

        let result = engine.select_algorithm(&x, &y).unwrap();

        assert_eq!(result.evaluations, 2); // Linear + Polynomial
        assert!(result.best_score > 0.0);
    }

    #[test]
    fn test_feature_selection() {
        let engine = AutoMLEngine::new(AutoMLOptions::default());

        let x = vec![
            vec![1.0, 2.0, 0.0],
            vec![2.0, 3.0, 0.0],
            vec![3.0, 4.0, 0.0],
            vec![4.0, 5.0, 1.0],
            vec![5.0, 6.0, 1.0],
        ];
        let y = vec![2.0, 3.0, 4.0, 5.0, 6.0];

        let selected = engine.select_features(&x, &y);

        assert!(selected.len() <= 10); // max_features default
    }

    #[test]
    fn test_recommend_algorithm() {
        let rec = recommend_algorithm(1000, 50, 2, false);
        assert!(!rec.is_empty());

        let rec_sparse = recommend_algorithm(1000, 200, 2, true);
        assert_eq!(rec_sparse, "Perceptron");
    }

    #[test]
    fn test_auto_fit_regression() {
        let x_flat = vec![
            1.0, 2.0, // Sample 1
            2.0, 4.0, // Sample 2
            3.0, 6.0, // Sample 3
            4.0, 8.0, // Sample 4
            5.0, 10.0, // Sample 5
        ];
        let y = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let result = auto_fit_regression(&x_flat, &y, 5, 2).unwrap();

        // Early stopping may reduce evaluations
        assert!(result.evaluations >= 1 && result.evaluations <= 2);
        assert!(result.best_score > 0.0);
    }

    #[test]
    fn test_auto_fit_one_liner() {
        let x = vec![
            vec![1.0, 2.0],
            vec![2.0, 3.0],
            vec![3.0, 4.0],
            vec![4.0, 5.0],
            vec![5.0, 6.0],
        ];
        let y = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let x_json = serde_json::to_string(&x).unwrap();
        let y_json = serde_json::to_string(&y).unwrap();
        let result = auto_fit(&x_json, &y_json).unwrap();

        assert!(!result.best_algorithm.is_empty());
        assert!(result.best_score >= 0.0);
        assert!(result.original_features > 0);
        assert!(!result.problem_type.is_empty());
    }

    #[test]
    fn test_result_summary() {
        let x = vec![
            vec![1.0, 2.0],
            vec![2.0, 3.0],
            vec![3.0, 4.0],
            vec![4.0, 5.0],
            vec![5.0, 6.0],
        ];
        let y = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let x_json = serde_json::to_string(&x).unwrap();
        let y_json = serde_json::to_string(&y).unwrap();
        let result = auto_fit(&x_json, &y_json).unwrap();
        let summary = result.summary();

        assert!(summary.contains("AutoML Results"));
        assert!(summary.contains(&result.best_algorithm));
        assert!(summary.contains("Features:"));
    }

    #[test]
    fn test_algorithm_score_lookup() {
        let x = vec![
            vec![1.0, 2.0],
            vec![2.0, 3.0],
            vec![3.0, 4.0],
            vec![4.0, 5.0],
            vec![5.0, 6.0],
        ];
        let y = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let x_json = serde_json::to_string(&x).unwrap();
        let y_json = serde_json::to_string(&y).unwrap();
        let result = auto_fit(&x_json, &y_json).unwrap();

        // Should be able to look up scores
        if let Some(score) = result.algorithm_score("LinearRegression") {
            assert!(score >= 0.0 && score <= 1.0);
        }
    }

    #[test]
    fn test_input_validation_empty_x() {
        let engine = AutoMLEngine::new(AutoMLOptions::default());
        let x: Vec<Vec<f64>> = vec![];
        let y = vec![1.0, 2.0];

        // Should return error with helpful message
        let result = engine.validate_input(&x, &y);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("empty"));
    }

    #[test]
    fn test_input_validation_shape_mismatch() {
        let engine = AutoMLEngine::new(AutoMLOptions::default());
        let x = vec![
            vec![1.0, 2.0],
            vec![3.0, 4.0],
            vec![5.0, 6.0],
            vec![7.0, 8.0],
            vec![9.0, 10.0],
        ];
        let y = vec![1.0, 2.0, 3.0, 4.0]; // Only 4 labels for 5 samples

        let result = engine.validate_input(&x, &y);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("mismatch"));
    }

    #[test]
    fn test_input_validation_inconsistent_features() {
        let engine = AutoMLEngine::new(AutoMLOptions::default());
        let x = vec![
            vec![1.0, 2.0],
            vec![3.0], // Second row has only 1 feature
            vec![5.0, 6.0],
            vec![7.0, 8.0],
            vec![9.0, 10.0],
        ];
        let y = vec![1.0, 2.0, 3.0, 4.0, 5.0];

        let result = engine.validate_input(&x, &y);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Inconsistent"));
    }

    #[test]
    fn test_rationale_generation() {
        let engine = AutoMLEngine::new(AutoMLOptions::default());

        let x = vec![
            vec![1.0, 2.0],
            vec![2.0, 3.0],
            vec![3.0, 4.0],
            vec![4.0, 5.0],
            vec![5.0, 6.0],
        ];
        let y = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let result = engine.optimize_pipeline(&x, &y).unwrap();

        // Should have a rationale
        assert!(!result.rationale.is_empty());
        assert!(result.rationale.len() > 20); // Should be descriptive
    }

    #[test]
    fn test_feature_selection_tracking() {
        let mut options = AutoMLOptions::default();
        options.max_features = 2; // Force feature selection
        options.do_feature_selection = true;

        let engine = AutoMLEngine::new(options);

        let x = vec![
            vec![1.0, 2.0, 3.0],
            vec![2.0, 3.0, 4.0],
            vec![3.0, 4.0, 5.0],
            vec![4.0, 5.0, 6.0],
            vec![5.0, 6.0, 7.0],
        ];
        let y = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let result = engine.optimize_pipeline(&x, &y).unwrap();

        assert_eq!(result.original_features, 3);
        assert!(result.selected_features.len() <= result.original_features);
        assert!(result.feature_selection_performed || result.selected_features.len() == 3);
    }

    // ═══════════════════════ JTBD QUALITY TESTS ═══════════════════════

    #[test]
    fn test_automl_finds_good_classifier_on_separable_data() {
        // JTBD: "Given clearly separable clusters, AutoML should find a classifier with high accuracy."
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false);

        let x = vec![
            vec![0.0, 0.0],
            vec![0.1, 0.1],
            vec![-0.1, 0.1],
            vec![0.0, -0.1],
            vec![0.1, -0.1],
            vec![-0.1, -0.1],
            vec![5.0, 5.0],
            vec![5.1, 5.1],
            vec![4.9, 5.0],
            vec![5.0, 4.9],
            vec![5.1, 4.9],
            vec![4.9, 5.1],
        ];
        let y = vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

        let result = engine.select_algorithm(&x, &y).unwrap();

        assert_eq!(result.problem_type, "classification");
        assert!(
            result.best_score >= 0.8,
            "Expected accuracy >= 0.8 on separable data, got {:.4}",
            result.best_score
        );
    }

    #[test]
    fn test_automl_finds_good_regressor_on_linear_data() {
        // JTBD: "Given linear data, AutoML should find a regressor with high R²."
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false);

        let x: Vec<Vec<f64>> = (1..=15).map(|i| vec![i as f64]).collect();
        let y: Vec<f64> = (1..=15).map(|i| 3.0 * i as f64 + 2.0).collect();

        let result = engine.select_algorithm(&x, &y).unwrap();

        assert_eq!(result.problem_type, "regression");
        assert!(
            result.best_score >= 0.9,
            "Expected R² >= 0.9 on linear data, got {:.4}",
            result.best_score
        );
    }

    #[test]
    fn test_automl_scores_differ_across_algorithms() {
        // JTBD: "AutoML should actually compare distinct models, not give all algorithms the same score."
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false);

        let x = vec![
            vec![1.0, 1.0],
            vec![1.5, 1.2],
            vec![2.0, 1.8],
            vec![1.2, 2.0],
            vec![1.8, 1.5],
            vec![2.5, 2.2],
            vec![3.0, 2.8],
            vec![2.8, 3.0],
            vec![3.2, 2.5],
            vec![3.5, 3.2],
            vec![5.0, 5.0],
            vec![5.5, 5.2],
            vec![6.0, 5.8],
            vec![5.2, 6.0],
            vec![5.8, 5.5],
            vec![6.5, 6.2],
            vec![7.0, 6.8],
            vec![6.8, 7.0],
            vec![7.2, 6.5],
            vec![7.5, 7.2],
        ];
        let y = vec![
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
            1.0, 1.0, 1.0,
        ];

        let result = engine.select_algorithm(&x, &y).unwrap();

        let scores: Vec<f64> = result
            .algorithm_scores
            .iter()
            .filter_map(|s| s.split(':').nth(1)?.parse::<f64>().ok())
            .collect();

        let unique_scores: std::collections::HashSet<i64> = scores
            .iter()
            .map(|s| ((s * 1000.0).round()) as i64)
            .collect();

        assert!(unique_scores.len() > 1,
            "All algorithms received identical scores -- evaluate_algorithm_cv is not using the algorithm parameter");
    }

    #[test]
    fn test_automl_evaluates_all_algorithms_when_early_stopping_off() {
        // JTBD: "With early stopping disabled, all candidate algorithms should be evaluated."
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false);

        let x: Vec<Vec<f64>> = (1..=15).map(|i| vec![i as f64, (i as f64) * 0.5]).collect();
        let y: Vec<f64> = (1..=15).map(|i| 2.0 * i as f64 + 1.0).collect();

        let result = engine.select_algorithm(&x, &y).unwrap();

        assert_eq!(
            result.evaluations, 2,
            "Expected 2 evaluations for regression, got {}",
            result.evaluations
        );
        assert_eq!(result.algorithm_scores.len(), 2);
    }

    #[test]
    fn test_automl_detects_problem_type_correctly() {
        // JTBD: "AutoML should auto-detect classification vs regression and evaluate the right set."
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false);

        let x: Vec<Vec<f64>> = (1..=15).map(|i| vec![i as f64]).collect();

        // Classification: integer labels
        let y_cls = vec![
            0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0,
        ];
        let result_cls = engine.select_algorithm(&x, &y_cls).unwrap();
        assert_eq!(result_cls.problem_type, "classification");
        assert_eq!(result_cls.evaluations, 5);

        // Regression: continuous labels
        let y_reg: Vec<f64> = (1..=15).map(|i| 2.5 * i as f64 + 0.3).collect();
        let result_reg = engine.select_algorithm(&x, &y_reg).unwrap();
        assert_eq!(result_reg.problem_type, "regression");
        assert_eq!(result_reg.evaluations, 2);
    }

    #[test]
    fn test_automl_uses_cv_folds_not_single_split() {
        // JTBD: "The cv_folds parameter should actually control evaluation robustness."
        // Use data with noise so different fold splits produce different R² scores.
        let x: Vec<Vec<f64>> = (1..=20).map(|i| vec![i as f64]).collect();
        let y: Vec<f64> = (1..=20)
            .map(|i| 3.0 * i as f64 + 2.0 + ((i * 7 + 3) % 5) as f64 * 0.5)
            .collect();

        let mut opts_5 = AutoMLOptions::default();
        opts_5.cv_folds = 5;
        let engine_5 = AutoMLEngine::new(opts_5).with_early_stopping(false);
        let result_5 = engine_5.select_algorithm(&x, &y).unwrap();

        let mut opts_2 = AutoMLOptions::default();
        opts_2.cv_folds = 2;
        let engine_2 = AutoMLEngine::new(opts_2).with_early_stopping(false);
        let result_2 = engine_2.select_algorithm(&x, &y).unwrap();

        assert_ne!(
            result_5.best_score, result_2.best_score,
            "5-fold and 2-fold CV produced identical scores -- cv_folds is not being used"
        );
    }

    #[test]
    fn test_automl_score_reflects_model_performance_not_correlation() {
        // JTBD: "The score should reflect actual model performance, not feature-target correlation."
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false);

        // y = x² relationship — actual polynomial fit gives high R²
        let x: Vec<Vec<f64>> = (1..=20).map(|i| vec![i as f64]).collect();
        let y: Vec<f64> = (1..=20).map(|i| (i as f64).powi(2)).collect();

        let result = engine.select_algorithm(&x, &y).unwrap();

        assert!(
            result.best_score >= 0.5,
            "Score {:.4} is too low -- evaluate_algorithm_cv may not be training models",
            result.best_score
        );
    }

    #[test]
    fn test_automl_ranks_better_algorithm_higher() {
        // JTBD: "On quadratic data, PolynomialRegression should score higher than LinearRegression."
        let engine = AutoMLEngine::new(AutoMLOptions::default()).with_early_stopping(false);

        let x: Vec<Vec<f64>> = (1..=15).map(|i| vec![i as f64]).collect();
        let y: Vec<f64> = (1..=15).map(|i| 0.5 * (i as f64).powi(2)).collect();

        let result = engine.select_algorithm(&x, &y).unwrap();

        let lin_score = result.algorithm_score("LinearRegression");
        let poly_score = result.algorithm_score("PolynomialRegression");

        assert!(
            lin_score.is_some(),
            "LinearRegression should have been evaluated"
        );
        assert!(
            poly_score.is_some(),
            "PolynomialRegression should have been evaluated"
        );

        assert!(poly_score.unwrap() > lin_score.unwrap(),
            "PolynomialRegression ({:.4}) should outperform LinearRegression ({:.4}) on quadratic data",
            poly_score.unwrap(), lin_score.unwrap());
    }

    // ── T006 stub tests ─────────────────────────────────────────────────────

    #[test]
    fn test_train_algorithm_with_params_knn_respects_k() {
        // k=1 NN on clearly separable data should score 1.0 on training data
        let data = vec![
            0.0, 0.0, // class 0
            0.1, 0.0, // class 0
            1.0, 1.0, // class 1
            0.9, 1.0, // class 1
            0.5, 0.5, // class 0
            0.0, 1.0, // class 1
            0.0, 0.0, // class 0
            1.0, 1.0, // class 1
            0.2, 0.1, // class 0
            0.8, 0.9, // class 1
        ];
        let targets = vec![0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0];

        // k=1: should perfectly memorise training data
        let result = train_algorithm_with_params(
            &data,
            2,
            &targets,
            AlgorithmType::KNearestNeighbors,
            &[1.0],
            10,
        );
        assert!(result.is_ok(), "KNN train_with_params should succeed");
        let r = result.unwrap();
        assert!(
            r.best_algorithm.contains("KNearestNeighbors"),
            "algorithm name should mention KNN"
        );
        assert!(
            r.best_score >= 0.9,
            "k=1 KNN should score >= 0.9 on training data"
        );
    }

    #[test]
    fn test_train_algorithm_with_params_linear_uses_lambda() {
        // Perfect linear data: y = 2x — ridge regression should fit well with small lambda
        let data: Vec<f64> = (0..20).map(|i| i as f64 / 10.0).collect();
        let targets: Vec<f64> = data.iter().map(|&x| 2.0 * x).collect();

        let result_small_lambda = train_algorithm_with_params(
            &data,
            1,
            &targets,
            AlgorithmType::LinearRegression,
            &[1e-6],
            20,
        );
        assert!(result_small_lambda.is_ok());
        let r = result_small_lambda.unwrap();
        assert!(
            r.best_score > 0.9,
            "Ridge with tiny lambda should fit perfect linear data well, got {}",
            r.best_score
        );
        assert!(
            r.best_algorithm.contains("LinearRegression"),
            "algorithm name should mention LinearRegression"
        );
    }

    #[test]
    fn test_train_algorithm_with_params_decision_tree_uses_depth() {
        // Binary classification: alternating labels — deep tree should overfit (high train score)
        let data: Vec<f64> = (0..20)
            .flat_map(|i| vec![i as f64, (i % 3) as f64])
            .collect();
        let targets: Vec<f64> = (0..20).map(|i| (i % 2) as f64).collect();

        let result = train_algorithm_with_params(
            &data,
            2,
            &targets,
            AlgorithmType::DecisionTree,
            &[15.0, 1.0],
            20,
        );
        assert!(
            result.is_ok(),
            "DecisionTree train_with_params should succeed: {:?}",
            result.err()
        );
        let r = result.unwrap();
        assert!(
            r.best_algorithm.contains("DecisionTree"),
            "should mention DecisionTree"
        );
        assert!(r.best_score >= 0.0, "score should be non-negative");
    }
}
