/**
 * End-to-End Test: wasm4pm autoprocess persistence and state management
 *
 * Complementary to the existing 30-autoprocess-e2e.test.ts, this scenario
 * focuses on the specific persistence and state recovery behavior of AutoProcess.
 *
 * Tests:
 * 1. Basic invocation: wasm4pm autoprocess <log.xes> --format json returns required fields
 * 2. Persistence across runs: State restored on subsequent runs with cycle count
 * 3. Error handling: Bad file paths return SOURCE_ERROR (exit code 2)
 *
 * Uses @wasm4pm/testing CLI harness and real XES fixtures from lab/fixtures/
 */
export {};
//# sourceMappingURL=31-autoprocess-persistence.test.d.ts.map