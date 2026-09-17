<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-08-02/artifacts/evaluations/automl_classify.md; source-sha256: 5e808d04302f2d8832e4f6edccb5e7b3fd4e7bb7e9a7c8348590d4348052d25a; reason: tooling or agent control surface -->

# Algorithm Evaluation: automl_classify

## Metadata
- **Algorithm ID**: `automl_classify`
- **Category**: `discovery`
- **Supported Profiles**: `fast`, `balanced`, `quality`

## Status Proof
- **Registry**: ✅ Present
- **TypeScript Dispatch**: ✅ Present
- **CLI Surface**: ✅ Present
- **WASM Export**: ✅ Present

## Behavioral Evidence
- **Positive Cases**:
    - `automl_classify.valid_minimal_log`: **PASSED**
- **Negative Cases**:
    - `automl_classify.MalformedLogCase`: **FAILED_CORRECTLY** (Error: `MALFORMED_EVENT_LOG`)
    - `automl_classify.EmptyLogCase`: **FAILED_CORRECTLY** (Error: `EMPTY_EVENT_LOG`)
- **Invariant Cases**:
    - `automl_classify.DeterministicSameInputCase`: **PASSED** (Stable: true)

## Evidence Binding
- **Evidence Hash**: `514be20c0a5ce0f1310c403d801c697c6d320320ebd25bf5056da79ace058b11`
- **Verification State**: `Closed`

## Algorithmic Role
The `automl_classify` algorithm utilizes automated machine learning techniques to classify process instances or events. It automatically selects and trains the most suitable classification model based on the features extracted from the event log, enabling predictive process monitoring tasks such as identifying the likely outcome or category of a running process instance.

## Implementation Validation & Details
The `automl_classify` algorithm is implemented in Rust (`wasm4pm/src/ml/automl.rs`). It provides a nanosecond-scale automated hyperparameter tuning for k-NN Classification by:
- **Feature Extraction**: Extracting classification features and labels directly from the event log traces based on the provided `activity_key`.
- **Parameter Sweep**: Performing an optimized, single-pass 5-fold cross-validation sweep across the number of neighbors, $k \in [1, 15]$.
- **Cross-Validation Evaluation**: Utilizing an internal `knn_sweep_cv` function to evaluate multiple $K$ values simultaneously and efficiently.
- **Optimal Selection**: Selecting and returning the optimal $K$ (`best_k`) that yields the highest average cross-validated accuracy (`max_avg_accuracy`).
