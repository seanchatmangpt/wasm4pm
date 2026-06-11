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
