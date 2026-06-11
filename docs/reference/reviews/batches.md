# Algorithm Review: batches

## Algorithm ID & Domain
- **Algorithm ID**: `batches`
- **Domain**: Process Mining / Discovery (Batch Processing Pattern Detection)

## Correctness Audit
- **Early Exit Guards**:
  - `classify_batch` checks if the interval size is less than `MIN_BATCH_SIZE` (2) (lines 140-143) and returns `None`, skipping single-event intervals.
- **Division-by-Zero Protection**:
  - There are no mathematical divisions in this algorithm.
- **Timestamp Parsing Defect**:
  - The timestamp parsing logic (lines 251-254) requires the timestamp attribute to be `AttributeValue::Date(s)`. If the timestamp is stored as a string (`AttributeValue::String`), the event is silently skipped. This is a correctness discrepancy compared to forecasting and regression which support string timestamps.
- **Sequential Flow Logic**:
  - The check for sequential batch is `let is_sequential = batch_execs.windows(2).all(|w| w[0].end_ts == w[1].start_ts);` (line 161). Since event durations are collapsed to points in time (`start_ts = end_ts` at line 265-266), a sequential batch requires the end timestamp of one task to be exactly equal to the start timestamp of the next. In real logs, tasks might have sub-second gaps or small delays, which will cause this check to fail and categorize them as Concurrent rather than Sequential.

## Improvement Areas
- **Support String Timestamps**:
  - The timestamp parser should support both `AttributeValue::Date` and `AttributeValue::String` to match the project's standard parsing patterns.
- **Algorithmic Complexity**:
  - In `classify_batch`, the code filters all executions of the activity to find those belonging to the current interval:
    `let mut batch_execs: Vec<&Execution> = executions.iter().filter(|e| interval.case_ids.contains(&e.case_id)).collect();` (lines 145-148).
    Since `interval.case_ids` is a `BTreeSet<String>`, this lookup has complexity $O(E \log S)$ where $E$ is the number of executions and $S$ is the batch size. Performing this inside a loop over all intervals can be slow. Since the intervals are already sorted and merged, we could directly store references to the constituent `Execution` objects inside the `Interval` struct during merging, avoiding the filter scan entirely.

## Code References
- **Rust Implementation**: `wasm4pm/src/batches.rs` (method: `discover_batches` / `discover_batches_wasm`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `batches`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
