/**
 * Shared CLI test utilities for playground scenarios.
 *
 * Re-exports from @wasm4pm/testing where possible — no duplication.
 * Adds only playground-specific helpers not available in the testing package.
 */
import { runCli, assertExitCode, assertJsonOutput, EXIT_CODES } from '@wasm4pm/testing';
import * as path from 'path';
import * as url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const WASM4PM = path.resolve(__dirname, '../../apps/wasm4pm/dist/bin/wpm.js');
/** Spawn the wasm4pm (wpm) CLI as a child process, capturing stdout/stderr/exitCode.
 *
 * @param userArgs - CLI arguments
 * @param options - Options: timeout (ms), env (env vars), cwd (working directory)
 *   Note: if options is a string, it is treated as the cwd (backward compatibility)
 */
export function wpm(userArgs, options) {
    // Support passing cwd as second arg directly (legacy pattern)
    const opts = (typeof options === 'string') ? { cwd: options } : options;
    return runCli([WASM4PM, ...userArgs], {
        cliPath: 'node',
        timeout: opts?.timeout ?? 30000,
        env: opts?.env,
        cwd: opts?.cwd,
    });
}
/**
 * Extract JSON object from CLI stdout.
 *
 * The CLI emits "[INFO] ..." log lines from WASM initialization before
 * the JSON payload. This helper skips those lines and parses the JSON.
 */
export function extractJson(stdout) {
    const jsonStart = stdout.indexOf('\n{');
    if (jsonStart === -1)
        return JSON.parse(stdout);
    return JSON.parse(stdout.slice(jsonStart));
}
/**
 * Get combined output (stdout + stderr).
 *
 * The CLI writes JSON to stdout and human-formatted output to stderr
 * (via consola). This helper combines both for human-output assertions.
 */
export function combinedOutput(result) {
    return result.stdout + result.stderr;
}
/** Resolve a path relative to the wasm4pm repo root. */
export function resolveRepo(...segments) {
    return path.resolve(__dirname, '..', '..', ...segments);
}
/** Alias for wpm — backward compatibility with scenarios that import wasm4pm */
export const wasm4pm = wpm;
// Re-export for convenience
export { assertExitCode, assertJsonOutput, EXIT_CODES };
//# sourceMappingURL=cli.js.map