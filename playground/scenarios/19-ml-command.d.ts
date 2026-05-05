/**
 * Scenario: ml command — pictl ml <task> -i <log.xes>
 *
 * Tests ML-powered process mining using real WASM and real XES files.
 * No mocks — real @wasm4pm/ml package with real algorithm execution.
 *
 * Key contracts verified:
 *   - Missing task exits with error (exit 1)
 *   - Invalid task exits with error (exit 2)
 *   - Missing input exits with error (exit 1)
 *   - classify, cluster, forecast, anomaly, regress produce output (exit 0)
 *   - pca exits 3 when data has insufficient features (known limitation)
 *   - JSON output has task field matching the requested task
 *   - Each task has expected data fields (predictions, assignments, etc.)
 *   - Results are deterministic across runs
 *   - --activity-key, --method, --k flags work
 *
 * Binary: apps/pictl/dist/bin/pictl.js (must be built first)
 */
export {};
//# sourceMappingURL=19-ml-command.d.ts.map