# Algorithm Evaluation: ocel_dfg

## Overview
- **Algorithm ID:** `ocel_dfg`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✅ Present
- **Dispatch:** ✅ Present
- **CLI:** ✅ Present
- **WASM:** ✅ Present

## Behavior Evidence
### Positive Cases
- `ocel_dfg.valid_minimal_log`: ✅ Passed (Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`)

### Negative Cases
- `ocel_dfg.EmptyLogCase`: ✅ Failed Correctly (Error Code: `EMPTY_EVENT_LOG`)
- `ocel_dfg.MalformedLogCase`: ✅ Failed Correctly (Error Code: `MALFORMED_EVENT_LOG`)

### Invariant Cases
- `ocel_dfg.DeterministicSameInputCase`: ✅ Passed (Stable: true)

## Evidence Binding
- **Algorithm Evidence Hash:** `87068c1a3b9f64eb65930932a98f8a0db87ea81eec1f6bb1d64fbcfb9c64ea15`
- **Verification State:** `Closed`

## Algorithmic Role
Discover an aggregate Object-Centric Directly-Follows Graph (OC-DFG) across all object types. Produces a single DFG where each node is an activity and edges reflect directly-follows relations observed across all object types in the OCEL.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/discovery.rs`
- **Core Logic:** Constructs an aggregate Directly-Follows Graph (DFG) across all objects within an Object-Centric Event Log (OCEL). Events are mapped to their interacting objects, sorted chronologically, and relationships are extracted from adjacent event pairs within each object's timeline.
- **Performance Optimizations:** Leverages fast hashing (`FxHashMap`/`FxHashSet`) and borrowed string slices (`&str`) from the original event types for counting edge frequencies. This avoids unnecessary String allocations in the hot loop. Also uses lexicographical comparisons of ISO-8601 timestamps without fully parsing them.
- **Metrics Computation:** Node frequencies denote the absolute occurrences of an event type globally. Start and end activities are aggregated by inspecting the first and last events of each object's localized trace.