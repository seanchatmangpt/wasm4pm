# Algorithm Evaluation: yawl_export

## Identification
- **ID**: `yawl_export`
- **Category**: `discovery`
- **Status**: `Closed`

## Algorithmic Role
`yawl_export` is an interoperability algorithm that transforms a discovered process model (typically a process tree) into the YAWL (Yet Another Workflow Language) format. YAWL is a powerful workflow language based on Petri nets but extended with additional patterns, and this exporter allows models discovered in `wasm4pm` to be used in external YAWL-compliant workflow engines.

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
- **Evidence Hash**: `994fea1533b48c91b4263f15d692ee23e92ba9e52f0af6dc0d302d58ae3e58ad`
- **Verification State**: `Closed`

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/yawl_export.rs`
- **Core Function**: `powl_to_yawl` and `YawlExporter` mapping implementation
- **Mechanism**: Serializes complex Partially Ordered Workflow Language (POWL) graphs into compliant YAWL v6 XML schemas. Resolves graph variants ranging from transition conditions, XOR/Loop operators to flat decision bounds into YAWL components (`tasks`, `flows`, `inputCondition`, `outputCondition`).
- **Optimization Strategy**: Generates nodes incrementally with a stateful depth-first traversal of the `PowlArena`. Identifies and segregates task structures based on operational enum matching (`StrictPartialOrder`, `FrequentTransition`, etc.).
- **Safety Features**: Strictly limits parsing depths via `max_depth` configuration (default 1000) to preclude infinite stack recursion on deep trees. In-flight circular dependency mitigation utilizing an active `visited: HashSet` tracker preventing infinite cyclic traversal traps. Handles string/character escapes to ensure robust valid XML representations.