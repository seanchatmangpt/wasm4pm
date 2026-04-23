/**
 * Scenario: validate command — pictl validate <log.xes>
 *
 * Tests log/schema validation against real XES files.
 * Uses real WASM — no mocks.
 *
 * Key contracts verified:
 *   - Missing input exits 2 (source_error)
 *   - Missing file exits 2 (source_error)
 *   - Valid XES log passes validation (exit 0)
 *   - Human output contains validation header and file path
 *   - Invalid format exits 1 (config_error)
 *   - -i alias for input file works
 *   - --file alias for input file works
 *
 * NOTE: validate does NOT support --format json. The --format flag controls
 *       input format (xes or csv), not output format. Output is always human.
 *       Also note: consola filters log-level messages in test capture, so
 *       assertions target warn/success level output that IS captured.
 *
 * Binary: apps/pictl/dist/bin/pictl.js (must be built first)
 */
export {};
//# sourceMappingURL=17-validate-command.d.ts.map