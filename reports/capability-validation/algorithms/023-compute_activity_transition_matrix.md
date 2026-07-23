---
type: algorithm
id: compute_activity_transition_matrix
number: 023
final_status: VALID
maturity_level: L5
source_declaration: packages/kernel/ALGORITHMS.md
implementation_file: wasm4pm/src/final_analytics.rs
implementation_symbol: compute_activity_transition_matrix
test_file: wasm4pm/tests/algorithm_paper_grounded.rs
test_case: compute_activity_transition_matrix_paper_grounded
receipt: reports/capability-validation/verifier/compute_activity_transition_matrix_test.log
---

# 023 — algorithm: `compute_activity_transition_matrix`

## 1. Canonical Declaration

- Source file: packages/kernel/ALGORITHMS.md
- Source excerpt: `- **`compute_activity_transition_matrix`** (Algorithm description from reference)`
- Source-order position: 23
- Count validation: verified 60/60 algorithms present.

## 2. Implementation Mapping

- Implementation file: [final_analytics.rs](file:///Users/sac/wasm4pm/wasm4pm/src/final_analytics.rs)
- Implementation symbol: `compute_activity_transition_matrix`
- Dispatch path: `packages/kernel/src/api.ts` -> case 'compute_activity_transition_matrix' -> WASM `compute_activity_transition_matrix`
- WASM boundary path, if applicable: [final_analytics.rs#L73-L137](file:///Users/sac/wasm4pm/wasm4pm/src/final_analytics.rs#L73-L137)
- Shared implementation notes, if applicable: utilizes an interned `vocab` map to translate activity names to `u32` indices during trace transitions processing.

## 3. Actual Capability

Computes the activity transition matrix (Markov chain representation) of a process log by analyzing the sequential transition probabilities between consecutive activities.
- **Inputs:** `eventlog_handle` (&str) and `activity_key` (&str).
- **Outputs:** Serialized JSON containing:
  - `matrix`: List of transition objects, each with `from` activity, `to` activity, transition `count` (usize), and transition `probability` (f64).
  - `num_activities`: Count of unique activity types in the log.
- **Computation Mechanics:**
  - Extracts the set of unique activities via `log.get_activities(activity_key)` to build the vocabulary.
  - Maps activity name strings to `u32` indices.
  - Scans traces using `windows(2)` to identify pairs of consecutive events.
  - Increments transition occurrences inside a `BTreeMap<(u32, u32), usize>` and tracks total outgoing transitions per activity in `activity_total`.
  - Calculates probability as `count as f64 / activity_total(from) as f64`.
- **Error Behavior:** Propagates WASM registry object retrieval errors.
- **Determinism:** Commutative addition and key ordering in `BTreeMap` guarantee 100% deterministic outputs across platforms.

## 4. Expected Semantics

- **Normal case:** The algorithm maps all sequential pairs (e.g., A followed by B) and outputs their counts and relative frequencies (probabilities) summing to 1.0 for each source state.
- **Empty case:** If the event log is empty, it returns 0 activities and an empty transition matrix.
- **Malformed case:** caught at parse stage.
- **Boundary case:**
  - Traces of length 1 generate no transitions.
  - Activities that only appear at the end of traces have `activity_total(from) = 0`, and are correctly excluded from the matrix transition list.
- **Non-trivial representative case:** A log containing loops (e.g., `running-example.xes`) shows self-loops or cycles represented as fractional probabilities in the transition matrix.

## 5. Test Evidence

- **Test file:** [algorithm_paper_grounded.rs](file:///Users/sac/wasm4pm/wasm4pm/tests/algorithm_paper_grounded.rs)
- **Test case:** `compute_activity_transition_matrix_paper_grounded`
- **Result:** Pass (ok)

## 6. Edge-Case Evidence

- **Terminal States:** Verified that activities appearing only at trace ends do not trigger division-by-zero panics, as the denominator lookup defaults to 1.
- **No transitions:** Checked that traces with length $= 1$ output a matrix with `num_activities = 1` and empty matrix transition list.
- **Determinism Check:** Output values are identical across separate executions due to `BTreeMap` sorting.

## 7. Best-Practice Review

- **Implementation Completeness:** Complete implementation of activity transition Markov chain computations.
- **Accepted Practice:** Directly implements the standard Markov chain model representation of process logs (van der Aalst 2016 Ch.3).
- **Refactor needed:** None.

## 8. Changes Made

- Existing implementation admitted under current bounded semantics. No functional code modifications were required.

## 9. Verification Receipt

- **Command:** `cargo test -p wasm4pm --test algorithm_paper_grounded compute_activity_transition_matrix_paper_grounded`
- **Exit status:** 0
- **Output summary:** `test compute_activity_transition_matrix_paper_grounded ... ok`
- **Artifact path:** `artifacts/release/algorithm-behavior-receipts/compute_activity_transition_matrix.receipt.json`
- **Date/time:** 2026-07-04T23:24:00-07:00

## 10. Final Classification

VALID

The activity transition matrix generator correctly builds transition indices, computes correct probabilities using total outgoing counts, prevents division-by-zero, and is deterministic.

## 11. Falsifier

The report would be falsified if transition probabilities from a single state exceed 1.0 (excluding float rounding), or if outgoing transitions from terminal activities cause division-by-zero panics.

## 12. Code Receipts

### Declaration
[compute_activity_transition_matrix](file:///Users/sac/wasm4pm/wasm4pm/src/final_analytics.rs#L73-L76)
```rust
#[wasm_bindgen]
pub fn compute_activity_transition_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
```

### Implementation Symbol
[compute_activity_transition_matrix](file:///Users/sac/wasm4pm/wasm4pm/src/final_analytics.rs#L73-L137)
```rust
#[wasm_bindgen]
pub fn compute_activity_transition_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_event_log(eventlog_handle, |log| {
        let activities = log.get_activities(activity_key);

        // Build activity vocabulary
        let vocab: HashMap<String, u32> = activities
            .iter()
            .enumerate()
            .map(|(i, a)| {
                (
                    a.clone(),
                    u32::try_from(i).expect("activity vocab index fits u32"),
                )
            })
            .collect();

        let mut transitions: BTreeMap<(u32, u32), usize> = BTreeMap::new();
        let mut activity_total: FxHashMap<u32, usize> = FxHashMap::default();

        for activity_id in vocab.values() {
            activity_total.insert(*activity_id, 0);
        }

        for trace in &log.traces {
            trace.events.windows(2).for_each(|w| {
                if let (Some(AttributeValue::String(a1)), Some(AttributeValue::String(a2))) = (
                    w[0].attributes.get(activity_key),
                    w[1].attributes.get(activity_key),
                ) {
                    if let (Some(&a1_id), Some(&a2_id)) = (vocab.get(a1), vocab.get(a2)) {
                        *transitions.entry((a1_id, a2_id)).or_default() += 1;
                        *activity_total.entry(a1_id).or_default() += 1;
                    }
                }
            });
        }

        // Compute transition probabilities
        let matrix_data: Vec<_> = transitions
            .iter()
            .filter_map(|((from, to), count)| {
                activities.get(*from as usize).and_then(|from_name| {
                    activities.get(*to as usize).map(|to_name| {
                        let prob =
                            *count as f64 / activity_total.get(from).copied().unwrap_or(1) as f64;
                        json!({
                            "from": from_name,
                            "to": to_name,
                            "count": count,
                            "probability": prob
                        })
                    })
                })
            })
            .collect();

        to_js_str(&json!({
            "matrix": matrix_data,
            "num_activities": activities.len(),
        }))
    })
}
```

### Dispatch Registration
[api.ts](file:///Users/sac/wasm4pm/packages/kernel/src/api.ts#L1611-L1614)
```typescript
      case 'compute_activity_transition_matrix': {
        const json = this.wasm.compute_activity_transition_matrix!(eventLogHandle, activityKey);
        return { handle: `transition_matrix_${Date.now()}`, metadata: { result: parseWasmOutput(json) } } as any;
      }
```

### Complexity Guards
[final_analytics.rs](file:///Users/sac/wasm4pm/wasm4pm/src/final_analytics.rs#L119-L120)
```rust
                        let prob =
                            *count as f64 / activity_total.get(from).copied().unwrap_or(1) as f64;
```

### Key Routines
Mapping activity pairs in windows:
[final_analytics.rs](file:///Users/sac/wasm4pm/wasm4pm/src/final_analytics.rs#L99-L111)
```rust
        for trace in &log.traces {
            trace.events.windows(2).for_each(|w| {
                if let (Some(AttributeValue::String(a1)), Some(AttributeValue::String(a2))) = (
                    w[0].attributes.get(activity_key),
                    w[1].attributes.get(activity_key),
                ) {
                    if let (Some(&a1_id), Some(&a2_id)) = (vocab.get(a1), vocab.get(a2)) {
                        *transitions.entry((a1_id, a2_id)).or_default() += 1;
                        *activity_total.entry(a1_id).or_default() += 1;
                    }
                }
            });
        }
```

## 13. Focused Test Receipt

### Focused Test Command
```bash
cargo test -p wasm4pm --test algorithm_paper_grounded compute_activity_transition_matrix_paper_grounded
```

### Captured Output
```
running 1 test
test compute_activity_transition_matrix_paper_grounded ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 106 filtered out; finished in 0.00s
```

### Assertion Coverage Table
| Test Case | Target | Checked Behavior | Status |
|-----------|--------|------------------|--------|
| `compute_activity_transition_matrix_paper_grounded` | Transition Matrix Analyzer | Verifies sequence index mapping, outgoing counts, probabilities summation, and handles terminal events | Passed |
