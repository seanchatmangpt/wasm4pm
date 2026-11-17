<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: docs/reference/reviews/detect_drift.md; source-sha256: 1dfcd7685e08606be18bba2b292893897ef5efd1bb70e2a36466e4dadb396dda; reason: canonical Diátaxis or ADR surface -->

# Algorithm Review: detect_drift

## Algorithm ID & Domain
- **Registry ID**: `detect_drift`
- **Domain**: Process Health Monitoring

## Correctness Audit
- **Input/Output Contracts**:
  - Accepts `log_handle`, `activity_key`, and `window_size`.
  - Returns a JSON string with `drifts_detected`, `drifts` list, `window_size`, `method`, and `threshold`.
- **Boundary Checks**:
  - Validates that the handle points to a valid `StoredObject::EventLog`.
  - Enforces minimum window size of 1 via `window_size.max(1)`.
  - Jaccard distance calculation handles the empty union boundary case safely: `if union == 0 { return 0.0; }` preventing division by zero.
  - Sorts appeared and disappeared activities (`appeared.sort_unstable()`, `disappeared.sort_unstable()`) to ensure deterministic output representations.
- **Edge Cases & Errors**:
  - If the log length is less than `window_size`, the windows loop does not execute, returning 0 drifts safely.
  - Safely handles missing activity keys within events by skipping them.

## Improvement Areas
- **Performance Optimization**:
  - Double loops: for each sliding window of size W, it iterates over all events and allocates a `HashSet` of activity strings. For consecutive windows, there is 99% overlap. A sliding window accumulator that adds the new trace's activities and removes the old trace's activities would avoid re-scanning the entire window, reducing complexity from O(L * W) to O(L) where L is log size.
  - Hashing string slices instead of allocating owned `String` instances in `current_activities` would significantly reduce garbage collection overhead.

## Code References
- **Rust Implementation**: `wasm4pm/src/prediction_drift.rs` -> `detect_drift`, `jaccard_distance`
- **TypeScript dispatch**: `packages/kernel/src/api.ts` -> `runRaw`
- **Test file**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`

## Evaluation semantics (2026-10-10, commit `0e3d81b38`)

- New export `detect_drift_with_threshold(log_handle, activity_key, window_size, threshold)`
  exposes the drift cutoff as a parameter. `threshold` is clamped to
  `[0.0, 1.0]` (both Jaccard and total-variation distances live in that
  range); the default `detect_drift` export is unchanged and still uses
  `DEFAULT_DRIFT_THRESHOLD = 0.3`.
- Rationale: a hard-coded cutoff hides real drift at high settings and masks
  noise at low settings; lowering the threshold supports high-sensitivity
  monitoring.
- Note: the vocabulary (Jaccard) and frequency (total variation) distances can
  disagree — identical vocabularies with an 80/20 frequency shift score
  Jaccard 0 but TV 0.8, which exceeds the default threshold. This is an
  intentional honesty oracle in the test suite, not a bug.
