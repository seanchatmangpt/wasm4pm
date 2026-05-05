/**
 * Scenario: DecisionGraph support — POWL non-block-structured choices
 *
 * Dev action simulated: "I added DecisionGraphNode to the POWL arena with
 * start_nodes, end_nodes, empty_path, and order relation. Does it parse correctly?
 * Does it convert to Petri Net with proper tau_split/tau_join wiring? Does
 * the JSON export include all DecisionGraph fields?"
 *
 * Key contracts verified:
 *   - DecisionGraph POWL string parses correctly as DecisionGraphNode
 *   - get_children() returns children arena indices
 *   - node_info_json() returns { type, children, edges, start_nodes, end_nodes, empty_path, node_count }
 *   - POWL → Petri Net produces init_dg/final_dg transitions
 *   - POWL → Process Tree handles DecisionGraph via DAG-based algorithm
 *   - Roundtrip: DecisionGraph → Petri Net → DecisionGraph preserves structure
 *
 * Binary: apps/wasm4pm/dist/bin/wasm4pm.js (must be built first)
 */
export {};
//# sourceMappingURL=13-decision-graph.d.ts.map