/**
 * Scenario: POWL Discovery — 8 inductive miner variants
 *
 * Dev action simulated: "I implemented POWL discovery with 8 inductive miner variants
 * (tree, maximal, dynamic_clustering, decision_graph_max, decision_graph_clustering,
 * decision_graph_cyclic, decision_graph_cyclic_strict). Does it parse correctly? Does each variant
 * produce a valid POWL model? Do the WASM exports work correctly? Does the wasm4pm powl discover
 * command handle all variants?"
 *
 * Key contracts verified:
 *   - All 8 POWL discovery variants parse correctly and produce valid POWL models
 *   - discover_powl_from_log() works with all variant names
 *   - discover_powl_from_log_config() works with custom parameters
 *   - wasm4pm powl discover --variant <variant> executes successfully
 *   - Discovery handles empty logs, single activity, and complex logs
 *   - DecisionGraph nodes are created when appropriate
 *   - Partial order structure is preserved
 *
 * Binary: apps/wasm4pm/dist/bin/wasm4pm.js (must be built first)
 */
export {};
//# sourceMappingURL=14-powl-discovery.d.ts.map