<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/predict_outcome.md; source-sha256: 2e1412255ff266604e24b470d2f987c58086bb328c078a0094f5aad03ee5d4c1; reason: canonical Diátaxis or ADR surface -->

# Algorithm Review: predict_outcome

## Algorithm ID & Domain
- **Registry ID**: `predict_outcome`
- **Domain**: Predictive Process Monitoring

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `model_handle` (NGramPredictor handle), `prefix_json` (running case history), and `k` (candidates count).
  - Returns a JSON string of a dictionary containing: `activities` (list of strings), `probabilities` (list of floats), `confidence` (float), and `entropy` (float).
- **Boundary Checks**:
  - Verifies the handle points to a valid `StoredObject::NGramPredictor`.
  - Normalizes entropy: computes Shannon entropy and divides by log of number of elements (`max_ent = (probs.len() as f64).ln()`). Checks if `max_ent > 0.0` to avoid division-by-zero.
  - Safely extracts the confidence score from `probabilities.first().copied().unwrap_or(0.0)`.
- **Edge Cases & Errors**:
  - Returns empty list if no predictions are available for the given prefix.
  - Limits output to the top `k` candidates.

## Improvement Areas
- **Performance Optimization**:
  - Hashing and vector construction: `predict` clones the prefix keys. Using a string pool or a trie structure would avoid hashing vectors and speed up lookup.
  - Returns Shannon entropy calculated on the fly. We could pre-compute or cache entropy values for hot prefixes in the model.

## Code References
- **Rust Implementation**: `wasm4pm/src/prediction_next_activity.rs` -> `predict_next_k`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`

## Evaluation semantics (2026-10-10, commit `0e3d81b38`)

- `predict_outcome_evaluated_wasm(eventlog_handle, activity_key, prefix_json, evaluate)`
  wraps `predict_outcome_from_log`; with `evaluate: true` it appends an
  `evaluation` object (held-out classification metrics) and an
  `insufficient_data` flag to the prediction result.
- `evaluate_outcome_holdout` scores on a held-out prefix split
  (`DEFAULT_TRAIN_RATIO = 0.8`); below `MIN_EVAL_SAMPLES = 10` scoring samples
  it returns `evaluation: null` with `insufficient_data: true` — the metrics
  are refused, never fabricated.
- The legacy `predict_outcome_wasm` export is byte-compatible; evaluation is
  additive only.
