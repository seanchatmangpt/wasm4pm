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

## License

BSL-1.1 — free for non-commercial and educational use. Converts to AGPL-3.0 on 2028-04-08.
