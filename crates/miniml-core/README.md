<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: crates/miniml-core/README.md; source-sha256: 161ab6a800a0afec65af1ed87b7a7048d5d5a5de311af7446e7b410bd3432ded; reason: path-local authority or entrypoint -->

# wminml

Rust WASM core for [miniml](https://github.com/seanchatmangpt/miniml) — a minimal, blazing-fast machine learning library with SIMD acceleration.

## Features

- 70+ ML algorithms across 15 families
- WASM compilation via `wasm-bindgen`
- SIMD-accelerated matrix operations (v128 intrinsics)
- Zero-copy serialization with `serde`
- AutoML with genetic algorithm feature selection + PSO hyperparameter optimization

## Build

```bash
# Build as WASM (requires wasm-pack)
wasm-pack build --target web --out-dir ../../packages/miniml/wasm

# Build as native Rust library
cargo build --release

# Run benchmarks
cargo bench

# Run tests
cargo test
```

## Algorithm Families

| Family | Algorithms |
|--------|-----------|
| Classification | KNN, Decision Tree, Random Forest, Gradient Boosting, AdaBoost, Logistic Regression, Naive Bayes, Perceptron, Linear SVM |
| Regression | Linear, Polynomial, Exponential, Logarithmic, Power, Ridge, Lasso, Elastic Net, SVR, Quantile |
| Clustering | K-Means, K-Means++, DBSCAN, Hierarchical |
| Preprocessing | Standard Scaler, Min-Max Scaler, Robust Scaler, Normalizer, Label Encoder, One-Hot Encoder, Ordinal Encoder, Simple Imputer |
| Dimensionality Reduction | PCA |
| Time Series | SMA, EMA, WMA, Exponential Smoothing, Seasonal Decomposition, Trend Forecast |
| Metrics | Accuracy, Precision, Recall, F1, Confusion Matrix, MSE, MAE, R2, Silhouette Score |
| AutoML | Auto-fit Regression, Auto-fit Classification, Algorithm Recommendation |
| Optimization | Monte Carlo, Genetic Algorithm, PSO, Simulated Annealing |
| Statistical Inference | T-Tests, Chi-Square, ANOVA, KS-Test, Bootstrap, Bayesian Estimation |
| Survival Analysis | Kaplan-Meier, Cox Proportional Hazards |
| Graph Algorithms | PageRank, Shortest Path, Community Detection |
| Recommendation | Matrix Factorization, User-User Collaborative |
| Causal Inference | Propensity Score Matching, Difference-in-Differences, Instrumental Variables |
| Explainability | LIME, SHAP Values, Counterfactual Explanations |

## Anomaly, Drift & Neural — What Is Actually Implemented

The anomaly, drift, and neural modules are grounded, not stubs:

- **Isolation forest** (`optimization/anomaly.rs::isolation_forest_score`) —
  per Liu et al. 2008 ("Isolation Forest", ICDM): per-tree subsampling to
  `ψ = 256` points without replacement (partial Fisher–Yates, fixed seed),
  height limit `min(max_depth, ⌈log2 ψ⌉)`, terminal-node correction
  `h = depth + c(size)` with `c(n) = 2H(n−1) − 2(n−1)/n`, and the standard
  score `s = 2^(−E[h]/c(ψ))`. Deterministic (fixed RNG seed), constant columns
  and empty/single-point references degrade to a score of 0.
- **Page–Hinkley** (`optimization/drift.rs::page_hinkley_test`) — the canonical
  change-point test (Mouss et al.; Gama's `page_hinkley` form): running mean,
  cumulative deviation `PH_t = PH_{t−1} + (m_t − x_t − δ)`, alarm when
  `M_T − PH_t > λ`. `threshold` is λ; `alpha` is the δ magnitude allowance.
- **Neural networks** (`neural.rs`) — backpropagation through a
  Dense-only forward pass that keeps the output layer linear in the
  gradient pass, verified by a numerical gradient check (central differences,
  ε = 1e-6, max relative error < 1e-5 asserted in tests, including a
  two-hidden-layer tanh network).

## License

BSL-1.1 — free for non-commercial and educational use. Converts to AGPL-3.0 on 2028-04-08.
