# Algorithm Evaluation: predict_next_activity

## Metadata
- **Algorithm ID:** `predict_next_activity`
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
`76ffeb8dc2e43c338c16e28977cd0f4588417668b9b6a94ad8c4c42165edbcf5`

## Verification State
**Closed**

## Summary
`predict_next_activity` (Next Activity Prediction) is an analytical algorithm used to predict the most likely next activity in a process instance. It typically utilizes n-gram (Markov chain) models built from historical event logs to calculate transition probabilities. This implementation is verified to handle real-time prediction requests via CLI and WASM boundaries, with correct refusal behavior when mandatory prediction features or event data are missing.

## Implementation Validation & Details
- **Source Code Path:** `wasm4pm/src/prediction.rs` and `wasm4pm/src/prediction_rf.rs`.
- **Core Logic:** The core implementation provides two distinct predictors. The baseline uses an n-gram Markov chain model (defaulting to a bigram) to calculate the most likely successor activities based on the observed prefix. An advanced variant uses a Random Forest (RF) model spanning 7 structural prefix features (such as `prefix_len / max_trace_len`, `elapsed_ms`, and `rework_count`) to capture non-linear dependencies and handle sparse activity vocabularies where the n-gram approach may be unreliable.
- **Dispatch Mechanism:** A unified dispatch function (`predict_next_activity_unified`) automatically routes the prediction request to either the n-gram or the RF predictor depending on the provided model handle type.
