# Algorithm Evaluation: ml_forecast

## Metadata
- **Algorithm ID:** ml_forecast
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
    - `ml_forecast.MalformedLogCase`: PREDICTION_FEATURES_REQUIRED
    - `ml_forecast.EmptyLogCase`: EMPTY_EVENT_LOG
- **Invariant Cases:** 1 passed
    - `ml_forecast.DeterministicSameInputCase`: passed (stable: true)

## Evidence
- **Evidence Hash:** `91b88231a63e00f87ccad399453706fe759d834defa0a65d166eb0c43a8bd112`
- **Verification State:** Closed

## Algorithmic Role
`ml_forecast` provides throughput forecasting using exponential or linear regression models. It predicts future process activity levels or event frequencies based on historical throughput data, supporting proactive resource allocation and operational planning by anticipating upcoming process loads.

## Implementation Validation & Details
Based on the implementation in `wasm4pm/src/ml/forecasting.rs`, the engine applies a fast Simple Exponential Smoothing algorithm for process throughput. Event timestamps are bucketed into a fixed set of time windows (defaulting to 10) to determine activity density. It applies an exponential smoothing factor (`alpha = 0.3`) across these intervals to recursively forecast the next window. The implementation captures several robust error metrics including Root Mean Square Error (RMSE), Mean Absolute Error (MAE), and Mean Absolute Percentage Error (MAPE), skipping zero actuals to prevent division errors. A normalized confidence score for the forecasted activity is dynamically derived from the RMSE relative to the mean log density.