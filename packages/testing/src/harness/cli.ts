/**
 * CLI integration test helpers.
 *
 * Provides utilities to spawn wpm as a child process, capture stdout/stderr,
 * and assert on exit codes without depending on the actual CLI implementation.
 */

import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface CliTestEnv {
  tempDir: string;
  configPath: string;
  outputDir: string;
  env?: Record<string, string>;
  cleanup: () => Promise<void>;
}

/** Known exit codes — must match wpm exit-codes.ts */
export const EXIT_CODES = {
  success: 0,
  config_error: 1,
  source_error: 2,
  execution_error: 3,
  partial_failure: 4,
  system_error: 5,
  conformance_fail: 6,
} as const;

export type ExitCodeName = keyof typeof EXIT_CODES;

/**
 * Create an isolated temp environment for CLI tests.
 */
export async function createCliTestEnv(configContent?: string): Promise<CliTestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wasm4pm-cli-'));
  const outputDir = path.join(tempDir, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  const configPath = path.join(tempDir, 'wasm4pm.json');
  if (configContent) {
    await fs.writeFile(configPath, configContent, 'utf-8');
  }

  return {
    tempDir,
    configPath,
    outputDir,
    env: {},
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    },
  };
}

/**
 * Run a CLI command and capture output.
 */
export function runCli(
  args: string[],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    cliPath?: string;
  }
): Promise<CliResult> {
  // Default: directly invoke the built CLI binary to avoid npx resolution issues.
  // Tests can override via options.cliPath. Falls back to 'wpm' if dist not found.
  const defaultBinary = (() => {
    const candidates = [
      path.resolve(process.cwd(), 'apps/wasm4pm/dist/bin/wpm.js'),
      path.resolve(process.cwd(), '../../apps/wasm4pm/dist/bin/wpm.js'),
      path.resolve(process.cwd(), '../apps/wasm4pm/dist/bin/wpm.js'),
    ];
    for (const c of candidates) if (existsSync(c)) return c;
    return undefined;
  })();
  // When user explicitly provides cliPath, honor it as the executable verbatim.
  // When falling back to defaultBinary, run via `node <binary>`.
  let exec: string;
  let fullArgs: string[];
  if (options?.cliPath) {
    exec = options.cliPath;
    fullArgs = args;
  } else if (defaultBinary) {
    exec = process.execPath;
    fullArgs = [defaultBinary, ...args];
  } else {
    exec = 'npx';
    fullArgs = ['wasm4pm', ...args];
  }
  const timeout = options?.timeout ?? 30000;

  return new Promise((resolve) => {
    const start = Date.now();
    // Build minimal env to avoid vitest's process.env interference with child process stdout
    const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '', ...(options?.env || {}) };
    const child = execFile(
      exec,
      fullArgs,
      {
        cwd: options?.cwd,
        env,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '', durationMs });
      }
    );

    // Handle process timeout
    child.on('error', () => {
      resolve({
        exitCode: EXIT_CODES.system_error,
        stdout: '',
        stderr: 'Process failed to start',
        durationMs: Date.now() - start,
      });
    });
  });
}

/**
 * Assert that a CLI result matches expected exit code.
 */
export function assertExitCode(result: CliResult, expected: number): void {
  if (result.exitCode !== expected) {
    throw new Error(
      `Exit code mismatch: expected ${expected}, got ${result.exitCode}\n` +
        `stdout: ${result.stdout.slice(0, 500)}\n` +
        `stderr: ${result.stderr.slice(0, 500)}`
    );
  }
}

/**
 * Assert that stdout contains expected JSON.
 */
export function assertJsonOutput(result: CliResult): unknown {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Expected JSON stdout, got: ${result.stdout.slice(0, 500)}`);
  }
}

/**
 * Assert that stderr contains an error code.
 */
export function assertErrorCode(result: CliResult, errorCode: string): void {
  if (!result.stderr.includes(errorCode) && !result.stdout.includes(errorCode)) {
    throw new Error(
      `Expected error code '${errorCode}' in output\n` +
        `stdout: ${result.stdout.slice(0, 500)}\n` +
        `stderr: ${result.stderr.slice(0, 500)}`
    );
  }
}

/**
 * Write a config file and return its path.
 */
export async function writeTestConfig(
  dir: string,
  config: Record<string, unknown>,
  filename = 'wasm4pm.json'
): Promise<string> {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');
  return filePath;
}

/**
 * Read a receipt file from the output directory.
 */
export async function readReceipt(
  outputDir: string,
  filename = 'receipt.json'
): Promise<Record<string, unknown>> {
  const content = await fs.readFile(path.join(outputDir, filename), 'utf-8');
  return JSON.parse(content);
}
