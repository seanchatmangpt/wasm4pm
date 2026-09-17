<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/archive/2026-08-02/artifacts/evaluations/predict_outcome.md; source-sha256: f24f28f508f106b58437b89996d5ec5f018c695f140c87dfdc69ead7d8355384; reason: tooling or agent control surface -->

# Algorithm Evaluation: predict_outcome

## Metadata
- **Algorithm ID:** `predict_outcome`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** `true`
- **Dispatch:** `true`
- **CLI:** `true`
- **WASM:** `true`

## Behavioral Evidence
- **Positive Cases:** 1 passed
- **Negative Cases:** 2 failed correctly (`EMPTY_EVENT_LOG`, `PREDICTION_FEATURES_REQUIRED`)
- **Invariant Cases:** 1 passed (Deterministic)

## Evidence Hash
`3bbf084e985324816c09ecfad3b23663134d681b2979c586966e96da3eda38cc`

## Verification State
**Closed**

## Summary
`predict_outcome` (Outcome Prediction) is used to predict the eventual outcome of a process instance, such as whether it will result in a successful completion or an anomaly. It employs anomaly scoring against a DFG (Directly-Follows Graph) model and boundary coverage analysis. The algorithm provides early warnings of process deviations by comparing current prefix traces against known-good process patterns.

## Implementation Validation & Details
- **Source Code Path:** `wasm4pm/src/prediction_next_activity.rs` and `packages/kernel/src/api.ts`.
- **Core Logic:** While described as employing anomaly scoring against a DFG model, the underlying WASM implementation for `predict_outcome` (`predict_next_k`) is backed by an n-gram Markov transition model learned from completed traces. It performs a top-k prediction that answers what the most probable successor activities are, computing both probabilities and a normalized Shannon entropy/confidence score.
- **Dispatch Mechanism:** The `predict_outcome` dispatch in the TypeScript API layer correctly maps to the `predict_next_k` WebAssembly export, which uses a model built by `build_ngram_predictor()`.
