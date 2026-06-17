# Algorithm Review: bpmn_import

## Algorithm ID & Domain
- **Algorithm ID**: `bpmn_import`
- **Domain**: Process Mining / Input-Output (BPMN 2.0 XML to POWL Conversion)

## Correctness Audit
- **XML Parsing Robustness**:
  - The parser uses `roxmltree::Document::parse(xml)` (line 90) to parse XML. Roxmltree is a modern, memory-safe, read-only DOM parser that prevents memory leaks and guarantees safety against malformed XML payloads.
- **Node Classification**:
  - Elements are classified into tasks, start events, end events, gateways, and connectors (lines 48-73). Custom namespace attributes like `pm4py:connector` and `pm4py:silent` are supported (lines 58-63) to identify virtual connector tasks and silent nodes.
- **Infinite Recursion / Cycle Guards**:
  - **Connector Chains**: In `resolve_through_connectors` (lines 174-196), a `visited` set tracks traversed connector IDs. If a cycle is detected, the loop breaks (line 182-184), preventing infinite loops in cyclic connector links.
  - **Subtree Construction**: In `build_subtree` (lines 267-454), a `visited` set tracks traversed node IDs. If a node is visited again (back-edge/cycle), it returns a silent transition (`tau` or silent transition, line 277) rather than recursing infinitely. This guarantees termination on any cyclic BPMN graph.
- **Gateway Loop Pattern Recognition**:
  - For Exclusive Gateways, the algorithm splits children into `forward_children` and `back_edge_children`. If there are back-edge children, it identifies a Loop pattern (lines 379-395) and returns a POWL `Loop` operator containing the do-branch and redo-branch. This is an elegant heuristic that maps structured BPMN loops into process trees.

## Improvement Areas
- **Inclusive Gateway Approximation**:
  - Inclusive Gateways are simplified to XOR operators (lines 423-434). In standard BPMN, Inclusive Gateways allow executing any non-empty subset of paths (OR semantics), whereas XOR only allows executing exactly one path. This is a lossy simplification, though typical for process tree conversions due to the complexity of OR splits.
- **Multiple Start Events**:
  - If multiple start events are found, they are wrapped in an XOR operator (lines 225-227), implying that the process starts with either one of them. While a reasonable default, some BPMN models allow multiple start events to represent concurrent entry points, which would be better mapped to Parallel splits.

## Code References
- **Rust Implementation**: `wasm4pm/src/bpmn_import.rs` (method: `bpmn_to_powl_string` / `read_bpmn`)
- **TypeScript Dispatch Wrapper**: `packages/kernel/src/api.ts` (method: `runRaw`, case `bpmn_import`)
- **Test File**: `packages/kernel/src/__tests__/algorithm-parity.test.ts`
