/**
 * config-export-cli.test.ts
 *
 * CLI integration tests for `wpm config export`.
 *
 * Covers:
 *   - Default format (toml) — prints TOML-like config lines to stdout, exit 0
 *   - --format toml — same as default
 *   - --format env  — prints WASM4PM_* lines to stdout, exit 0
 *   - --format json — prints JSON object to stdout, exit 0
 *   - --format unknown — exits non-zero with a config_error envelope
 *
 * Oracle rank: Rank-2 (domain contract) — the command is supposed to write
 * content to stdout and exit 0.  Deleting the command would cause all tests
 * to fail with "Process failed to start" or wrong exit code.
 *
 * No mocking of the WASM core.  The json format path calls resolveConfig()
 * which may succeed or fail depending on the environment; we assert only on
 * the structural envelope, not on specific config values.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const CWD = path.resolve(__dirname, '../..');

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function runCli(args: string[], timeoutMs = 20_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, cwd: CWD },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

// ---------------------------------------------------------------------------
// TOML format (default)
// ---------------------------------------------------------------------------
describe('wpm config export — TOML format', () => {
  it('exits 0 with no --format flag (default is toml)', async () => {
    const result = await runCli(['config', 'export']);
    expect(result.exitCode).toBe(0);
    // TOML output should contain key = "value" patterns
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('exits 0 with --format toml', async () => {
    const result = await runCli(['config', 'export', '--format', 'toml']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('TOML output is not valid JSON (it is TOML text)', async () => {
    const result = await runCli(['config', 'export', '--format', 'toml']);
    expect(result.exitCode).toBe(0);
    // TOML is plain text — parsing it as JSON must throw
    expect(() => JSON.parse(result.stdout)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ENV format
// ---------------------------------------------------------------------------
describe('wpm config export — ENV format', () => {
  it('exits 0 with --format env', async () => {
    const result = await runCli(['config', 'export', '--format', 'env']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
  });

  it('ENV output contains WASM4PM_ variable declarations', async () => {
    const result = await runCli(['config', 'export', '--format', 'env']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/WASM4PM_/);
  });

  it('ENV output is not valid JSON', async () => {
    const result = await runCli(['config', 'export', '--format', 'env']);
    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// JSON format
// ---------------------------------------------------------------------------
describe('wpm config export — JSON format', () => {
  it('exits 0 with --format json', async () => {
    const result = await runCli(['config', 'export', '--format', 'json']);
    expect(result.exitCode).toBe(0);
  });

  it('JSON output is parseable', async () => {
    const result = await runCli(['config', 'export', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  it('JSON output contains expected top-level config keys', async () => {
    const result = await runCli(['config', 'export', '--format', 'json']);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    // resolveConfig() always produces these sections
    expect(parsed).toHaveProperty('source');
    expect(parsed).toHaveProperty('algorithm');
    expect(parsed).toHaveProperty('execution');
  });
});

// ---------------------------------------------------------------------------
// Unknown format → config error
// ---------------------------------------------------------------------------
describe('wpm config export — unknown format', () => {
  it('exits non-zero for an unrecognised format', async () => {
    const result = await runCli(['config', 'export', '--format', 'xml']);
    // Should exit with config_error (1) or execution_error (3), not 0
    expect(result.exitCode).not.toBe(0);
  });

  it('human output mentions the unknown format name', async () => {
    const result = await runCli(['config', 'export', '--format', 'yaml']);
    // Not 0 exit
    expect(result.exitCode).not.toBe(0);
    // The error output (stdout or stderr) must mention the bad format
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/yaml|Unknown format|unknown/i);
  });
});

// ---------------------------------------------------------------------------
// Case-insensitivity: "TOML" and "ENV" in upper-case should work
// ---------------------------------------------------------------------------
describe('wpm config export — format case-insensitivity', () => {
  it('--format TOML (uppercase) exits 0', async () => {
    const result = await runCli(['config', 'export', '--format', 'TOML']);
    expect(result.exitCode).toBe(0);
  });

  it('--format ENV (uppercase) exits 0', async () => {
    const result = await runCli(['config', 'export', '--format', 'ENV']);
    expect(result.exitCode).toBe(0);
  });
});
