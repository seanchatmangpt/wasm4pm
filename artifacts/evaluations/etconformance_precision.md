# Algorithm Evaluation: etconformance_precision

## Meta
- **ID**: `etconformance_precision`
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
`2cf48cf0e06cabe9458eb7e1e35faaee23410d9acac834bd02175fa7765024a2`

## Verification State
**Closed**

## Algorithmic Role
Analyzes the precision of a process model compared to an event log, specifically identifying "extra" behavior allowed by the model that is not observed in reality. It is a critical metric for evaluating the quality and accuracy of discovered process models.

## Implementation Validation & Details
- **Source Module**: `wasm4pm/src/align_etconformance.rs`
- **Algorithm Type**: Alignment-based ETConformance precision calculation.
- **Implementation Mechanism**: Precision is quantified by measuring the proportion of transitions within the process model that are not utilized during alignment with the event log. 
- **Formula**: `1 - (escaping_edges / total_edges)`, where `escaping_edges` refers to model transitions never executed or used in alignments.
- **Data Extractor**: Extracts activities up to a configured `max_iterations` limit, compares them against the total structural edges of the underlying Petri Net, computing the precise coverage of the model structure.
