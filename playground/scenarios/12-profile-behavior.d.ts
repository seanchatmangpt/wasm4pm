/**
 * Scenario: profile behavior — balanced vs quality step counts, compare, explain
 *
 * Dev action simulated: "I changed getProfileAlgorithms('quality') to add a
 * new algorithm. Do balanced and quality plans now differ in step count as
 * expected? Does `wasm4pm compare` show the right table columns? Does `wasm4pm
 * explain` return content for each algorithm?"
 *
 * Key contracts verified:
 *   Planner (in-process):
 *     - balanced plan has more discover_* steps than fast plan
 *     - quality plan has more discover_* steps than balanced plan
 *     - quality plan includes analyze_performance step, fast does not
 *     - getProfileAlgorithms('fast') and 'quality' are disjoint sets
 *   CLI compare:
 *     - wasm4pm compare dfg,heuristic exits 0 or 3
 *     - --format json has algorithms array, each entry has algorithm/nodes/edges/elapsedMs
 *   CLI explain:
 *     - --algorithm dfg exits 0 and stdout contains "Directly"
 *     - --format json has content and subject fields
 *
 * Binary: apps/wasm4pm/dist/bin/wasm4pm.js (must be built first)
 */
export {};
//# sourceMappingURL=12-profile-behavior.d.ts.map