/**
 * Scenario: CLI exit codes — wasm4pm exit code contract
 *
 * Dev action simulated: "I changed the algorithm dispatch table. Does bad input
 * still exit with the right code? Does JSON output still parse?"
 *
 * Runs against the real wasm4pm binary built from local source.
 * Binary: apps/wasm4pm/dist/bin/wasm4pm.js (must be built first: cd apps/wasm4pm && npm run build)
 *
 * Exit code contract:
 *   0  success
 *   1  config_error
 *   2  source_error   (missing file, unknown algorithm — yes, algorithm errors are 2 not 1)
 *   3  execution_error (WASM runtime failure)
 *   4  partial_failure
 *   5  system_error
 */
export {};
//# sourceMappingURL=04-cli-exit-codes.d.ts.map