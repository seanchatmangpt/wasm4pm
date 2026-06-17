# Algorithm Review: ml_anomaly

## Algorithm ID & Domain
- **Algorithm ID**: `ml_anomaly`
- **Domain**: Machine Learning / Anomaly Detection (Directly-Follows Trace Anomaly Scoring)

## Correctness Audit
- **Early Exit Guards**:
  - `score_distribution_stats` handles `scores.is_empty()` correctly (lines 12-14) by returning a default `(0.0, 0.0)`.
  - In `score_trace_anomaly`, if the `activities` sequence has length `< 2` (lines 48-50), it returns early with `0.0` (as 1-event traces cannot traverse transitions in a DFG).
  - In `score_log_anomalies`, traces with less than 2 events are skipped and assigned a default anomaly score of `0.0` and `steps: 0` (lines 159-162).
- **Division-by-Zero Protection**:
  - In `score_trace_anomaly`, `steps` is computed as `activities.len() - 1` (line 53). Because of the early exit for `< 2` length, `steps` is guaranteed to be at least `1`, preventing division-by-zero during `cost_sum / steps as f64`.
  - When calculating the transition probability, `from_total` is calculated as the sum of all frequencies starting from `from_act` and forced to be at least 1 via `.max(1)` (lines 57-63). This prevents division-by-zero if `from_total` would be zero.
  - In `score_log_anomalies`, similar logic is applied: `from_total` is forced to `1` using `unwrap_or(1).max(1)` (line 166).
  - Standard deviation division in `score_log_anomalies`: `z = if std_dev > 1e-12 { (score - mean) / std_dev } else { 0.0 }` (lines 201-205). This is a highly robust check that guards against division-by-zero when all scores in the log are constant (resulting in `std_dev = 0`).
- **Special Cases / Edge Behaviors**:
  - Edge frequency not present: if `edge_freq == 0` (no such transition exists in the reference DFG), a fixed penalty `MISSING_EDGE_COST = 10.0` is applied instead of computing negative log probability (lines 69-74, 168-173), preventing `log2(0)` which would result in negative infinity.

## Improvement Areas
- **Algorithmic Complexity**:
  - In `score_trace_anomaly`, it performs linear scans over `dfg.edges` for every trace event transition (lines 57-68). If the DFG has $E$ edges and the trace has $L$ steps, this requires $O(L \times E)$ operations. While fine for a single trace, it is inefficient for bulk operations.
  - In contrast, `score_log_anomalies` is highly optimized: it builds a hash map `freq_map: FxHashMap<(&str, &str), usize>` and a `source_totals: FxHashMap<&str, usize>` before looping over traces (lines 134-142), making the transition lookups $O(1)$ and the total complexity $O(E + L_{\text{total}})$.
- **State Allocation**:
  - In `score_log_anomalies`, `edge_data: Vec<(String, String, usize)>` is cloned out of the WASM state (lines 123-132) to release the lock. This requires copying all edge strings from the DFG. If `with_object` could take owned keys or borrow them, it would be more efficient, but since `StoredObject` is owned by the global state, the copy is necessary for safety.

## Code References
- **Rust Implementation**: `wasm4pm/src/anomaly.rs` (method: `discover_ml_anomaly` / `score_log_anomalies`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `ml_anomaly`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
