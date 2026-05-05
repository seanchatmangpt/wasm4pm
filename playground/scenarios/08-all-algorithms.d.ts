/**
 * Scenario: All algorithms reachable through config, planner, and CLI
 *
 * Dev action simulated: "I added a new algorithm to the kernel. Is it
 * reachable from every layer a user would touch?"
 *
 * User paths covered:
 *   1. Config  — resolveConfig({ cliOverrides: { algorithm: X } }) accepts every ID
 *   2. Planner — plan() with algorithm override produces a valid plan for every ID
 *   3. CLI     — pictl run --algorithm X exits 0 or 3 (never 1=config or 2=source)
 *   4. CLI     — pictl compare with all 14 IDs comma-joined exits 0 or 3
 *
 * Driven by ALGORITHM_IDS from @wasm4pm/contracts — if a new algorithm is added
 * to the ontology and regenerated, this scenario covers it automatically.
 */
export {};
//# sourceMappingURL=08-all-algorithms.d.ts.map