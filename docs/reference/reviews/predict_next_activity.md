# Algorithm Review: predict_next_activity

## Algorithm ID & Domain
- **Registry ID**: `predict_next_activity`
- **Domain**: Predictive Process Monitoring

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `predictor_handle` and `prefix_json` (a JSON array of activity strings representing the running case prefix).
  - Returns a JSON string listing predictions and probabilities: `[{"activity": "Approve", "probability": 0.75}, ...]`.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::NGramPredictor`.
  - Clamps parameter `n` to at least 2 (`n.max(2)`) to ensure context length is valid.
  - Safely handles traces with fewer than 2 events by skipping them during model building: `if acts.len() < 2 { continue; }`.
  - Context windowing: extracts the correct prefix slice `acts[i + 1 - context_len..=i]` using saturating bounds.
- **Edge Cases & Errors**:
  - If the prefix is not in the model, it returns an empty array.
  - Handles parsing errors for the input prefix JSON string and propagates them as `JsValue`.

## Improvement Areas
- **Performance Optimization**:
  - Uses nested HashMaps (`HashMap<Vec<String>, HashMap<String, usize>>`). Each prefix vector lookup requires hashing a `Vec<String>`. String interning or using a trie structure would avoid hashing vector elements, saving CPU cycles.
  - Probability ranking sorts predictions: `result.sort_by(|a, b| b.1.partial_cmp(&a.1)...)`. We can use `sort_unstable_by` since stability of equal-probability predictions is not required.

## Code References
- **Rust Implementation**: `wasm4pm/src/prediction.rs` -> `predict_next_activity`, `build_ngram_predictor`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
