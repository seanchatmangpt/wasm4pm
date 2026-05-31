# Algorithm Evaluation: ocel_dfg_per_type

## Overview
- **Algorithm ID:** `ocel_dfg_per_type`
- **Category:** `discovery`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✅ Present
- **Dispatch:** ✅ Present
- **CLI:** ✅ Present
- **WASM:** ✅ Present

## Behavior Evidence
### Positive Cases
- `ocel_dfg_per_type.valid_minimal_log`: ✅ Passed (Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`)

### Negative Cases
- `ocel_dfg_per_type.EmptyLogCase`: ✅ Failed Correctly (Error Code: `EMPTY_EVENT_LOG`)
- `ocel_dfg_per_type.MalformedLogCase`: ✅ Failed Correctly (Error Code: `MALFORMED_EVENT_LOG`)

### Invariant Cases
- `ocel_dfg_per_type.DeterministicSameInputCase`: ✅ Passed (Stable: true)

## Evidence Binding
- **Algorithm Evidence Hash:** `7d685d5443a77a1f0b4f1829a42e035408254078110a9088ff19dffb725d7600`
- **Verification State:** `Closed`

## Algorithmic Role
Discover per-object-type Directly-Follows Graphs from an OCEL. Returns a map from object_type to DFG, allowing separate process views for each object type (e.g., Order, Item). This is the canonical OC-DFG projection for object-centric process mining.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/discovery.rs`
- **Core Logic:** Generates a separate Directly-Follows Graph (DFG) for each distinct object type present in the OCEL. For a given object type, events are scoped strictly to the instances of that type, sorted by timestamp, and then adjacent pairs are resolved to form type-specific transition relationships.
- **Trace Segregation:** Initializes separate DFG structures per object type, iterates through objects isolating those of the matching type, and scopes events to these specific objects. 
- **Performance Optimizations:** Computes global activity frequencies upfront to prevent redundant counting across iterations for different object types. It features a bitmask-based fast-path evaluation (`bitmask_mark`, `bitmask_check`) for domains with a vocabulary size $\le 64$ activities. Fast timestamp comparisons rely on unstable lexicographical sorting of string references without allocating new strings or running a complete ISO-8601 parsing pipeline.