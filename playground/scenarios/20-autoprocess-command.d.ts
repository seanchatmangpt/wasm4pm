/**
 * Scenario: autoprocess command — pictl autoprocess <log.xes>
 *
 * JTBD: "I want to run my process through the autonomic control loop and understand
 * what the system decided to do about the current state — is my process healthy?"
 *
 * Tests the full Perception → Decision → Protection → Optimization cycle via the CLI.
 * No mocks — real @wasm4pm/engine, real WASM, real XES files.
 *
 * Key contracts verified:
 *   - Error handling: missing input, invalid path exits with correct code
 *   - Perception: event count, trace count, activities, health state extracted correctly
 *   - Decision: guard result, pattern result, pattern ticks computed
 *   - Protection: circuit breaker state, SPC results, special causes counted
 *   - Optimization: RL action selected (never empty)
 *   - Output formats: human and JSON produce valid output
 *   - Determinism: two runs produce identical structure and metrics
 *   - Real-scale: BPI 2020 (20MB+) processes without timeout/error
 *
 * Binary: apps/pictl/dist/bin/pictl.js (must be built first)
 */
export {};
//# sourceMappingURL=20-autoprocess-command.d.ts.map