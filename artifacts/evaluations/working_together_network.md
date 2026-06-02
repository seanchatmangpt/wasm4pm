# Algorithm Evaluation: working_together_network

## Identification
- **ID**: `working_together_network`
- **Category**: `discovery`
- **Status**: `Closed`

## Algorithmic Role
`working_together_network` is a social network analysis (SNA) algorithm that discovers collaboration patterns within an organization. It constructs a network where nodes represent resources (people, systems) and edges represent "working together" relationships, typically defined by resources co-occurring within the same process case. This provides insights into organizational structure and resource dependencies.

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
- **Evidence Hash**: `5890829c7ff974154576f61d6c7f30e3dc8de1feabf52fea76d57598c7d89d12`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/social_network.rs`
- **Core Function**: `discover_working_together_network_from_log`
- **Mechanism**: Social Network Analysis (SNA) component isolating global collaborative co-occurrence among agents. Extracts an unweighted/weighted graph where resources representing `org:resource` map to nodes, and any two individuals working in the same trace build edge co-occurrences.
- **Optimization Strategy**: Utilizes `HashSet` allocations per trace to establish a clean unified set of resources, guaranteeing nodes are not repetitively counted per trace but only cross-correlated once via exhaustive pairs combinations across sorted resource sets.
- **Determinism**: Edge serialization forces sorted lexically uniform sequence building (`sorted.sort()`), preventing random key iterations from hashing structures from altering graph output. Includes auxiliary modules for computing graph topology (Louvain community detection, clustering coefficients).