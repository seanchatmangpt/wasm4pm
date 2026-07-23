/**
 * Shared helpers for `wpm` CLI-contract regression tests.
 *
 * These tests EXECUTE the built CLI (`dist/bin/wpm.js`) via `execFile` —
 * they are black-box, end-to-end checks of real process behavior (exit
 * codes, stdout contract, receipts on disk), not unit tests of internal
 * functions. Convention matches `apps/wasm4pm/src/__tests__/status-cli.test.ts`.
 */
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Repo root — three levels up from this file (`src/__tests__/cli-contracts`). */
export const REPO_ROOT = path.resolve(__dirname, '../../../../..');
export const APP_ROOT = path.resolve(__dirname, '../../..');
export const CLI_PATH = path.join(APP_ROOT, 'dist/bin/wpm.js');

export function fixture(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

/**
 * Run the built `wpm` CLI with `args`, from `APP_ROOT` (same cwd convention
 * as the existing `*-cli.test.ts` suite) unless `cwd` is overridden.
 */
export function runCli(
  args: readonly string[],
  opts: { timeoutMs?: number; cwd?: string; input?: string } = {}
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const cwd = opts.cwd ?? APP_ROOT;
  // Minimal env prevents vitest's process.env from interfering with child-process stdout.
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, cwd, env },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
    if (opts.input !== undefined) {
      child.stdin?.write(opts.input);
      child.stdin?.end();
    }
  });
}

export function tryParseJson(s: string): unknown | undefined {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Write `content` to a fresh temp file under the OS tmpdir and return its path. */
export function writeTempFile(basename: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'wpm-cli-contracts-'));
  const p = path.join(dir, basename);
  fs.writeFileSync(p, content);
  return p;
}

/** Read the most recently written receipt (`<cwd>/.wasm4pm/receipts/latest.json`), or undefined. */
export function readLatestReceipt(cwd: string = APP_ROOT): Record<string, unknown> | undefined {
  const p = path.join(cwd, '.wasm4pm/receipts/latest.json');
  if (!fs.existsSync(p)) return undefined;
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
}
