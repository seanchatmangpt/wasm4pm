# Algorithm Evaluation: bpmn_import

## Metadata
- **Algorithm ID**: `bpmn_import`
- **Category**: `discovery`
- **Supported Profiles**: `fast`, `balanced`, `quality`

## Status Proof
- **Registry**: ✅ Present
- **TypeScript Dispatch**: ✅ Present
- **CLI Surface**: ✅ Present
- **WASM Export**: ✅ Present

## Behavioral Evidence
- **Positive Cases**:
    - `bpmn_import.valid_minimal_log`: **PASSED**
- **Negative Cases**:
    - `bpmn_import.MalformedLogCase`: **FAILED_CORRECTLY** (Error: `MALFORMED_EVENT_LOG`)
    - `bpmn_import.EmptyLogCase`: **FAILED_CORRECTLY** (Error: `EMPTY_EVENT_LOG`)
- **Invariant Cases**:
    - `bpmn_import.DeterministicSameInputCase`: **PASSED** (Stable: true)

## Evidence Binding
- **Evidence Hash**: `2aaa368828466731e98015f745c278ea1f7d9d23c5a0d18a43f6859d33a245e1`
- **Verification State**: `Closed`

## Algorithmic Role
The `bpmn_import` algorithm facilitates the integration of industry-standard Business Process Model and Notation (BPMN) files into the wasm4pm ecosystem. It parses BPMN XML and converts it into internal process tree or Petri net representations, enabling conformance checking and simulation against real-world event logs.

## Implementation Validation & Details
The `bpmn_import` algorithm is implemented in Rust (`wasm4pm/src/bpmn_import.rs`). It converts BPMN 2.0 XML models into the internal POWL (Partially Ordered Workflow Language) format by:
- **XML Parsing**: Parsing the BPMN 2.0 XML document using the `roxmltree` crate to extract all relevant BPMN elements and sequence flows.
- **Element Mapping**: Translating standard BPMN elements to POWL node structures:
  - `<task>` nodes map to standard transitions.
  - `pm4py:silent` service tasks map to silent (tau) transitions.
  - `<parallelGateway>` splits/joins map to `StrictPartialOrder` blocks.
  - `<exclusiveGateway>` maps to `OperatorPowl(Xor)` or `OperatorPowl(Loop)` if a cyclic back-edge is detected.
- **Connector Resolution**: Providing transparent support for external tooling and `pm4py`-generated BPMNs by identifying and collapsing `pm4py:connector` service tasks directly into standard sequence edges.
- **Subtree Construction**: Recursively building a POWL subtree starting from the identified start events and combining multiple starts with a top-level XOR operator.
