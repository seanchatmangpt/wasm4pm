# Algorithm Evaluation: complexity_metrics

## Overview
- **Algorithm ID**: `complexity_metrics`
- **Category**: `discovery`
- **Role**: Computes structural and behavioral complexity metrics for process models and logs, such as Coefficient of Network Complexity (CNC) and entropy, to quantify the difficulty of understanding or managing the process.

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
- `complexity_metrics.valid_minimal_log`: **passed**
  - Input Hash: `663cd7b1da01cd024291e527a46079e0e7676fcf3a81ca8f5dee070b073c5df9`
  - Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`
  - Receipt Hash: `0a3384299b32c26bf71e420bf6d421cc485281c5263ac5c00eeebe2dcae79f82`

### Negative Cases
- `complexity_metrics.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
  - Receipt Hash: `b4aeeadcc9b2a4df260ad63c001b2a69ad5c2a31a4380b5350ae2204a5e8de12`
- `complexity_metrics.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)
  - Receipt Hash: `6a5a78bd3eb20794368b198fe838d7fd87e02a74c671945dc48a123052eddaf8`

### Invariant Cases
- `complexity_metrics.DeterministicSameInputCase`: **passed**
  - Stable: Yes

## Evidence
- **Algorithm Evidence Hash**: `f60ce2316b846e5bed5f94fbd1c9a082fe1e04fabf7eac5ce3188d4196cf07a8`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Location**: `wasm4pm/src/complexity_metrics.rs`
- **Logic**:
  - Evaluates both POWL models and Petri Nets.
  - For POWL models, it recursively traverses the syntax tree to compute Cyclomatic Complexity and Control-Flow Complexity (CFC).
  - Also calculates software engineering Halstead Metrics (Vocabulary, Length, Volume, Difficulty, Effort) based on unique operators (`n1`) and activities (`n2`).
  - Provides a `simplicity_arc_degree` metric for Petri Nets, which computes `1.0 - (num_arcs / max_arcs)`, accurately bounded in `[0.0, 1.0]`.