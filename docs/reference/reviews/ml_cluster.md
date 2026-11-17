<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/ml_cluster.md; source-sha256: 5f5dae5aee5e82cd79745ad1c9158ca1b893f13301620705e2ec856e0f0883f6; reason: canonical Diátaxis or ADR surface -->

# Algorithm Review: ml_cluster

## Algorithm ID & Domain
- **Registry ID**: `ml_cluster`
- **Domain**: Machine Learning (Clustering)

## Correctness Audit
- **Input/Output Contracts**: 
  - Accepts `eventlog_handle` and `activity_key`.
  - Returns K-Means metrics (number of clusters, centroids, assignments, inertia, silhouette, iterations).
- **Boundary Checks**:
  - Early-returns a default JSON structure with zeroed values if the log is empty, avoiding panics.
  - Clamps `k = k_request.min(n).max(1)` to ensure `k` never exceeds the number of samples or falls below 1, preventing out-of-bounds array access.
- **K-Means Core**:
  - Uses branchless logic for centroid assignment to optimize execution speed.
  - Includes a critical bug fix where centroids are properly updated after accumulating trace feature sums.
  - Handles empty clusters safely, keeping their prior centroids to avoid collapse to the origin.

## Improvement Areas
- **Performance Optimization**:
  - **Silhouette Score Bottleneck**: The silhouette score is computed after clustering convergence. Silhouette computation requires pairwise distances between all points, making it `O(N^2)` in complexity. For logs with tens of thousands of traces, this will cause high CPU latency or timeout in WASM.
  - Recommendation: Make the silhouette metric optional via a parameter flag (e.g. `compute_silhouette: false`).
- **Feature Refinement**:
  - Allow users to configure the maximum iterations (`MAX_ITERATIONS` is currently hardcoded to 10).

## Code References
- **Rust Implementation**: `wasm4pm/src/ml/clustering.rs` -> `discover_ml_cluster`, `kmeans_internal`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`

## Convergence reporting and input screening (2026-10-10, commit `0e3d81b38`)

- `KmeansResult` now carries `converged: bool`. When the iteration cap
  (`MAX_ITERATIONS`) is reached without a fixed point, the result is an
  unconverged snapshot, not a fixed point — consumers must check `converged`
  before treating centroids as stable.
- NaN/Inf features are refused with a typed error naming the flat element
  index instead of producing NaN distances silently.
