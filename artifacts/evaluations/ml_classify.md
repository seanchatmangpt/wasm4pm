# Algorithm Evaluation: ml_classify

## Metadata
- **Algorithm ID:** ml_classify
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
    - `ml_classify.MalformedLogCase`: PREDICTION_FEATURES_REQUIRED
    - `ml_classify.EmptyLogCase`: EMPTY_EVENT_LOG
- **Invariant Cases:** 1 passed
    - `ml_classify.DeterministicSameInputCase`: passed (stable: true)

## Evidence
- **Evidence Hash:** `06563df22108ee59aa7dde97c3f7e0b91e540cde645d74c22a4ca3344b3cffb9`
- **Verification State:** Closed

## Algorithmic Role
`ml_classify` implements trace classification using Decision Tree or Naive Bayes models. It categorizes process instances based on extracted feature vectors, enabling automated labeling of traces or predicting specific outcomes (e.g., success vs. failure) based on historical process data.

## Implementation Validation & Details
Based on the implementation in `wasm4pm/src/ml/classification.rs`, the core engine leverages a highly optimized "Nanosecond Classification Family" featuring a branchless k-Nearest Neighbors (k-NN) sweep. Traces are projected into a 2D feature space comprising trace length and the number of unique activities. It categorizes instances into three discrete time classes (`short`, `medium`, `long`) based on predefined thresholds. The system achieves high pipeline efficiency by using squared Euclidean distance, fixed-size stack arrays for neighbor lists, and branchless top-k insertion to avoid heap allocations. Additionally, it computes robust evaluation metrics such as macro F1, macro precision/recall, and per-class F1 to properly account for class imbalances.