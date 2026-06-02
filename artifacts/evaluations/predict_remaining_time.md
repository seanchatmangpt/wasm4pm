# Algorithm Evaluation: predict_remaining_time

## Metadata
- **Algorithm ID:** `predict_remaining_time`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** `true`
- **Dispatch:** `true`
- **CLI:** `true`
- **WASM:** `true`

## Behavioral Evidence
- **Positive Cases:** 1 passed
- **Negative Cases:** 2 failed correctly (`PREDICTION_FEATURES_REQUIRED`, `EMPTY_EVENT_LOG`)
- **Invariant Cases:** 1 passed (Deterministic)

## Evidence Hash
`d7aa0ad0a897aaf43579c23402845c6e2225d2a0738f242c67dee9cc6aea1176`

## Verification State
**Closed**

## Summary
`predict_remaining_time` (Remaining Time Prediction) estimates the time remaining until a process instance reaches a terminal state. It utilizes statistical bucket models and Weibull distributions derived from historical trace durations. The algorithm provides both a point estimate (in milliseconds) and a confidence score, enabling better resource planning and SLA management.

## Implementation Validation & Details
- **Source Code Path:** `wasm4pm/src/prediction_remaining_time.rs`.
- **Core Logic:** The model builds statistical summaries grouped by `(last_activity, prefix_length)` buckets. For each bucket, it records the empirical distribution (mean and standard deviation) of the remaining time in milliseconds. Furthermore, it fits a Weibull survival model using method-of-moments to estimate the overall hazard rate of case completion. 
- **Dispatch Mechanism:** Model training is invoked via the `build_remaining_time_model` WASM export, and point estimates for a running case prefix are generated via the `predict_case_duration` export.
