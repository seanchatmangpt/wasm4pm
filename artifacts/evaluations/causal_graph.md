# Algorithm Evaluation: causal_graph

## Metadata
- **Algorithm ID**: `causal_graph`
- **Category**: `discovery`
- **Supported Profiles**: `fast`, `balanced`, `quality`

## Status Proof
- **Registry**: ✅ Present
- **TypeScript Dispatch**: ✅ Present
- **CLI Surface**: ✅ Present
- **WASM Export**: ✅ Present

## Behavioral Evidence
- **Positive Cases**:
    - `causal_graph.valid_minimal_log`: **PASSED**
- **Negative Cases**:
    - `causal_graph.MalformedLogCase`: **FAILED_CORRECTLY** (Error: `MALFORMED_EVENT_LOG`)
    - `causal_graph.EmptyLogCase`: **FAILED_CORRECTLY** (Error: `EMPTY_EVENT_LOG`)
- **Invariant Cases**:
    - `causal_graph.DeterministicSameInputCase`: **PASSED** (Stable: true)

## Evidence Binding
- **Evidence Hash**: `a3376bd7c90d869eba9bfc91bdfc1e2237a2732e48c40f258ec421f99e7d42a2`
- **Verification State**: `Closed`

## Algorithmic Role
The `causal_graph` algorithm discovers causal dependencies between activities by analyzing the temporal ordering and frequency of events. It constructs a directed graph where edges represent likely causal links (e.g., activity A triggers activity B), serving as a foundational step for discovering structured process models like Petri nets.

## Implementation Validation & Details
The `causal_graph` algorithm is implemented in Rust (`wasm4pm/src/causal_graph.rs`). It supports multiple heuristic strategies to identify causal dependencies directly from event logs:
- **Directly-Follows Frequencies**: Analyzing the event log to extract all activity pairs and computing their directly-follows frequency ($A \rightarrow B$).
- **Alpha Miner Variant**: The `discover_causal_alpha` implementation asserts a binary causal relation ($A \rightarrow B$) if activity $A$ directly follows $B$ with frequency $> 0$, and the reverse direction ($B \rightarrow A$) never occurs. The relation strength is mapped to 1000.
- **Heuristic Miner Variant**: The `discover_causal_heuristic` implementation calculates causal relation strengths using the formula $\max(0, \frac{|A \rightarrow B| - |B \rightarrow A|}{|A \rightarrow B| + |B \rightarrow A| + 1})$. Relations are returned if they exceed the user-provided threshold.
