# Algorithm Evaluation: heuristic_miner

## Overview
- **Algorithm ID**: `heuristic_miner`
- **Category**: `discovery`
- **Summary**: Discovers process models by focusing on the frequency of events and sequences, handling noise better than basic miners. It identifies causal dependencies based on a dependency graph.

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
- `heuristic_miner.valid_minimal_log`: **passed**

### Negative Cases
- `heuristic_miner.MalformedLogCase`: **failed_correctly** (Error: `MALFORMED_EVENT_LOG`)
- `heuristic_miner.EmptyLogCase`: **failed_correctly** (Error: `EMPTY_EVENT_LOG`)

### Invariant Cases
- `heuristic_miner.DeterministicSameInputCase`: **passed**

## Verification
- **Evidence Hash**: `5199a14bdb29f138fe1835a26379266e4eb27f8aa3853703033078d415fb3ba9`
- **Verification State**: `Closed`

## Implementation Validation & Details
The Heuristic Miner algorithm is correctly implemented in `wasm4pm/src/streaming/streaming_heuristic.rs`.

**Key Implementation Details:**
- **Paradigm:** Streaming Algorithm (`StreamingHeuristicBuilder`). It extends DFG to compute a dependency matrix as a streaming process.
- **Core Logic:** For each pair `(a,b)`, it tracks the forward frequency `a → b`, the reverse frequency `b → a`, and the absolute counts of `a` and `b`. The dependency score is computed using the formula: `dep(a→b) = (count(a→b) - count(b→a)) / (count(a→b) + count(b→a) + 1)`.
- **Filtering Mechanism:** The algorithm exposes a `dependency_threshold` (defaulting to `0.8`). Edges whose absolute dependency score `|dep|` falls below the threshold are filtered out when taking a snapshot to produce the final `DirectlyFollowsGraph` model. This effectively prunes noise and parallel/optional relations.
- **Data Structures:** Utilizes `FxHashMap` for fast O(1) tracking of edge counts, start counts, and end counts. Memory-efficient string interning (`ActivityInterner`) is used to map activity names to integer `u32` IDs.
- **Performance:** Optimized for minimal per-event overhead (~200ns per event) and space bounds matching `O(open_traces × avg_trace_length + activities²)`. Optionally uses `bcinr` SIMD masks to accelerate score thresholding.
