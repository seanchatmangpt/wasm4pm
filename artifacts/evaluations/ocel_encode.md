# Algorithm Evaluation: ocel_encode

## Overview
- **Algorithm ID:** `ocel_encode`
- **Category:** `analytics`
- **Profiles Supported:** `fast`, `balanced`, `quality`

## Status
- **Registry:** ✅ Present
- **Dispatch:** ✅ Present
- **CLI:** ✅ Present
- **WASM:** ✅ Present

## Behavior Evidence
### Positive Cases
- `ocel_encode.valid_minimal_log`: ✅ Passed (Result Hash: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`)

### Negative Cases
- `ocel_encode.MalformedLogCase`: ✅ Failed Correctly (Error Code: `MALFORMED_EVENT_LOG`)
- `ocel_encode.EmptyLogCase`: ✅ Failed Correctly (Error Code: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `ocel_encode.DeterministicSameInputCase`: ✅ Passed (Stable: true)

## Evidence Binding
- **Algorithm Evidence Hash:** `864929ca38de8ff5ab9b0b411d9f8df59f1c7d3dbffbe21626f2f01f01c1f58b`
- **Verification State:** `Closed`

## Algorithmic Role
Encode an OCEL as a compact human-readable text representation suitable for LLM context, process inspection, and diff display.

## Implementation Validation & Details
- **Source File:** `wasm4pm/src/text_encoding.rs`
- **Core Logic:** Extracts and formats key metadata from an Object-Centric Event Log (OCEL) into a concise text string. The implementation summarizes the global event and object count, lists all distinct event types, itemizes object types alongside their specific instance counts, and aggregates object-to-object relations with their respective relationship qualifiers.
- **Performance Optimizations:** Executes entirely in linear time $O(|O| + |R|)$ with respect to the number of objects and relations. Fast aggregation is achieved using standard `HashMap` (for frequency counting of object types) and `HashSet` (for extracting a unique set of relation qualifiers) without executing heavy nested iterations across the entire event log.