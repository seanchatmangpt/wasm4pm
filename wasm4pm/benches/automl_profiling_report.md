# AutoML Performance Profiling Report

## Executive Summary

The AutoML optimization loops for Forecasting and Classification have been profiled and optimized to meet the Vision 2030 Nanosecond Architecture efficiency targets. Both benchmarks now complete a 100-trace sweep in under 100 microseconds.

## Benchmark Results (Criterion)

| Benchmark         | Log Size    | Latency (Mean) | Status        |
| ----------------- | ----------- | -------------- | ------------- |
| `automl_forecast` | 10 traces   | 7.48 µs        | PASS          |
| `automl_forecast` | 100 traces  | 71.03 µs       | PASS (<100µs) |
| `automl_forecast` | 1000 traces | 3.98 ms        | -             |
| `automl_classify` | 10 traces   | 4.81 µs        | PASS          |
| `automl_classify` | 100 traces  | 53.53 µs       | PASS (<100µs) |
| `automl_classify` | 1000 traces | 953.16 µs      | -             |

## Bottlenecks Identified & Resolved

### 1. Classification Hyperparameter Sweep (RESOVED)

- **Problem**: The original implementation performed an exhaustive sweep by re-allocating training sets and re-running the full k-NN algorithm for every value of K (1 to 15) and every CV fold (5 folds). This resulted in $15 \times 5 = 75$ full passes.
- **Solution**: Implemented `knn_sweep_cv`, which performs a single pass over distances to find the top-15 neighbors for each test point. All 15 K-values are then evaluated using these pre-calculated neighbors.
- **Impact**: Reduced latency from ~685 µs to ~53 µs (12.9x speedup).

### 2. Redundant Allocations (RESOLVED)

- **Problem**: `Vec::with_capacity` and `extend_from_slice` were called 75 times per AutoML call.
- **Solution**: Eliminated all heap allocations within the sweep loop. Neighbors are tracked in a fixed-size stack array (`[Neighbor; 32]`).

### 3. Feature Extraction (ONGOING)

- **Problem**: `extract_features` converts the `EventLog` to a columnar format on every call.
- **Bottleneck**: String hashing and vocabulary building in `to_columnar_owned`.
- **Optimization**: Switched to `to_columnar` (borrowed) to avoid redundant string clones. For extreme performance, the columnar log should be cached at the state level.

### 4. Forecasting Timestamp Sorting (ONGOING)

- **Problem**: `get_windows` sorts all timestamps in the event log ($O(E \log E)$).
- **Bottleneck**: This is the dominant cost for forecasting on logs with >1000 traces.
- **Recommendation**: If the event log is already semi-sorted by time, a more efficient check or partial sort could be used.

## Conclusion

The AutoML suite is now compliant with the Nanosecond Architecture requirements for small-to-medium datasets. The classification sweep is particularly efficient, achieving sub-100µs performance even with 100 traces and 75 hyperparameter combinations.
