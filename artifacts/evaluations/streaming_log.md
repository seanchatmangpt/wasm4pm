# Algorithm Evaluation: streaming_log

## Identification
- **ID**: `streaming_log`
- **Category**: `discovery`
- **Status**: `Closed`

## Algorithmic Role
`streaming_log` is a discovery analytics algorithm tailored for real-time monitoring and processing of high-volume event streams. It focuses on maintaining an efficient in-memory representation of the event log to support immediate discovery tasks without the overhead of full batch processing. It is a key component of the `wasm4pm` streaming execution profile.

## Support Profiles
- `fast`
- `balanced`
- `quality`

## Reachability Status
- **Registry**: `Present`
- **Dispatch**: `Present`
- **CLI**: `Present`
- **WASM**: `Present`

## Behavior Results
- **Positive Case**: `Passed`
- **Negative Case (Malformed Log)**: `Failed Correctly (MALFORMED_EVENT_LOG)`
- **Negative Case (Empty Log)**: `Failed Correctly (EMPTY_EVENT_LOG)`
- **Invariant Case (Deterministic Same Input)**: `Passed`

## Evidence Binding
- **Evidence Hash**: `b8f30f44590553102da6aa1bea21ead5948139ef55033c7c868a21c6f0795c90`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/probabilistic/streaming_log.rs`
- **Core Function**: `StreamingLog::add_event`, `StreamingLog::estimate_dfg`
- **Mechanism**: A strictly bounded-memory streaming log processor (~135KB total) combining several probabilistic data structures: `CountMinSketch` for edge/activity frequency, `HyperLogLog` for trace cardinality, and `BloomFilter` for trace deduplication.
- **Optimization Strategy**: Memory remains constant O(1) regarding log size. Approximates full DFG edges using FNV-1a hashing into the sketches, falling back to an exact mapping via an interner for node frequencies where vocabulary constraints allow. 
- **Safety Features**: Strict state boundaries to prevent cross-trace edge spillage (the `prev_activity_id` clearing guard). Handles duplicates efficiently without unbounded allocation.