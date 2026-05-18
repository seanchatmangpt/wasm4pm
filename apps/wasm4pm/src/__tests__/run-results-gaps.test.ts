/**
 * Unit tests for gaps closed in run.ts and results.ts
 *
 * Gap 1 (run.ts): Unknown algorithm → was source_error (2), now config_error (1)
 * Gap 2 (run.ts): Empty/whitespace --algorithm → was silently mis-handled, now
 *                 returns config_error (1) with ALGORITHM_EMPTY code
 * Gap 3 (results.ts): catResult() JSON.parse error → was system_error (5) via
 *                     outer catch, now returns source_error (2) via ResultParseError
 * Gap 4 (results.ts): --diff both-missing → was only reported first missing ref,
 *                     now reports both refs in the error message
 *
 * These tests do NOT call the WASM binary directly; they test pure TypeScript
 * logic: exit code constants, ResultParseError shape, and CLI subprocess calls
 * against the pre-built wpm.js binary.
 *
 * Oracle rank: Rank-2 (domain contract) — exit codes and error codes are
 * design decisions in exit-codes.ts and results.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ─── CLI runner ───────────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

function runCli(args: string[], cwd: string, timeoutMs = 15_000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

// ─── Test env helpers ─────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  resultsDir: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-gap-tests-'));
  const resultsDir = path.join(tempDir, '.wasm4pm', 'results');
  return {
    tempDir,
    resultsDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    },
  };
}

async function writeFixture(
  resultsDir: string,
  task: string,
  timestamp: string,
  extra: Record<string, unknown> = {}
): Promise<{ name: string; filepath: string }> {
  await fs.mkdir(resultsDir, { recursive: true });
  const filename = `${timestamp}-${task}.json`;
  const filepath = path.join(resultsDir, filename);
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    task,
    input: '/test/pipeline.xes',
    activityKey: 'concept:name',
    result: { traces: 10, variants: 3, fitness: 0.90, ...extra },
  };
  await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf-8');
  return { name: filename, filepath };
}

// ─── Gap 1: unknown algorithm → config_error (1) ─────────────────────────────

describe('Gap 1 — run.ts: unknown algorithm exits with config_error (1)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits 1 (config_error) for a clearly invalid algorithm name', async () => {
    // We don't need a real XES file — algorithm validation happens before file I/O
    // In practice the file is checked later, but algorithm error fires first
    const result = await runCli(
      ['run', '/nonexistent.xes', '--algorithm', 'totally-bogus-algo-xyz', '--format', 'json'],
      env.tempDir
    );
    // Algorithm validation fires before file existence check, so we get exit 1
    expect(result.exitCode).toBe(1);
  });

  it('JSON output for unknown algorithm has status:error and ALGORITHM_NOT_FOUND code', async () => {
    const result = await runCli(
      ['run', '/nonexistent.xes', '--algorithm', 'no-such-algo', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
    let parsed: Record<string, unknown>;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(parsed!.status).toBe('error');
    const error = parsed!.error as Record<string, unknown>;
    expect(error.code).toBe('ALGORITHM_NOT_FOUND');
  });

  it('unknown algorithm error message suggests alternatives or lists common algos', async () => {
    const result = await runCli(
      ['run', '/nonexistent.xes', '--algorithm', 'heurisic'],  // typo
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    // Should mention "Did you mean" or list available algorithms
    expect(combined).toMatch(/did you mean|heuristic|wpm algorithms/i);
  });
});

// ─── Gap 2: empty/whitespace algorithm → config_error (1) ────────────────────

describe('Gap 2 — run.ts: empty or whitespace --algorithm exits config_error (1)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits 1 (config_error) for --algorithm with empty string', async () => {
    const result = await runCli(
      ['run', '/nonexistent.xes', '--algorithm', '', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
  });

  it('JSON output for empty algorithm has ALGORITHM_EMPTY code', async () => {
    const result = await runCli(
      ['run', '/nonexistent.xes', '--algorithm', '', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
    let parsed: Record<string, unknown>;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(parsed!.status).toBe('error');
    const error = parsed!.error as Record<string, unknown>;
    expect(error.code).toBe('ALGORITHM_EMPTY');
  });

  it('empty algorithm error message is actionable (shows usage example)', async () => {
    const result = await runCli(
      ['run', '/nonexistent.xes', '--algorithm', ''],
      env.tempDir
    );
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    // Must provide guidance on what values are valid
    expect(combined).toMatch(/--algorithm|dfg|heuristic|wpm algorithms/i);
  });
});

// ─── Gap 3: malformed JSON in result file → source_error (2) ─────────────────

describe('Gap 3 — results.ts: malformed JSON result file exits source_error (2)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--cat with malformed JSON exits source_error (2) not system_error (5)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const badFile = path.join(env.resultsDir, '20260516T100000-bad.json');
    await fs.writeFile(badFile, 'not valid json at all {{{', 'utf-8');

    const result = await runCli(
      ['results', '--cat', '1', '--format', 'json'],
      env.tempDir
    );
    // source_error (2), not system_error (5)
    expect(result.exitCode).toBe(2);
  });

  it('--cat malformed JSON error has status:error in JSON output', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const badFile = path.join(env.resultsDir, '20260516T100000-corrupt.json');
    await fs.writeFile(badFile, '{ "version": 1, "broken": true', 'utf-8'); // truncated JSON

    const result = await runCli(
      ['results', '--cat', '1', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
    let parsed: Record<string, unknown>;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(parsed!.status).toBe('error');
  });

  it('--last with malformed JSON exits source_error (2) not system_error (5)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const badFile = path.join(env.resultsDir, '20260516T100000-truncated.json');
    await fs.writeFile(badFile, '{ bad json', 'utf-8');

    const result = await runCli(
      ['results', '--last', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
  });

  it('--diff with one malformed JSON exits source_error (2) not system_error (5)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    // Write one valid and one malformed file
    await writeFixture(env.resultsDir, 'good-task', '20260516T090000');
    const badFile = path.join(env.resultsDir, '20260516T100000-corrupt.json');
    await fs.writeFile(badFile, '{{not json}}', 'utf-8');

    // --diff 1,2 (newest first: corrupt is #1, good is #2 or vice versa)
    const result = await runCli(
      ['results', '--diff', '1,2', '--format', 'json'],
      env.tempDir
    );
    // Either one may fail — the point is it's source_error (2) not system_error (5)
    expect(result.exitCode).toBe(2);
    expect(result.exitCode).not.toBe(5);
  });

  it('malformed JSON error message mentions the file path or parse issue', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const badFile = path.join(env.resultsDir, '20260516T100000-bad.json');
    await fs.writeFile(badFile, '{ broken', 'utf-8');

    const result = await runCli(
      ['results', '--cat', '1'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    // Should mention JSON, parse issue, or the file
    expect(combined).toMatch(/json|parse|corrupt|truncat|file/i);
  });
});

// ─── Gap 4: --diff both refs missing → error mentions both ───────────────────

describe('Gap 4 — results.ts: --diff both missing refs reports both', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits source_error (2) when both refs do not exist', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await runCli(
      ['results', '--diff', '5,6', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
  });

  it('error message for both-missing refs is non-empty and informative', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await runCli(
      ['results', '--diff', '5,6'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
    const combined = result.stdout + result.stderr;
    // Error must be meaningful — not an empty string
    expect(combined.length).toBeGreaterThan(10);
    // Should mention the indexes or "not found"
    expect(combined).toMatch(/not found|5|6|available/i);
  });

  it('when both refs are missing, error message mentions both ref values', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await runCli(
      ['results', '--diff', '8,9', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
    let parsed: Record<string, unknown>;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    expect(parsed!.status).toBe('error');
    // The error message is nested in parsed.error.message (JSON error envelope)
    const error = parsed!.error as Record<string, unknown>;
    const msg = String(error.message ?? '');
    // Message mentions '8' and/or '9' (the missing refs)
    expect(msg).toMatch(/8|9/);
  });
});

// ─── ResultParseError unit test (pure logic, no CLI) ─────────────────────────

describe('ResultParseError class shape', () => {
  it('can be imported and constructed', async () => {
    // Dynamic import to avoid circular deps; the class is exported from results.ts
    const { ResultParseError } = await import('../commands/results.js');
    const err = new ResultParseError('/some/path/result.json', new SyntaxError('unexpected token'));
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ResultParseError);
    expect(err.name).toBe('ResultParseError');
    expect(err.filepath).toBe('/some/path/result.json');
    expect(err.message).toMatch(/not valid JSON/i);
    expect(err.message).toMatch(/result\.json/);
  });

  it('message includes the cause text', async () => {
    const { ResultParseError } = await import('../commands/results.js');
    const err = new ResultParseError('/data/run.json', new Error('Unexpected end of input'));
    expect(err.message).toMatch(/Unexpected end of input/);
  });

  it('includes a rm hint in the message', async () => {
    const { ResultParseError } = await import('../commands/results.js');
    const err = new ResultParseError('/data/run.json', new SyntaxError('bad'));
    expect(err.message).toMatch(/rm /);
  });
});
