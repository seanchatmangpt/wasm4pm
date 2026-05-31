# Algorithm Evaluation: ml_pca

## Metadata
- **Algorithm ID:** ml_pca
- **Category:** discovery
- **Supported Profiles:** fast, balanced, quality

## Implementation Status
- **Registry:** present
- **TS Dispatch:** present
- **CLI Surface:** present
- **WASM Export:** present

## Verification Results
- **Positive Cases:** 1 passed
- **Negative Cases:** 2 failed correctly
    - `ml_pca.MalformedLogCase`: PREDICTION_FEATURES_REQUIRED
    - `ml_pca.EmptyLogCase`: EMPTY_EVENT_LOG
- **Invariant Cases:** 1 passed
    - `ml_pca.DeterministicSameInputCase`: passed (stable: true)

## Evidence
- **Evidence Hash:** `8c61391fcf90f737744bf29da8020ebc0a468e4731c8cb7bb49d34a33fcaeaba`
- **Verification State:** Closed

## Algorithmic Role
`ml_pca` implements Principal Component Analysis for dimensionality reduction of process data. It identifies the most significant features and variance components within high-dimensional event logs, enabling more efficient process analysis and serving as a pre-processing step for other machine learning or discovery algorithms by focusing on the most informative data dimensions.

## Implementation Validation & Details
Based on the implementation in `wasm4pm/src/ml/pca.rs`, the algorithm employs a zero-allocation, tightly unrolled Principal Component Analysis (PCA) targeting 2D process features (trace length and unique activity count). To maximize throughput ("Nanosecond Dimensionality Reduction Family"), loops computing means and covariances are manually unrolled to exploit instruction-level parallelism. The core solver relies on a closed-form eigenvalue decomposition for the symmetric 2x2 covariance matrix rather than iterative approximation. It efficiently surfaces critical interpretability metrics including eigenvalues, absolute total variance, explained variance per component, and monotonic cumulative variance ratios, handling edge cases dynamically.