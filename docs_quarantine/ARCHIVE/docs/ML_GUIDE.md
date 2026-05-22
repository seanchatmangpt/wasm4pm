# Nanosecond ML: High-Performance Analytics Kernels

This guide documents the "Nanosecond ML" breakthrough in `wasm4pm`, where traditional machine learning families are implemented as zero-allocation, hot-path optimized (conditional moves, loop unrolling, popcount-based similarity), and cache-efficient kernels designed for sub-microsecond execution in resource-constrained environments.

## 1. Architectural Principles

The transition from "hardcoded stubs" to "mathematically grounded nanosecond kernels" is driven by four key principles:

1.  **Zero-Allocation Paths**: Hot loops utilize `Float64Array` (TypeScript) or stack-allocated arrays (Rust) to eliminate GC pressure and heap fragmentation.
2.  **Columnar Layout**: Data is stored in columnar format to ensure cache-friendly access patterns during covariance and distance computations.
3.  **Hot-Path Optimizations**: Mathematical simplifications (e.g., squared distance, single-pass variance) reduce branching on the critical path; inner loops use conditional moves, loop unrolling, and popcount-based similarity to minimize CPU pipeline stalls.
4.  **Analytical Solvers**: Replacing iterative optimization with closed-form solutions (e.g., Least Squares for linear regression, Jacobi rotations for 2x2 subproblems).

---

## 2. ML Algorithm Families

### A. Regression (Remaining Time Prediction)
Predicts numeric values (e.g., remaining cycle time) based on event log features.

*   **Linear Regression**: Implemented via **Least Squares Reduction**. Instead of iterative gradient descent, we compute the closed-form solution:
    $$ \beta = (X^T X)^{-1} X^T y $$
    In the 1D case, this is reduced to a single-pass calculation of sums ($\sum x, \sum y, \sum xy, \sum x^2$), achieving $O(n)$ complexity with zero intermediate allocations.
*   **Polynomial Regression**: Uses a **Vandermonde Matrix** approach with **Gauss-Jordan elimination** for the augmented matrix, optimized for small degrees.
*   **Exponential Regression**: Linearized via log-transformation: $\ln(y) = \ln(a) + bx$, allowing the same nanosecond Least Squares kernel to be used.

### B. Forecasting (Throughput & Seasonality)
Analyzes time-series data from event logs to predict future activity volumes.

*   **Single-Pass Mean/Variance**: Computes statistical moments in a single traversal of the event stream.
*   **Autocorrelation (ACF)**: Detects seasonality using a pre-computed centered series and inverse-denominator optimization.
*   **Seasonal Decomposition**: Uses a moving-average trend extraction followed by single-pass per-cycle accumulation to isolate seasonal and residual components.

### C. Classification (Trace Outcome Prediction)
Categorizes traces into discrete classes (e.g., "SLA Violated" vs. "SLA Met").

*   **k-Nearest Neighbors (k-NN)**: Optimized using **Squared Euclidean Distance** to avoid costly `sqrt()` calls in the search loop. Uses a pre-allocated sort buffer for finding top-k neighbors.
*   **Naive Bayes (Gaussian)**: Implements numerically stable **Log-Sum-Exp** for the softmax calculation, preventing underflow while maintaining $O(1)$ prediction latency per feature.
*   **Logistic Regression**: Uses vectorized gradient updates with multinomial cross-entropy, optimized for joint weight updates.
*   **Decision Tree (CART)**: Employs a **pre-allocated split buffer** and sampling-based threshold selection to keep training time deterministic.

### D. PCA (Feature Reduction)
Reduces high-dimensional event log data into principal components for visualization or noise reduction.

*   **Symmetric Covariance Matrix**: Computed directly from columnar data without explicit transpose operations.
*   **2x2 Eigen-solver (Jacobi Method)**: The core of the eigendecomposition is the **Jacobi rotation**, which solves a 2x2 subproblem analytically at each step:
    $$ \theta = \frac{1}{2} \operatorname{atan2}(2a_{pq}, a_{pp} - a_{qq}) $$
    This iterative rotation converges with quadratic speed to the full eigendecomposition, using in-place updates to avoid matrix copies.

---

## 3. Autonomic Parameter Selection (AutoML)

To eliminate manual tuning, the `wasm4pm` framework provides **Nanosecond AutoML**. This system leverages the extreme speed of the base kernels to perform exhaustive searches across hyperparameter spaces:

*   **5-Fold Cross-Validation**: Data is partitioned and validated in parallel.
*   **Exhaustive Sweeps**:
    *   **Forecasting**: Sweeps $\alpha$ from 0.05 to 0.95 in 0.05 increments.
    *   **Classification**: Sweeps $K$ from 1 to 15.
*   **Latency Impact**: Even with a 20-step sweep and 5-fold CV (100 total kernel executions), the total latency remains in the low microsecond range, making "Self-Tuning ML" a reality for real-time process mining.
