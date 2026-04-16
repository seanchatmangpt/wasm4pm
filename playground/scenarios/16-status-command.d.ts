/**
 * Scenario: status command — pictl status
 *
 * Tests the system health and WASM module status endpoint.
 * Uses real WASM — no mocks.
 *
 * Key contracts verified:
 *   - pictl status exits 0 (success)
 *   - JSON output contains engine, system, memory sections
 *   - engine.wasmLoaded is true
 *   - engine.state is "ready"
 *   - system fields (platform, arch, nodeVersion) are present
 *   - memory fields (heapUsed, heapTotal, rss) are numbers
 *   - WASM version field exists
 *
 * NOTE: Human output tests are limited because consola filters log-level
 *       messages in child process capture. Only JSON output is fully verifiable.
 *
 * Binary: apps/pictl/dist/bin/pictl.js (must be built first)
 */
export {};
//# sourceMappingURL=16-status-command.d.ts.map