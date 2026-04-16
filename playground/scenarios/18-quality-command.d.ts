/**
 * Scenario: quality command — pictl quality <log.xes>
 *
 * Tests multi-dimensional quality assessment using real WASM.
 *
 * Key contracts verified:
 *   - Missing input exits 2 (source_error)
 *   - Missing file exits 2 (source_error)
 *   - Invalid metric exits 1 (config_error)
 *   - Valid log computes quality scores (fitness, precision, generalization, simplicity)
 *   - JSON output has status=success and quality scores field
 *   - Human output is readable and shows quality metrics
 *   - -i alias for input file works
 *   - --file alias for input file works
 *   - --activity-key flag is accepted
 *
 * Binary: apps/pictl/dist/bin/pictl.js (must be built first)
 */
export {};
//# sourceMappingURL=18-quality-command.d.ts.map