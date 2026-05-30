# Algorithm Evaluation: declare

## Overview
- **Algorithm ID**: `declare`
- **Category**: `discovery`
- **Role**: A declarative process discovery algorithm that identifies constraints (rules) such as "A must be followed by B" or "C cannot happen with D" that hold true across traces in an event log.

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
- `declare.valid_minimal_log`: **passed**
  - Input Hash: `663cd7b1da01cd024291e527a46079e0e7676fcf3a81ca8f5dee070b073c5df9`
  - Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`
  - Receipt Hash: `e94300c596dae272cb1f6ca60839f68b1cefcf181f67efabd86bfa1dc6502624`

### Negative Cases
- `declare.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
  - Receipt Hash: `b65fcc9a93f7cd00bfa1bb7746117860b66691b0bd1a85b2e52eb71c489a3386`
- `declare.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)
  - Receipt Hash: `cd6de3c322f171f229d7ecb939185100c71b57a00c4006a7035fbbf884c56d7d`

### Invariant Cases
- `declare.DeterministicSameInputCase`: **passed**
  - Stable: Yes

## Evidence
- **Algorithm Evidence Hash**: `cb5ad4bfaf16c375a8f0e99e8ed4d0a09447f046fad15ac9d3cbb3bb72ac0898`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Location**: `wasm4pm/src/discovery.rs`
- **Logic**:
  - Reconstructs a declarative constraint-based process representation (`DeclareModel`).
  - Relies on caching representations (`ColumnarLog`) to boost performance.
  - Operates using trace-level bitmasks and positional arrays (`first_positions`, `last_positions`) to quickly resolve constraint templates like `appears_before` and `appears_after`.
  - Determines behavioral rules (e.g., precedence or succession constraints) bounding system behavior without strictly enforcing directed sequences.