# Algorithm Evaluation: performance_spectrum

## Metadata
- **Algorithm ID:** `performance_spectrum`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Interface Status
- **Registry Entry:** ✅ Present
- **TypeScript Dispatch:** ✅ Present
- **CLI Surface:** ✅ Present
- **WASM Export:** ✅ Present

## Behavioral Evidence
- **Positive Cases:** 1/1 passed
- **Negative Cases:** 2/2 failed correctly
- **Invariant Cases:** 1/1 passed

## Verification
- **Evidence Hash:** `37d1cfac77bad95958886db6f0c1dba7d37b044d03cd2457cb7a95c27fb4dbca`
- **State:** `Closed`

## Algorithmic Role
Implements performance spectrum analysis, enabling the visualization and quantification of process performance variations and bottlenecks over time. It allows for the identification of patterns in process execution speeds and delays, providing deep insights into operational efficiency and process stability.

## Implementation Validation & Details
Based on the source code in `wasm4pm/src/performance_spectrum.rs`:
- The algorithm iterates over all traces to identify occurrences of a specific `target_activity`.
- For each occurrence, it measures the time duration (in milliseconds) to the immediately following event.
- Measured durations are bucketed by `(target_activity, next_activity)` pairs. Events lacking parseable timestamps are safely skipped.
- It computes aggregate performance statistics for each pair bucket, producing the minimum, maximum, mean, and median durations, along with the total count of observations.
- The results are returned sorted by the `next_activity` name.