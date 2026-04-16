/**
 * Scenario: WASM Benchmark Suite — All algorithms against real BPI 2020 data
 *
 * Measures wall-clock performance of every WASM-exported discovery algorithm,
 * POWL variant, and analytics function against the BPI 2020 Travel Permits
 * dataset (19.5 MB, ~7K cases, ~180K events).
 *
 * Output: structured JSON report written to results/wasm_bench_<timestamp>.json
 *        and a human-readable table to stdout.
 *
 * Usage:
 *   npx vitest run playground/scenarios/15-wasm-benchmarks.ts
 *
 * Binary: wasm4pm/pkg/wasm4pm.js + wasm4pm/pkg/wasm4pm_bg.wasm (must be built)
 * Data:   wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes
 */
export {};
//# sourceMappingURL=15-wasm-benchmarks.d.ts.map