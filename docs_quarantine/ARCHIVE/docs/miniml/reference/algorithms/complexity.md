# Algorithm Complexity

Time and space complexity for all miniml algorithms. Big-O notation, where n = number of samples, d = number of features, k = number of classes/clusters/neighbors, and T = number of iterations.

## Classification

| Algorithm | Time (Train) | Time (Predict) | Space |
|-----------|-------------|----------------|-------|
| KNN | O(1) | O(n * d) | O(n * d) |
| Decision Tree | O(n * d * log n) | O(d) | O(n) |
| Random Forest | O(T * n * d * log n) | O(T * d * log n) | O(T * n) |
| Logistic Regression | O(n * d * T) | O(d) | O(d) |
| Naive Bayes | O(n * d * k) | O(d * k) | O(d * k) |
| SVM | O(n^2 * d * T) | O(n_sv * d) | O(n_sv * d) |
| Perceptron | O(n * d * T) | O(d) | O(d) |
| Gradient Boosting | O(T * n * d) | O(T * d) | O(T) |
| AdaBoost | O(T * n * d) | O(T * d) | O(T) |
| Neural Network | O(T * n * d * h) | O(d * h) | O(d * h + h) |
| Stacking | O(sum of base models) | O(sum of base models) | O(sum of base models) |

## Regression

| Algorithm | Time (Train) | Time (Predict) | Space |
|-----------|-------------|----------------|-------|
| Linear Regression | O(n * d^2 + d^3) | O(d) | O(d^2) |
| Ridge Regression | O(n * d^2 + d^3) | O(d) | O(d^2) |
| Polynomial Regression | O(n * p^2 + p^3) | O(p) | O(p^2) where p = degree^d |
| Elastic Net | O(n * d * T) | O(d) | O(d) |
| SVR | O(n^2 * d * T) | O(n_sv * d) | O(n_sv * d) |
| Quantile Regression | O(n * d * T) | O(d) | O(d) |
| Bayesian Linear | O(n * d^2 + d^3) | O(d) | O(d^2) |
| Gaussian Process | O(n^3) | O(n^2) | O(n^2) |

## Clustering

| Algorithm | Time | Space |
|-----------|------|-------|
| K-Means | O(n * k * d * T) | O(n * d + k * d) |
| K-Means++ | O(n * k * d * T) | O(n * d + k * d) |
| DBSCAN | O(n * log n) to O(n^2) | O(n * d) |
| Hierarchical | O(n^2 * d) to O(n^2 * log n) | O(n^2) |

## Preprocessing

| Algorithm | Time | Space |
|-----------|------|-------|
| Standard Scaler | O(n * d) | O(d) |
| Min-Max Scaler | O(n * d) | O(2 * d) |
| Robust Scaler | O(n * d) | O(2 * d) |
| Normalizer | O(n * d) | O(1) |
| Label Encoder | O(n) | O(k) |
| One-Hot Encoder | O(n * k) | O(k) |
| PCA | O(n * d^2 + d^3) | O(d^2) |
| Imputer | O(n * d) | O(d) |

## Statistical Tests

| Algorithm | Time | Space |
|-----------|------|-------|
| T-Test (any variant) | O(n) | O(n) |
| Mann-Whitney U | O(n log n) | O(n) |
| Wilcoxon Signed-Rank | O(n log n) | O(n) |
| Chi-Square Test | O(n) | O(n) |
| One-Way ANOVA | O(n) | O(n) |
| KS Test | O(n log n) | O(n) |
| Bootstrap | O(n * B) | O(B) where B = nBootstrap |
| Descriptive Stats | O(n log n) | O(n) |

## Probabilistic

| Algorithm | Time | Space |
|-----------|------|-------|
| Monte Carlo Pi | O(n) | O(1) |
| MC Integration | O(n) | O(1) |
| Markov Steady State | O(n_states^2 * T) | O(n_states^2) |
| Markov N-Step | O(n_states^3 * log n_steps) | O(n_states^2) |
| Markov Simulate | O(n_steps * n_states) | O(n_steps) |
| HMM Forward | O(T * n_states^2) | O(T * n_states) |
| HMM Viterbi | O(T * n_states^2) | O(T * n_states) |
| HMM Baum-Welch | O(T * n_states^2 * T_iter) | O(T * n_states^2) |
| Metropolis-Hastings | O(n_samples + burn_in) | O(n_samples) |

## Survival Analysis

| Algorithm | Time | Space |
|-----------|------|-------|
| Kaplan-Meier | O(n log n) | O(n) |
| Cox PH | O(n * d * T_iter) | O(n * d) |

## Graph Algorithms

| Algorithm | Time | Space |
|-----------|------|-------|
| PageRank | O(n_nodes^2 * T) | O(n_nodes^2) |
| Dijkstra | O(n_nodes^2) | O(n_nodes) |
| Community Detection | O(n_nodes^2 * T) | O(n_nodes) |

## Kernels

| Algorithm | Time (Pairwise) | Time (Matrix) | Space |
|-----------|----------------|---------------|-------|
| RBF | O(d) | O(n^2 * d) | O(n^2) |
| Polynomial | O(d) | O(n^2 * d) | O(n^2) |
| Sigmoid | O(d) | O(n^2 * d) | O(n^2) |

## Optimization

| Algorithm | Time | Space |
|-----------|------|-------|
| Genetic Algorithm | O(pop * gens * n * d) | O(pop * n * d) |
| PSO | O(particles * gens * d) | O(particles * d) |
| Simulated Annealing | O(T * n * d) | O(n * d) |
| AutoML | O(algorithms * CV * model_time) | Varies |
