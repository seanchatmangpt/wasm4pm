/**
 * Shared CLI test utilities for playground scenarios.
 *
 * Re-exports from @wasm4pm/testing where possible — no duplication.
 * Adds only playground-specific helpers not available in the testing package.
 */

import { runCli, assertExitCode, type CliResult, EXIT_CODES } from '@wasm4pm/testing';
import * as path from 'path';
import * as url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const WASM4PM = path.resolve(__dirname, '../../apps/wasm4pm/dist/bin/wpm.js');
/** @deprecated Use WASM4PM instead. */
export const WASM4PM = WASM4PM;

/** Spawn the wasm4pm (wpm) CLI as a child process, capturing stdout/stderr/exitCode. */
export function wpm(
  userArgs: string[],
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<CliResult> {
  return runCli([WASM4PM, ...userArgs], {
    cliPath: 'node',
    timeout: options?.timeout ?? 30_000,
    env: options?.env,
  });
}

/**
 * Extract JSON object from CLI stdout.
 *
 * The CLI emits "[INFO] ..." log lines from WASM initialization before
 * the JSON payload. This helper skips those lines and parses the JSON.
 */
export function extractJson<T = Record<string, unknown>>(stdout: string): T {
  const jsonStart = stdout.indexOf('\n{');
  if (jsonStart === -1) return JSON.parse(stdout) as T;
  return JSON.parse(stdout.slice(jsonStart)) as T;
}

/**
 * Get combined output (stdout + stderr).
 *
 * The CLI writes JSON to stdout and human-formatted output to stderr
 * (via consola). This helper combines both for human-output assertions.
 */
export function combinedOutput(result: CliResult): string {
  return result.stdout + result.stderr;
}

/** @deprecated Use wpm instead. */
export const wasm4pm = wpm;

/** Resolve a path relative to the wasm4pm repo root. */
export function resolveRepo(...segments: string[]): string {
  return path.resolve(__dirname, '..', '..', ...segments);
}

// Re-export for convenience
export { assertExitCode, EXIT_CODES };
export type { CliResult };
