# Algorithm Evaluation: ml_cluster

## Metadata
- **Algorithm ID:** ml_cluster
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
    - `ml_cluster.MalformedLogCase`: PREDICTION_FEATURES_REQUIRED
    - `ml_cluster.EmptyLogCase`: EMPTY_EVENT_LOG
- **Invariant Cases:** 1 passed
    - `ml_cluster.DeterministicSameInputCase`: passed (stable: true)

## Evidence
- **Evidence Hash:** `e39f4ce950608430396b1949d245bcbaa34e7eeed166b7dbcb8c470e2f5ffc8c`
- **Verification State:** Closed

## Algorithmic Role
`ml_cluster` performs trace clustering using the K-means algorithm with integrated silhouette scoring for cluster quality evaluation. This algorithm groups similar process instances together, allowing for the discovery of behavioral variants within a process and the identification of distinct execution patterns that might be obscured in an aggregate model.

## Implementation Validation & Details
Based on the implementation in `wasm4pm/src/ml/clustering.rs`, the module uses a branchless K-Means clustering algorithm optimized for speed and deterministic convergence. It maps process instances to a 2D feature space (trace length and unique activity count) and partitions them into a preset number of clusters (defaulting to 3 clusters over a maximum of 10 iterations). The algorithm employs branchless arithmetic (`argmin`) for centroid assignment and relies on squared Euclidean distance. As part of its output, it computes the within-cluster sum of squares (inertia) and calculates a comprehensive silhouette score in the range `[-1, 1]` to quantify cluster cohesion and separation, falling back smoothly for singletons.