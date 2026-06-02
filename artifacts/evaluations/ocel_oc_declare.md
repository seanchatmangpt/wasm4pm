# Algorithm Evaluation: ocel_oc_declare

## Overview
- **Algorithm ID:** `ocel_oc_declare`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✅ Present
- **Dispatch:** ✅ Present
- **CLI:** ✅ Present
- **WASM:** ✅ Present

## Behavior Evidence
### Positive Cases
- `ocel_oc_declare.valid_minimal_log`: ✅ Passed (Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`)

### Negative Cases
- `ocel_oc_declare.EmptyLogCase`: ✅ Failed Correctly (Error Code: `EMPTY_EVENT_LOG`)
- `ocel_oc_declare.MalformedLogCase`: ✅ Failed Correctly (Error Code: `MALFORMED_EVENT_LOG`)

### Invariant Cases
- `ocel_oc_declare.DeterministicSameInputCase`: ✅ Passed (Stable: true)

## Evidence Binding
- **Algorithm Evidence Hash:** `36f5cce179d1e030881567f873200dc9dfda0e60c7b312af80ff3d57d1b95190`
- **Verification State:** `Closed`

## Algorithmic Role
Discover Object-Centric Declare constraints from an OCEL. Identifies temporal constraints (e.g., precedence, response) that hold across different object types, providing a declarative view of multi-object processes.

## Implementation Validation & Details
- **Source Module:** `wasm4pm/src/advanced/oc_declare.rs`
- **WASM Export:** `discover_oc_declare_wasm(ocel_handle: &str, noise_threshold: f64)`
- **Core Logic:**
  1. Correlates object IDs with object types and groups event traces per object instance, sorted chronologically.
  2. For each object type, evaluates existence, init, and binary temporal constraints (Precedence and Response) between activities present in the instance traces.
  3. Precedence requires that if an activity `b` occurs, activity `a` must have occurred prior. Response requires that if activity `a` occurs, activity `b` must eventually follow.
  4. Rules are formalized using the `OCDeclareRule` struct, capturing the template type, participating activities, object type, confidence, and support.
  5. The discovery uses a `noise_threshold` to filter out constraints that do not meet the minimum required confidence `(>= 1.0 - noise_threshold)`.