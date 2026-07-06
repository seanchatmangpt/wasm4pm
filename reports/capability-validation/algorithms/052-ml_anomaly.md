---
type: algorithm
id: ml_anomaly
number: 052
final_status: VALID
maturity_level: L5
source_declaration: packages/kernel/ALGORITHMS.md
implementation_file: wasm4pm/src/anomaly.rs
implementation_symbol: discover_ml_anomaly
test_file: wasm4pm/tests/algorithm_paper_grounded.rs
test_case: ml_anomaly_paper_grounded
receipt: reports/capability-validation/verifier/ml_anomaly_test.log
---

# 052 — algorithm: `ml_anomaly`

## 1. Canonical Declaration

- Source file: packages/kernel/ALGORITHMS.md
- Source excerpt: `- **`ml_anomaly`** (Algorithm description from reference)`
- Source-order position: 52
- Count validation: verified 60/60 algorithms present.

## 2. Implementation Mapping

- Implementation file: wasm4pm/src/anomaly.rs
- Implementation symbol: discover_ml_anomaly
- Dispatch path: packages/kernel/src/api.ts -> case 'ml_anomaly'
- WASM boundary path, if applicable: `discover_ml_anomaly` (wraps `score_log_anomalies`)
- Shared implementation notes, if applicable: utilizes dynamic DFG generation and population z-score scaling.

## 3. Actual Capability

The [ml_anomaly](file:///Users/sac/wasm4pm/wasm4pm/src/anomaly.rs) algorithm detects behavioral anomalies within traces of an event log using a Directly-Follows Graph (DFG) probability model.

The algorithm executes in four steps:
1. **Model Discovery:** Discovers a DFG from the event log to establish normal transition frequencies.
2. **Raw Score Computation:** For each trace, it calculates transition costs for each step $A \to B$:
   - For edges present in the DFG, cost is calculated as the negative log-probability: $-\log_2(\text{freq}(A \to B) / \text{total\_edges\_from}(A))$.
   - For missing edges, a fixed penalty of $10.0$ (`MISSING_EDGE_COST`) is applied.
   - The trace score is the average cost over all transitions. Traces with length $< 2$ default to score $0.0$.
3. **Z-Score Normalization:** Computes the mean and population standard deviation $\sigma$ of the scores across the log. Each trace is assigned $z = (\text{score} - \text{mean}) / \sigma$. Outliers are flagged if $z > 2.0$ (roughly representing the 95th percentile).
4. **Output Sorting:** Returns traces sorted descending by anomaly score.

## 4. Expected Semantics

- **Normal case:** Accepts loaded event log and activity key. Returns a sorted list of JSON records: `[{"case_id": "Case1", "score": F, "steps": N, "z_score": F, "is_outlier": B}]`.
- **Empty case:** Refuses with `EMPTY_EVENT_LOG` if the event log contains no traces.
- **Malformed case:** Refuses with `PREDICTION_FEATURES_REQUIRED` if the required activity key or trace properties are missing.
- **Boundary case:** Traces with $<2$ events are assigned a score of $0.0$ and steps = 0. If standard deviation $\sigma \le 10^{-12}$ (e.g., all traces have identical scores), all z-scores default to $0.0$, and no outliers are reported.
- **Non-trivial case:** Correctly highlights traces containing rare transitions or skipped critical path activities as anomalies.

## 5. Test Evidence

- Test file: [algorithm_paper_grounded.rs](file:///Users/sac/wasm4pm/wasm4pm/tests/algorithm_paper_grounded.rs)
- Test case: `ml_anomaly_paper_grounded`
- Command: `cargo test --test algorithm_paper_grounded -- ml_anomaly_paper_grounded`
- Result: Passed (Exit Status 0)
- Gaps: None.

## 6. Edge-Case Evidence

- **Empty Input:** Refuses with `EMPTY_EVENT_LOG`. (Receipt Hash: `e9e073414a1f633fe53564e5d82135fdb29806d46a490bc1e09ef85ba47d85ab`)
- **Malformed Input:** Refuses with `PREDICTION_FEATURES_REQUIRED`. (Receipt Hash: `6ceb98ff23c213ed32c52ab302f94e5a2fdca60c3c8712307599f7562d720bf1`)
- **Minimal Input:** Successfully processes minimal singleton traces. (Receipt Hash: `a496aadc0bac8a1352eeefc6f12b89a9ae6cedb0fd09cd589b4b50d4dd89e350`)
- **Replay/Determinism:** Repeated execution produces bit-exact identical JSON outcomes and hashes.

## 7. Best-Practice Review

- **Complete Implementation:** Full trace anomaly scoring with dynamic DFG creation and z-score outlier detection.
- **Z-Score Comparability:** Computing z-scores makes anomaly cost comparable across different event logs.
- **Numerical Safety:** Standard deviation is calculated using population variance. If standard deviation falls below $10^{-12}$, the algorithm avoids division-by-zero errors by defaulting z-scores to $0.0$.

## 8. Changes Made

- Existing implementation admitted under current bounded semantics.
- Documented z-score logic and population variance mathematics.

## 9. Verification Receipt

- Command: `pnpm run release:verify-algorithm-behavior`
- Exit status: 0
- Output summary: Algorithm behavior evidence verified.
- Artifact path: [ml_anomaly.receipt.json](file:///Users/sac/wasm4pm/artifacts/release/algorithm-behavior-receipts/ml_anomaly.receipt.json)
- Hash: `f4fb6b8943d926396862b3416016539c4335dab0d2205e0f86199fce0a1510c4`
- Date/time: 2026-07-04T23:21:39-07:00
- Remaining blockers: None

## 10. Final Classification

VALID

The `ml_anomaly` algorithm is verified. It implements mathematically correct transition cost modeling, z-score scaling, outlier detection, and exhibits robust error handling for empty or malformed inputs.

## 11. Falsifier

Verification would be invalidated if a uniform log of identical traces flags any trace as an outlier (since standard deviation is 0.0 and z-score should default to 0.0), or if population standard deviation calculation fails to handle empty score slices safely.

## 12. Code Receipts

### Declaration
[discover_ml_anomaly](file:///Users/sac/wasm4pm/wasm4pm/src/anomaly.rs#L79)
```rust
#[wasm_bindgen]
pub fn discover_ml_anomaly(log_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
```

### Implementation Symbol
[discover_ml_anomaly](file:///Users/sac/wasm4pm/wasm4pm/src/anomaly.rs#L79-L102)
```rust
#[wasm_bindgen]
pub fn discover_ml_anomaly(log_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    // 1. Generate DFG directly by accessing the stored EventLog in state
    let dfg = get_or_init_state().with_event_log(log_handle, |log| {
        let admitted =
            wasm4pm_compat::admission::Admission::<_, ()>::new(log.clone()).into_evidence();
        let dfg = crate::discovery::discover_dfg_from_log(&admitted, activity_key);
        Ok(dfg)
    })?;

    // 2. Store it
    let dfg_handle = state
        .store_object(StoredObject::DFG(dfg))
        .map_err(|_| crate::error::js_val("Failed to store DFG"))?;

    // 3. Score anomalies
    let result = score_log_anomalies(log_handle, &dfg_handle, activity_key)?;

    // 4. Cleanup
    let _ = state.delete_object(&dfg_handle);

    Ok(result)
}
```

### Dispatch Registration
[api.ts](file:///Users/sac/wasm4pm/packages/kernel/src/api.ts#L1699-L1709)
```typescript
      case 'ml_anomaly': {
        if (this.wasm.discover_ml_anomaly) {
          const res = await this.wasm.discover_ml_anomaly(eventLogHandle, activityKey);
          const virtualHandle = `virtual_ml_anomaly_${hashOutput({ algorithmName: algorithmId, eventLogHandle, params }).slice(0, 16)}`;
          return {
            handle: virtualHandle,
            metadata: { result: parseWasmOutput(res) }
          } as any;
        }
        throw new KernelError(`ML algorithm '${algorithmId}' requires the @wasm4pm/ml package.`, 'ALGORITHM_NOT_FOUND' as any);
      }
```

### Complexity Guards
[anomaly.rs](file:///Users/sac/wasm4pm/wasm4pm/src/anomaly.rs#L11-L19)
```rust
pub(crate) fn score_distribution_stats(scores: &[f64]) -> (f64, f64) {
    if scores.is_empty() {
        return (0.0, 0.0);
    }
    let n = scores.len() as f64;
    let mean = scores.iter().sum::<f64>() / n;
    let var = scores.iter().map(|s| (s - mean) * (s - mean)).sum::<f64>() / n;
    (mean, var.sqrt())
}
```
And trace length checker:
[anomaly.rs](file:///Users/sac/wasm4pm/wasm4pm/src/anomaly.rs#L47-L49)
```rust
        if activities.len() < 2 {
            return Ok(JsValue::from_f64(0.0));
        }
```

### Key Routines
[anomaly.rs](file:///Users/sac/wasm4pm/wasm4pm/src/anomaly.rs#L113-L117)
```rust
#[wasm_bindgen]
pub fn score_log_anomalies(
    log_handle: &str,
    dfg_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
```

## 13. Focused Test Receipt

### Focused Test Command
```bash
cargo test --test algorithm_paper_grounded -- ml_anomaly_paper_grounded
```

### Captured Output
```
running 1 test
test ml_anomaly_paper_grounded ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 106 filtered out; finished in 0.00s
```

### Assertion Coverage Table
| Test Case | Target | Checked Behavior | Status |
|-----------|--------|------------------|--------|
| `ml_anomaly_paper_grounded` | Outlier trace anomaly scores | Verifies outlier classification, z-score computation under varying trace lengths | Passed |
