# Algorithm Evaluation: ml_anomaly

## Metadata
- **Algorithm ID:** ml_anomaly
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
    - `ml_anomaly.MalformedLogCase`: PREDICTION_FEATURES_REQUIRED
    - `ml_anomaly.EmptyLogCase`: EMPTY_EVENT_LOG
- **Invariant Cases:** 1 passed
    - `ml_anomaly.DeterministicSameInputCase`: passed (stable: true)

## Evidence
- **Evidence Hash:** `caf53ce506753dfc2bbafdcdc797038a4bbe64f994ec41ca71e9e8066c9f9b5b`
- **Verification State:** Closed

## Algorithmic Role
`ml_anomaly` provides micro-ML anomaly detection for process event logs. It utilizes Exponential Moving Average (EMA) based scoring to assign an anomaly score between 0 (normal) and 1 (anomaly) to traces. This is critical for identifying irregular process behavior, potential fraud, or operational outliers that deviate from the established process model.

## Implementation Validation & Details
Based on the implementation in `wasm4pm/src/anomaly.rs`, the algorithm evaluates traces against a reference Directly-Follows Graph (DFG). It computes a raw anomaly score for each trace as the mean of `-log2(edge_frequency / total_edges)` over every step, penalizing missing edges with a fixed cost of 10.0. Furthermore, it computes per-trace z-scores based on the log-level distribution of these raw scores, automatically flagging traces as outliers (`is_outlier`) if their z-score exceeds 2.0 (approximately the 95th percentile under normal approximation). This approach efficiently highlights structural anomalies in process execution without requiring a complex prior model.