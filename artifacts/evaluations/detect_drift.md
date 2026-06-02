# Algorithm Evaluation: detect_drift

## Meta
- **ID**: `detect_drift`
- **Category**: `discovery`
- **Profiles**: `fast`, `balanced`, `quality`

## Status
- **Registry**: Present
- **Dispatch**: Present
- **CLI**: Present
- **WASM**: Present

## Behavior Evidence
- **Positive Case**: `passed`
- **Negative Cases**:
  - `MALFORMED_EVENT_LOG`: `failed_correctly`
  - `EMPTY_EVENT_LOG`: `failed_correctly`
- **Invariant Case**: `passed` (Stable: `true`)

## Evidence Hash
`60c2daffb43b97fb040c28c540a22abb1bba6944770bd3c4d7721dcbb8e94f14`

## Verification State
**Closed**

## Algorithmic Role
Detects concept drift in event logs by analyzing changes in process behavior over time, typically using Jaccard distance metrics across sliding windows to identify shifts in activity distributions or transitions.

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/prediction_drift.rs`
- **Algorithm Type**: Windowed Jaccard-distance drift detection.
- **Implementation Mechanism**: The algorithm iterates over sliding windows of traces, collecting the activity vocabulary (`HashSet<String>`) for each window. It calculates the Jaccard distance between consecutive windows: `J(A, B) = |A ∩ B| / |A ∪ B|`.
- **Thresholding**: It uses a constant `DEFAULT_DRIFT_THRESHOLD = 0.3`. If the Jaccard distance exceeds this, a concept drift is flagged.
- **Additional Insights**: The algorithm classifies the drift by identifying specific activities that "appeared" or "disappeared". It also exports an Exponentially Weighted Moving Average (`compute_ewma`) implementation used for numeric series smoothing and trend classification (`rising`, `falling`, `stable`).
