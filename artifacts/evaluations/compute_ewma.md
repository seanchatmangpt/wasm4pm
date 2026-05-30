# Algorithm Evaluation: compute_ewma

## Overview
- **Algorithm ID**: `compute_ewma`
- **Category**: `discovery`
- **Role**: Calculates the Exponentially Weighted Moving Average for time-series performance data in event logs, allowing for smoothed trend analysis of metrics like throughput or cycle time.

## Reachability & Dispatch
- **Registry Present**: Yes
- **TS Dispatch Present**: Yes
- **CLI Present**: Yes
- **WASM Export Present**: Yes

## Supported Profiles
- `fast`
- `balanced`
- `quality`

## Test Behavior
### Positive Cases
- `compute_ewma.valid_minimal_log`: **passed**
  - Input Hash: `663cd7b1da01cd024291e527a46079e0e7676fcf3a81ca8f5dee070b073c5df9`
  - Result Hash: `3df6126c24a96fcaefbc6abc736396050765d1d2aa285b9d295ed76099cb62e7`
  - Receipt Hash: `0d9410cd9c7a1f14f72e60f1d2f1231f0f6c6816d7aa358273d845b6c2f9dfe4`

### Negative Cases
- `compute_ewma.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
  - Receipt Hash: `3622e8b0ba3381e917fb2e3227d4235e8f1b52a46e413823678ff13c1f3ed42d`
- `compute_ewma.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)
  - Receipt Hash: `742f76d57f7de5a8ca20c9f579fe70fea5dd144eaee0d8c9af9563def31fb1b3`

### Invariant Cases
- `compute_ewma.DeterministicSameInputCase`: **passed**
  - Stable: Yes

## Evidence
- **Algorithm Evidence Hash**: `a05fa0c077a83343dd23a3fb3652fa60313856a7a60d5ae7e14f3e7f2f46ee75`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Location**: `crates/miniml-core/src/optimization/drift.rs`
- **Logic**:
  - Computes the Exponentially Weighted Moving Average (`EMA = alpha * current + (1 - alpha) * previous_EMA`).
  - Classifies the global trend by comparing the absolute range (`last - first`) scaled by the maximum absolute magnitude against a threshold (`0.05`).
  - Emits one of three classified states: `"stable"`, `"rising"`, or `"falling"`.