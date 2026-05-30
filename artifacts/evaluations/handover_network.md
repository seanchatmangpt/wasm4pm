# Algorithm Evaluation: handover_network

## Meta
- **ID**: `handover_network`
- **Category**: `discovery`
- **Profiles**: `fast`, `balanced`, `quality`

## Status
- **Registry**: Present
- **Dispatch**: Present
- **CLI**: Present
- **WASM**: Present

## Behavior Evidence
- **Positive Case**: `passed`
- **Negative Cases**:
  - `MALFORMED_EVENT_LOG`: `failed_correctly`
  - `EMPTY_EVENT_LOG`: `failed_correctly`
- **Invariant Case**: `passed` (Stable: `true`)

## Evidence Hash
`067adf3e553a8dcd8813574a9a2bf8bcc342a6298d1a41d5d82474c65e22d578`

## Verification State
**Closed**

## Algorithmic Role
Analyzes the social network aspect of a process by identifying "handover-of-work" patterns between organizational resources. It maps resource pairs that directly succeed each other in process traces, providing insights into collaboration patterns and organizational structure.

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/social_network.rs`
- **Algorithm Type**: Social network graph discovery.
- **Implementation Mechanism**: Traverses traces to observe direct, sequential interactions between designated resource entities (configured via the `resource_key`, e.g., `org:resource`). It tracks state transitions where consecutive events are handled by different individuals (`r1 != r2`).
- **Data Capture**: Aggregates the total workload distribution per resource while computing handover frequencies on directed edges representing a hand-off of work.
- **Network Complement**: Implements an alternative dimension, `discover_working_together_network_from_log`, capable of highlighting co-occurrences of resources within the same trace irrespective of direct sequencing.
