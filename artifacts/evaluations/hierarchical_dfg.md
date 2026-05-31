# Algorithm Evaluation: hierarchical_dfg

## Overview
- **Algorithm ID**: `hierarchical_dfg`
- **Category**: `discovery`
- **Summary**: Extends the Directly-Follows Graph by adding hierarchical abstraction, allowing for multi-level process visualization and analysis.

## Status
- **Registry**: Present
- **Dispatch**: Present
- **CLI**: Present
- **WASM**: Present

## Supported Profiles
- `fast`
- `balanced`
- `quality`

## Behavior Evidence
### Positive Cases
- `hierarchical_dfg.valid_minimal_log`: **passed**

### Negative Cases
- `hierarchical_dfg.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
- `hierarchical_dfg.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `hierarchical_dfg.DeterministicSameInputCase`: **passed**

## Verification
- **Evidence Hash**: `ad80529212df76bd70eb60e5e2d911dda7e419d4f92e61f3d83c4b6e2070b977`
- **Verification State**: `Closed`

## Implementation Validation & Details
The Hierarchical DFG algorithm is correctly implemented in `wasm4pm/src/hierarchical.rs`.

**Key Implementation Details:**
- **Paradigm:** Divide-and-conquer strategy (`Chunkable` trait). It partitions logs into independent chunks, avoiding monolithic processing for scalability to 100B-event scale.
- **Core Logic:** Uses `DfgChunker` to map traces into a partial result `DfgChunkResult`. Since DFG counts are associative `(a+b)+c = a+(b+c)`, it then merges these intermediate outputs linearly.
- **Data Structures:** During processing, works entirely on `u32` integer identifiers via `TraceInfo` structures. Partial state is maintained in `FxHashMap` structures for speed, avoiding heap allocations in the inner loop. Finally, it uses a string vocabulary to materialize the `DirectlyFollowsGraph`.
- **Performance Constraints:** Implements chunk splitting via a `HierarchicalConfig`, enforcing either `num_chunks` or `max_chunk_events`. Memory consumption bounds strictly to the chunk size rather than total log size.
