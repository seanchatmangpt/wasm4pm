# Algorithm Evaluation: compute_activity_transition_matrix

## Overview
- **Algorithm ID**: `compute_activity_transition_matrix`
- **Category**: `discovery`
- **Role**: Generates a matrix representing the frequency or probability of transitions between activities in an event log, providing a foundational representation for many process mining techniques.

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
- `compute_activity_transition_matrix.valid_minimal_log`: **passed**
  - Input Hash: `663cd7b1da01cd024291e527a46079e0e7676fcf3a81ca8f5dee070b073c5df9`
  - Result Hash: `908037ada87e03d9639e1d693a171b4824c88053928e18979ffb7c5b007c1490`
  - Receipt Hash: `38e29c6f0cd2e74280f1cb92bc0f9274366940479b9fcf67ea2ba0196cd9b894`

### Negative Cases
- `compute_activity_transition_matrix.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
  - Receipt Hash: `8099259fcd6cabc7be6959bf0b016d928162776169d2079ccae87728829d51a7`
- `compute_activity_transition_matrix.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)
  - Receipt Hash: `cc6dec629552a4ac5e127759e43ea6fcc431ddd30c6f9c06114214d5b53c05e1`

### Invariant Cases
- `compute_activity_transition_matrix.DeterministicSameInputCase`: **passed**
  - Stable: Yes

## Evidence
- **Algorithm Evidence Hash**: `0cf71830f69cd244d90e4b69187c0a13479adf96fea8d39cb1287b545004e53f`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Location**: `wasm4pm/src/final_analytics.rs`
- **Logic**:
  - Discovers Markov chain-like state transitions across process traces.
  - Builds an integer-mapped (`u32`) activity vocabulary from the event log for efficient lookup.
  - Uses `windows(2)` iteration over events within each trace to identify directly-follows transitions.
  - Accumulates transition counts and overall activity frequency in high-performance `FxHashMap` structures before returning as JSON.