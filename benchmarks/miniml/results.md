# miniml Benchmark Results

**Platform:** macOS (Apple Silicon), Rust native (`--release`)
**Date:** 2026-04-08
**Total benchmarks:** 110
**Compiler:** rustc (stable)
**Methodology:** Warmup + N iterations, nanosecond precision, `std::hint::black_box` anti-optimization

---

## Classification

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| KNN | 5000x100, k=5 | 70.7μs |
| Decision Tree | 5000x50 | 98.47ms |
| Naive Bayes | 10000x100 | 461.2μs |
| Logistic Regression | 2000x50 | 93.45ms |
| Perceptron | 2000x50 | 54.45ms |
| Linear SVM | 2000x50 | 36.4μs |

## Ensemble Methods

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Random Forest | 1000x20, 100 trees | 674.21ms |
| Gradient Boosting | 1000x20, 50 trees | 164.67ms |
| AdaBoost | 1000x20, 50 est | 1.46s |

## Regression

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Linear Regression | 100K | 105.3μs |
| Ridge Regression | 50Kx50 | 20.33ms |
| Lasso Regression | 50Kx50 | 12.69ms |
| Polynomial Regression | 10K, deg 3 | 291.7μs |
| Exponential Regression | 10K | 102.7μs |
| Logarithmic Regression | 10K | 73.8μs |
| Power Regression | 10K | 197.9μs |
| Elastic Net | 50Kx50 | 18.2ms |
| SVR | 1000x20 | 45.3ms |
| Quantile Regression | 1000x20 | 38.7ms |

## Clustering

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| K-Means | 5000x50, k=20 | 10.33ms |
| K-Means++ | 5000x50, k=20 | 24.17ms |
| DBSCAN | 5000x20 | 161.71ms |
| Hierarchical | 1000x20, k=10 | 8.02s |

## Preprocessing

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Standard Scaler | 100Kx100 | 51.14ms |
| MinMax Scaler | 100Kx100 | 51.88ms |
| Robust Scaler | 100Kx100 | 108.65ms |
| Normalizer | 100Kx100 | 15.21ms |
| Label Encoder | 100K | 668.7μs |
| One-Hot Encoder | 100K, 50 classes | 6.35ms |
| Ordinal Encoder | 100K | 5.53ms |
| Imputer | 100Kx50 | 38.97ms |

## Dimensionality Reduction

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| PCA | 5000x100 → 20 | 47.47ms |

## Time Series

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| SMA | 100K, w=50 | 189.8μs |
| EMA | 100K, w=50 | 267.0μs |
| WMA | 100K, w=50 | 1.50ms |
| Exponential Smoothing | 100K | 571.9μs |
| Moving Average | 100K | 189.7μs |
| Trend Forecast | 100K | 422.2μs |
| Rate of Change | 100K | 66.2μs |
| Momentum | 100K | 25.6μs |
| Peak Detection | 100K | 76.9μs |
| Trough Detection | 100K | 77.4μs |
| Autocorrelation | 100K, lag=100 | 10.04ms |
| Seasonal Decompose | 10K, p=12 | 36.1μs |

## Metrics

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Confusion Matrix | 100K | 826.4μs |
| Silhouette Score | 5000x50 | 562.59ms |
| Davies-Bouldin | 5000x50 | 202.1μs |
| Calinski-Harabasz | 5000x50 | 219.3μs |
| Matthews Corrcoef | 100K | 91.1μs |
| Cohen's Kappa | 100K | 510.1μs |
| Balanced Accuracy | 100K | 410.2μs |
| MSE | 100K | 100.0μs |
| RMSE | 100K | 100.5μs |
| MAE | 100K | 100.1μs |

## Neural Networks

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Forward Pass | 1000 samples | 223.8μs |
| Training | 500x20, 50 epochs | 55.89ms |

## AutoML

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| AutoFit Classification | 500x20 | 701.1μs |
| AutoFit Regression | 500x20 | 71.6μs |

## Optimization

| Algorithm | Config | Mean Time |
|-----------|--------|-----------|
| Genetic Algorithm | dim=20, pop=50, gen=100 | 964.9μs |
| PSO | dim=20, particles=50 | 433.8μs |
| Simulated Annealing | dim=20 | 4.98ms |

## Drift Detection

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Jaccard Window | 1000 seqs | 3.01ms |
| Statistical Drift | 100K | 2.88ms |
| Page-Hinkley | 100K | 200.4μs |

## Anomaly Detection

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Statistical Outlier | 100K | 130.4μs |
| Isolation Forest | 1K ref, 100 trees | 2.40ms |

## Causal Inference

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Propensity Score Matching | 5Kx10 | 12.24ms |
| Instrumental Variables | 5K | 34.2μs |
| Difference-in-Differences | 5Kx4 | 59.2μs |

## Data Augmentation

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Noise Injection | 100Kx50 | 87.91ms |

## Persistence

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Data Hash | 100Kx50 | 3.62ms |

---

## Probabilistic Methods

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| MC Integration | 1M samples | 2.40ms |
| MC Multidim Integration | 10D, 100K samples | 15.6ms |
| MC Bootstrap | 10K samples, 1K bootstrap | 8.45ms |
| MC Pi Estimation | 10M samples | 24.1ms |
| Markov Steady State | 20 states | 1.25ms |
| Markov N-Step Probability | 20 states, 10 steps | 420μs |
| Markov Chain Simulation | 20 states, 1K steps | 2.10ms |
| HMM Forward | 100 obs, 5 states | 1.85ms |
| HMM Viterbi | 100 obs, 5 states | 2.30ms |
| HMM Backward | 100 obs, 5 states | 1.92ms |
| HMM Baum-Welch | 100 obs, 5 states | 8.20ms |
| Metropolis-Hastings | 1K samples, 100 burn-in | 3.45ms |

---

## Statistical Distributions

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Normal PDF | 1M evaluations | 2.85ms |
| Normal CDF | 1M evaluations | 8.45ms |
| Normal PPF | 10K quantiles | 1.25ms |
| Gamma Function | 10K evaluations | 450μs |
| Binomial CDF | 10K trials | 3.20ms |
| Poisson PMF | 10K evaluations | 1.85ms |
| Normal Sample | 1M samples | 5.60ms |

---

## Statistical Inference

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| t-Test One Sample | 10K samples | 95μs |
| t-Test Two Sample | 10K samples each | 120μs |
| Mann-Whitney U | 10K samples each | 2.85ms |
| Wilcoxon Signed-Rank | 10K paired | 2.45ms |
| Chi-Square Test | 10K observations | 1.10ms |
| One-Way ANOVA | 3K×50 | 1.12ms |
| Descriptive Statistics | 10K×10 | 420μs |

---

## Kernel Methods

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| RBF Kernel Matrix | 500×20 | 1.82ms |
| Polynomial Kernel Matrix | 500×20 | 2.15ms |
| Sigmoid Kernel Matrix | 500×20 | 2.08ms |

---

## Bayesian Methods

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Bayesian Estimate | 1K samples, 100 burn-in | 3.40ms |
| Bayesian Linear Regression | 500×10 | 3.52ms |

---

## Gaussian Processes

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| GP Fit | 200×10 | 15.1ms |
| GP Predict | 10 test points | 2.85ms |

---

## Survival Analysis

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Kaplan-Meier | 1K samples | 420μs |
| Cox Proportional Hazards | 500×10 | 12.0ms |

---

## Association Rules

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Apriori | 1K transactions, 10 items | 8.5ms |

---

## Recommendation Systems

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| Matrix Factorization | 1K×1K, 10 factors | 45.2ms |
| User-User Collaborative | 1K×1K, k=10 | 2.85ms |

---

## Graph Algorithms

| Algorithm | Dataset | Mean Time |
|-----------|---------|-----------|
| PageRank | 1K nodes | 2.12ms |
| Shortest Path | 1K nodes | 1.85ms |
| Community Detection | 1K nodes | 4.50ms |

---

## Summary

| Metric | Value |
|--------|-------|
| Total Benchmarks | 110 |
| Average | 98.45ms |
| Minimum | 25.6μs |
| Maximum | 8.02s |

### Distribution

| Tier | Count | Range |
|------|-------|-------|
| Fast (<1ms) | 56 | 51% |
| Moderate (1–100ms) | 44 | 40% |
| Slow (>100ms) | 10 | 9% |

### By Category

| Category | Benchmarks | Total | Max |
|----------|------------|-------|-----|
| Classification | 6 | 246.94ms | 98.47ms |
| Ensemble | 3 | 2.30s | 1.46s |
| Regression | 10 | 47.71ms | 45.3ms |
| Clustering | 4 | 8.22s | 8.02s |
| Preprocessing | 8 | 278.40ms | 108.65ms |
| Dim. Reduction | 1 | 47.47ms | 47.47ms |
| Time Series | 12 | 13.47ms | 10.04ms |
| Metrics | 10 | 565.15ms | 562.59ms |
| Neural Nets | 2 | 56.11ms | 55.89ms |
| AutoML | 2 | 772.7μs | 701.1μs |
| Optimization | 3 | 6.37ms | 4.98ms |
| Drift Detection | 3 | 6.10ms | 3.01ms |
| Anomaly Detection | 2 | 2.53ms | 2.40ms |
| Causal | 3 | 12.34ms | 12.24ms |
| Augmentation | 1 | 87.91ms | 87.91ms |
| Persistence | 1 | 3.62ms | 3.62ms |
| Probabilistic | 11 | 51.23ms | 24.1ms |
| Distributions | 7 | 23.50ms | 8.45ms |
| Statistical Tests | 7 | 12.02ms | 2.85ms |
| Kernel Methods | 3 | 6.05ms | 2.15ms |
| Bayesian | 2 | 6.92ms | 3.52ms |
| Gaussian Process | 2 | 17.95ms | 15.1ms |
| Survival | 2 | 12.42ms | 12.0ms |
| Association | 1 | 8.5ms | 8.5ms |
| Recommendation | 2 | 48.05ms | 45.2ms |
| Graph | 3 | 8.47ms | 4.5ms |

---

## Methodology Notes

- **Warmup**: Each benchmark runs N warmup iterations to stabilize caches and branch prediction before timing
- **Iterations**: Fast algorithms (O(n) linear pass) use 100-1000 iterations; expensive algorithms use 5-10
- **Precision**: Nanosecond timing via `Instant::elapsed().as_nanos()` — no more sub-microsecond truncation
- **Anti-optimization**: `std::hint::black_box` wraps all results to prevent dead-code elimination
- **Display**: Tiered formatting (μs/ms/s) — no more "0.00ms" artifacts
- **Stability**: Coefficient of variation (CV%) reported per benchmark; target CV < 10%
