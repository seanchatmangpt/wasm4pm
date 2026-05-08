# miniml Comprehensive Benchmark Suite

110 benchmarks across 26 categories, covering all native-benchmarkable algorithms.

## Run Instructions

### Native Rust (standalone binary)
```bash
cd crates/miniml-core
cargo run --bin bench_all --release
```

### Criterion (statistical benchmarking)
```bash
cd crates/miniml-core
cargo bench
```

### WASM / TypeScript benchmarks
```bash
cd /path/to/miniml
pnpm build
pnpm test
```

## Benchmark Methodology

### Timing Infrastructure
- **Warmup**: N iterations before timing to stabilize caches and branch prediction
- **Iterations**: Fast algorithms (O(n) linear) use 100–1000 iterations; expensive ones use 5–10
- **Precision**: Nanosecond timing via `Instant::elapsed().as_nanos()` — no sub-microsecond truncation
- **Anti-optimization**: `std::hint::black_box` wraps all results to prevent dead-code elimination
- **Display**: Tiered formatting (μs/ms/s) with coefficient of variation (CV%)

### Dataset Scaling
Datasets are sized to produce measurable, trustworthy results:
- **Time series**: 100K samples (scaled 200x from original 500 to produce real timing)
- **Regression**: 10K–100K samples (scaled 20–100x)
- **Metrics**: 100K samples (scaled 100x)
- **Preprocessing**: 100K samples (scaled 100x)
- **Classification**: 2K–10K samples (varies by algorithm complexity)
- **Clustering**: 1K–5K samples (O(n³) algorithms kept conservative)
- **Probabilistic**: 1M samples for MC, 100 obs for HMM
- **Statistical**: 10K samples for t-tests, ANOVA
- **Kernel**: 500 samples for kernel matrices
- **Bayesian/GP**: 200-500 samples for MCMC/GP

### Stability
Every benchmark reports CV% (coefficient of variation). Target: CV < 10% for reliable measurements. Benchmarks with CV > 10% may need more iterations or larger datasets.

## Architecture: Native vs WASM Benchmarking

Most functions have dual APIs:
- **`_impl` variants**: Pure Rust, return `Result<T, MlError>`, benchmarkable natively
- **`#[wasm_bindgen]` wrappers**: Convert errors to `JsError`, benchmarkable in WASM/TS

Functions that are **WASM-only** (require `JsValue` / `js_sys::Function` / return `js_sys::Array`):
- LIME explanations, SHAP values
- Model persistence (save/load JSON)
- Stacked/Blended/Voting ensembles
- Decision paths, counterfactuals
- Fine-tuning, ONNX export/import
- SMOTE, random oversampling (return `js_sys::Array`)
- Advanced CV (stratified K-fold, bootstrap, etc. — return `js_sys::Array`)

These can only be benchmarked via the TypeScript test suite.

## Benchmark Categories (110 benchmarks)

### 1. Classification (6)
KNN, Decision Tree, Naive Bayes, Logistic Regression, Perceptron, Linear SVM

### 2. Ensemble Methods (3)
Random Forest, Gradient Boosting, AdaBoost

### 3. Regression (10)
Linear, Ridge, Lasso, Polynomial, Exponential, Logarithmic, Power, Elastic Net, SVR, Quantile Regression

### 4. Clustering (4)
K-Means, K-Means++, DBSCAN, Hierarchical

### 5. Preprocessing (8)
Standard Scaler, MinMax Scaler, Robust Scaler, Normalizer, Label Encoder, One-Hot Encoder, Ordinal Encoder, Imputer

### 6. Dimensionality Reduction (1)
PCA

### 7. Time Series (12)
SMA, EMA, WMA, Exponential Smoothing, Moving Average, Trend Forecast, Rate of Change, Momentum, Peak Detection, Trough Detection, Autocorrelation, Seasonal Decompose

### 8. Metrics (10)
Confusion Matrix, Silhouette Score, Davies-Bouldin, Calinski-Harabasz, Matthews Corrcoef, Cohen's Kappa, Balanced Accuracy, MSE, RMSE, MAE

### 9. Neural Networks (2)
Forward pass, Training

### 10. AutoML (2)
AutoFit Classification, AutoFit Regression

### 11. Optimization Suite (3)
Genetic Algorithm, PSO, Simulated Annealing

### 12. Drift Detection (3)
Jaccard Window, Statistical Drift, Page-Hinkley

### 13. Anomaly Detection (2)
Statistical Outlier, Isolation Forest

### 14. Causal Inference (3)
Propensity Score Matching, Instrumental Variables, Difference-in-Differences

### 15. Data Augmentation (1)
Noise Injection (Gaussian/Uniform)

### 16. Persistence (1)
Data Hash

### 17. Probabilistic Methods (11)
MC Integration, MC Multidim Integration, MC Bootstrap, MC Pi Estimation, Markov Steady State, Markov N-Step, Markov Simulation, HMM Forward, HMM Viterbi, HMM Backward, HMM Baum-Welch, Metropolis-Hastings

### 18. Statistical Distributions (7)
Normal PDF, Normal CDF, Normal PPF, Gamma Function, Binomial CDF, Poisson PMF, Normal Sample

### 19. Statistical Inference (7)
t-Test One Sample, t-Test Two Sample, Mann-Whitney U, Wilcoxon Signed-Rank, Chi-Square Test, One-Way ANOVA, Descriptive Statistics

### 20. Kernel Methods (3)
RBF Kernel Matrix, Polynomial Kernel Matrix, Sigmoid Kernel Matrix

### 21. Bayesian Methods (2)
Bayesian Estimate, Bayesian Linear Regression

### 22. Gaussian Processes (2)
GP Fit, GP Predict

### 23. Survival Analysis (2)
Kaplan-Meier, Cox Proportional Hazards

### 24. Association Rules (1)
Apriori

### 25. Recommendation Systems (2)
Matrix Factorization, User-User Collaborative

### 26. Graph Algorithms (3)
PageRank, Shortest Path, Community Detection

## Performance Distribution

| Tier | Time | Count |
|------|------|-------|
| Fast (<1ms) | 56 | 51% |
| Moderate (1–100ms) | 44 | 40% |
| Slow (>100ms) | 10 | 9% |

## Implementation Notes

- Native benchmarks use `std::time::Instant` with nanosecond precision
- All data is synthetic (no external dependencies)
- Results include CV% for stability assessment
- Full results in `benchmarks/results.md`
