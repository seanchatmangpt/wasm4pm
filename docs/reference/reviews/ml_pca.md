# Algorithm Review: ml_pca

## Algorithm ID & Domain
- **Algorithm ID**: `ml_pca`
- **Domain**: Machine Learning / Dimensionality Reduction (Principal Component Analysis on Event Logs)

## Correctness Audit
- **Early Exit Guards**:
  - `pca_internal` checks if data length `n < MIN_PCA_SAMPLES` (2) (lines 66-74) and returns early with zeroed values. This is correct as PCA requires at least two samples to compute covariance.
- **Division-by-Zero Protection**:
  - The sample covariance divisor is computed as `let divisor = (nf - 1.0).max(1.0);` (line 127). Since `n >= 2` due to the early exit, `nf - 1.0 >= 1.0`, ensuring no division-by-zero or negative divisors.
  - The eigenvalues are solved using a closed-form quadratic formula for 2x2 matrices. The discriminant is guarded using `.max(0.0)` (line 165) to prevent negative values (which would result in `NaN` during `sqrt()`) due to floating-point imprecision.
  - The explained variance ratio is guarded by `if total_var > 0.0` (lines 135-139). If total variance is zero (e.g., all features are constant), it returns a default fallback variance ratio of `[0.5, 0.5]`.
- **Special Cases / Edge Behaviors**:
  - The eigenvalues are returned sorted in descending order (`lambda1 >= lambda2`), which ensures that cumulative variance ratio is monotonically non-decreasing.

## Improvement Areas
- **Algorithmic Complexity**:
  - Closed-form eigenvalue decomposition for 2x2 matrices is $O(1)$ and avoids iterative solvers, which is highly optimal.
- **Memory Allocation**:
  - In `discover_ml_pca`, it allocates a new `std::collections::HashSet` for each trace in the event log (lines 38-44) to find the number of unique activities in that trace. Allocating and deallocating a hash set for every trace is a major performance bottleneck for large logs. Reusing a single `HashSet` and clearing it, or using a bitset / boolean array if activity IDs are compact integers, would yield a significant performance improvement.

## Code References
- **Rust Implementation**: `wasm4pm/src/ml/pca.rs` (method: `discover_ml_pca` / `pca_internal`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `ml_pca`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
