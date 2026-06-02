# Algorithm Evaluation: batches

## Metadata
- **Algorithm ID**: `batches`
- **Category**: `discovery`
- **Supported Profiles**: `fast`, `balanced`, `quality`

## Status Proof
- **Registry**: ✅ Present
- **TypeScript Dispatch**: ✅ Present
- **CLI Surface**: ✅ Present
- **WASM Export**: ✅ Present

## Behavioral Evidence
- **Positive Cases**:
    - `batches.valid_minimal_log`: **PASSED**
- **Negative Cases**:
    - `batches.MalformedLogCase`: **FAILED_CORRECTLY** (Error: `MALFORMED_EVENT_LOG`)
    - `batches.EmptyLogCase`: **FAILED_CORRECTLY** (Error: `EMPTY_EVENT_LOG`)
- **Invariant Cases**:
    - `batches.DeterministicSameInputCase`: **PASSED** (Stable: true)

## Evidence Binding
- **Evidence Hash**: `11fff9941dc656ced78ca7f023a312a320ea6cb19f92459b95c4d6001c1e8831`
- **Verification State**: `Closed`

## Algorithmic Role
The `batches` algorithm identifies batching behavior within event logs. It detects instances where multiple work items are processed together by the same resource or within a constrained time window. Identifying these patterns is essential for accurate performance analysis, as batching significantly impacts cycle times and resource utilization metrics.

## Implementation Validation & Details
The `batches` algorithm is implemented in Rust (`wasm4pm/src/batches.rs`), porting batch processing pattern detection from pm4wasm. It operates by:
- **Interval Extraction**: Processing the event log to group events by activity and extracting the precise execution intervals (start and end timestamps) for each event instance across different cases.
- **Interval Merging**: Detecting temporal overlap by merging execution intervals that strictly overlap or are closer than a defined distance threshold (`MERGE_DISTANCE_MS` of 15 minutes).
- **Pattern Classification**: Classifying each detected batch into one of four types based on size and temporal properties:
  - `Parallel`: Identical start and end timestamps.
  - `Sequential`: Executions are strictly consecutive (end of one is the start of the next).
  - `Disruptive`: Very large overlapping batch (size $\ge$ 5).
  - `Concurrent`: General overlapping executions not fitting the stricter patterns.
- **Result Aggregation**: Returning all classified batch instances and their total count.
