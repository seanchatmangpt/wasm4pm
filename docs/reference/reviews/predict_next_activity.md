<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/predict_next_activity.md; source-sha256: f5feb40a5c395d29b814498371ab1ab3a8a624c941a4dcb2a441b61bf1b7a778; reason: canonical Diátaxis or ADR surface -->

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

## Evaluation semantics (2026-10-10, commit `0e3d81b38`)

- Prediction results now include `entropy_full_support`: Shannon entropy
  normalised over the WHOLE model vocabulary (`ln(|vocab|)`), not the top-k
  slice. The legacy `entropy` field (top-k normalisation) is kept for one
  release cycle; prefer `entropy_full_support` — the legacy field conflates
  "model is uncertain" with "we asked for a small `k`".
- Beam-search path prediction applies real duplicate detection: identical
  paths reached via different search branches are deduplicated instead of
  double-counting probability mass.
