# Algorithm Evaluation: correlation_miner

## Overview
- **Algorithm ID**: `correlation_miner`
- **Category**: `discovery`
- **Role**: Discovers process models by identifying statistically significant correlations between non-adjacent events, allowing for the discovery of complex dependencies without requiring explicit event adjacency.

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
- `correlation_miner.valid_minimal_log`: **passed**
  - Input Hash: `663cd7b1da01cd024291e527a46079e0e7676fcf3a81ca8f5dee070b073c5df9`
  - Result Hash: `6bebe063a10206a3e389143417b6881bb46f0dbbf1c1a6a14d268d299858f5cc`
  - Receipt Hash: `668bb674b582a25f204035ed16f491cb32fa7469156889072ed8e7c827e10d73`

### Negative Cases
- `correlation_miner.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
  - Receipt Hash: `55fc79d4b8e43c4e46c0f04dd8bc11de6e00098cf934b9de615d2659f9b50121`
- `correlation_miner.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)
  - Receipt Hash: `c669d1f09f2d9351fcc4360d316fdb74dfb9e1a3581df3958fd746ef552e3571`

### Invariant Cases
- `correlation_miner.DeterministicSameInputCase`: **passed**
  - Stable: Yes

## Evidence
- **Algorithm Evidence Hash**: `c36c10a35025d1f3958dfbe187cb83d7111a2c2495f9a01d64be18740acaf685`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Location**: `wasm4pm/src/correlation_miner.rs`
- **Logic**:
  - Enables Directly-Follows Graph (DFG) discovery purely from temporal proximity when case identifiers are unavailable.
  - Flattens the event log and sorts entirely by start/end timestamps.
  - Maps activity sequences using an O(N log N) sorted `BTreeMap`.
  - Determines edges based on a configurable timeframe threshold (`correlation_threshold`, defaults to `86400.0` seconds or 24 hours), resolving precede-succeed durations into weighted probabilistic edges.