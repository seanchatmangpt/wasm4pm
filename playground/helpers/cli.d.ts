/**
 * Shared CLI test utilities for playground scenarios.
 *
 * Re-exports from @pictl/testing where possible — no duplication.
 * Adds only playground-specific helpers not available in the testing package.
 */
import { assertExitCode, type CliResult, EXIT_CODES } from '@pictl/testing';
export declare const PICTL: string;
/** Spawn pictl CLI as a child process, capturing stdout/stderr/exitCode. */
export declare function pictl(userArgs: string[], options?: {
    timeout?: number;
    env?: Record<string, string>;
}): Promise<CliResult>;
/**
 * Extract JSON object from CLI stdout.
 *
 * The CLI emits "[INFO] ..." log lines from WASM initialization before
 * the JSON payload. This helper skips those lines and parses the JSON.
 */
export declare function extractJson<T = Record<string, unknown>>(stdout: string): T;
/**
 * Get combined output (stdout + stderr).
 *
 * The CLI writes JSON to stdout and human-formatted output to stderr
 * (via consola). This helper combines both for human-output assertions.
 */
export declare function combinedOutput(result: CliResult): string;
/** Resolve a path relative to the pictl repo root. */
export declare function resolveRepo(...segments: string[]): string;
export { assertExitCode, EXIT_CODES };
export type { CliResult };
//# sourceMappingURL=cli.d.ts.map