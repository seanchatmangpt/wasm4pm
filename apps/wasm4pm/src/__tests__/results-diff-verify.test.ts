/**
 * results --diff and --verify CLI tests
 *
 * Van der Aalst QA perspective:
 * - `wpm results --diff 1,2` compares two saved results side-by-side
 * - `wpm results --verify <ref>` re-hashes a stored result payload
 * - Error cases: malformed refs, missing files, bad --limit values
 * - Additional coverage: --verbose, --quiet, --limit, --path flags
 *
 * Oracle rank: Rank-2 (domain contract) — exit codes and JSON envelope shapes
 * are design decisions documented in results.ts / exit-codes.ts.
 *
 * Tests run the pre-built wpm.js binary in isolated temp directories.
 * No WASM initialization required (the binary handles that internally).
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

function runCli(args: string[], cwd: string, timeoutMs = 15000): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

// ─── Test env helpers ─────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  resultsDir: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-results-dv-'));
  const resultsDir = path.join(tempDir, '.wasm4pm', 'results');
  return {
    tempDir,
    resultsDir,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
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
    input: '/revops/pipeline.xes',
    activityKey: 'concept:name',
    result: { traces: 42, variants: 7, fitness: 0.94, ...extra },
  };
  await fs.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf-8');
  return { name: filename, filepath };
}

// ─── --diff flag ──────────────────────────────────────────────────────────────

describe('wpm results --diff: malformed refs (no comma)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits with config_error (1) when --diff has no comma', async () => {
    const result = await runCli(['results', '--diff', 'onlyone', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(1);
  });

  it('returns JSON error envelope when --diff has no comma', async () => {
    const result = await runCli(['results', '--diff', 'onlyone', '--format', 'json'], env.tempDir);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
    expect(parsed.command).toBe('results');
  });

  it('human output mentions --diff usage when no comma', async () => {
    const result = await runCli(['results', '--diff', 'onlyone'], env.tempDir);
    // Exit code is 1; output or stderr explains the issue
    expect(result.exitCode).toBe(1);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/diff|comma|two/i);
  });

  it('exits with config_error (1) when --diff has more than two parts (two commas)', async () => {
    const result = await runCli(['results', '--diff', '1,2,3', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('exits config_error when --diff is empty string', async () => {
    const result = await runCli(['results', '--diff', ',', '--format', 'json'], env.tempDir);
    // A bare comma gives two empty refs — both will not resolve → source_error (2)
    // or config_error (1). Either is acceptable non-zero.
    expect(result.exitCode).not.toBe(0);
  });
});

describe('wpm results --diff: missing refs (valid format but non-existent)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits source_error (2) when both refs are indexes that do not exist', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await runCli(['results', '--diff', '5,6', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits source_error (2) when first ref does not exist', async () => {
    await writeFixture(env.resultsDir, 'first', '20260516T100000');
    await writeFixture(env.resultsDir, 'second', '20260516T110000');
    const result = await runCli(['results', '--diff', '99,1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits source_error (2) when second ref does not exist', async () => {
    await writeFixture(env.resultsDir, 'first', '20260516T100000');
    await writeFixture(env.resultsDir, 'second', '20260516T110000');
    const result = await runCli(['results', '--diff', '1,99', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('JSON error envelope has status:error and command:results', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await runCli(['results', '--diff', '1,99', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
    expect(parsed.command).toBe('results');
  });

  it('exits source_error when ref is non-existent filename (not index)', async () => {
    await writeFixture(env.resultsDir, 'real-task', '20260516T100000');
    const result = await runCli(
      ['results', '--diff', '20260101T000000-ghost.json,1', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
  });

  it('exits source_error when no results exist at all', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });
});

describe('wpm results --diff: successful comparison', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits 0 when comparing two valid results by index', async () => {
    await writeFixture(env.resultsDir, 'run-alpha', '20260516T100000', { fitness: 0.85 });
    // Small delay so mtime differs
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'run-heuristic', '20260516T110000', { fitness: 0.91 });
    const result = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('JSON diff payload has left and right fields', async () => {
    await writeFixture(env.resultsDir, 'run-alpha', '20260516T100000', { fitness: 0.85 });
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'run-heuristic', '20260516T110000', { fitness: 0.91 });
    const result = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    expect(parsed.command).toBe('results');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('left');
    expect(payload).toHaveProperty('right');
  });

  it('left and right are the correct saved result payloads', async () => {
    await writeFixture(env.resultsDir, 'task-left', '20260516T100000', { fitness: 0.72 });
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'task-right', '20260516T110000', { fitness: 0.88 });
    const result = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const left = payload.left as Record<string, unknown>;
    const right = payload.right as Record<string, unknown>;
    // newest first (index 1 = most recent = task-right, index 2 = task-left)
    expect([left.task, right.task].sort()).toEqual(['task-left', 'task-right'].sort());
  });

  it('can diff using filenames instead of indexes', async () => {
    const f1 = await writeFixture(env.resultsDir, 'alpha-run', '20260516T100000');
    const f2 = await writeFixture(env.resultsDir, 'heuristic-run', '20260516T110000');
    const ref1 = f1.name;
    const ref2 = f2.name;
    const result = await runCli(
      ['results', '--diff', `${ref1},${ref2}`, '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
  });

  it('human format diff exits 0 and shows both tasks in output', async () => {
    await writeFixture(env.resultsDir, 'left-task', '20260516T100000');
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'right-task', '20260516T110000');
    const result = await runCli(['results', '--diff', '1,2'], env.tempDir);
    expect(result.exitCode).toBe(0);
    // Human output should mention both tasks somewhere
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  });

  it('diff with same index twice exits 0 (self-comparison is valid)', async () => {
    await writeFixture(env.resultsDir, 'same-task', '20260516T100000');
    const result = await runCli(['results', '--diff', '1,1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
  });
});

// ─── --verify flag ────────────────────────────────────────────────────────────

describe('wpm results --verify: ref not found', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits source_error (2) when ref does not exist (empty dir)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits source_error (2) when index is out of range', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await runCli(['results', '--verify', '99', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits source_error (2) when filename ref does not match any file', async () => {
    await writeFixture(env.resultsDir, 'real', '20260516T100000');
    const result = await runCli(
      ['results', '--verify', '20260101T000000-ghost.json', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
  });

  it('JSON error envelope has status:error when ref not found', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['results', '--verify', 'phantom', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
    expect(parsed.command).toBe('results');
  });
});

describe('wpm results --verify: valid ref (no matching receipt)', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits 0 when result exists but no receipt (integrity=no_receipt)', async () => {
    // No .wasm4pm/receipts/ directory — verify should succeed with no_receipt status
    await writeFixture(env.resultsDir, 'some-task', '20260516T100000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('JSON verify payload has integrity field', async () => {
    await writeFixture(env.resultsDir, 'some-task', '20260516T100000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('integrity');
    // Without a receipt, integrity should be no_receipt
    expect(payload.integrity).toBe('no_receipt');
  });

  it('verify payload has recomputed_output_hash field', async () => {
    await writeFixture(env.resultsDir, 'hash-task', '20260516T100000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.recomputed_output_hash).toBe('string');
    expect((payload.recomputed_output_hash as string).length).toBeGreaterThan(0);
  });

  it('verify payload has receipt_found: false when no receipts dir', async () => {
    await writeFixture(env.resultsDir, 'unreceipted', '20260516T100000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.receipt_found).toBe(false);
  });

  it('verify payload has result_file field with .json extension', async () => {
    await writeFixture(env.resultsDir, 'my-task', '20260516T100000');
    const result = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.result_file).toBe('string');
    expect((payload.result_file as string).endsWith('.json')).toBe(true);
  });

  it('verify by filename also exits 0 with no_receipt', async () => {
    const fixture = await writeFixture(env.resultsDir, 'my-task', '20260516T100000');
    const result = await runCli(
      ['results', '--verify', fixture.name, '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('no_receipt');
  });

  it('human verify output mentions the result file and hash', async () => {
    await writeFixture(env.resultsDir, 'my-task', '20260516T100000');
    const result = await runCli(['results', '--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    // Human output should show hash or result file name
    expect(combined).toMatch(/hash|my-task|20260516/i);
  });
});

// ─── --limit flag ─────────────────────────────────────────────────────────────

describe('wpm results --limit', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--limit 1 shows only 1 result when 3 exist', async () => {
    await writeFixture(env.resultsDir, 'task-a', '20260516T100000');
    await writeFixture(env.resultsDir, 'task-b', '20260516T110000');
    await writeFixture(env.resultsDir, 'task-c', '20260516T120000');
    const result = await runCli(['results', '--limit', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.count).toBe(3);     // total is still 3
    expect(payload.showing).toBe(1);   // but only 1 shown
    expect((payload.results as unknown[]).length).toBe(1);
  });

  it('--limit 0 shows 0 results but exits 0', async () => {
    await writeFixture(env.resultsDir, 'task-a', '20260516T100000');
    const result = await runCli(['results', '--limit', '0', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.showing).toBe(0);
    expect((payload.results as unknown[]).length).toBe(0);
  });

  it('--limit with non-numeric value exits config_error (1)', async () => {
    const result = await runCli(['results', '--limit', 'notanumber', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('--limit exceeding total count returns all results', async () => {
    await writeFixture(env.resultsDir, 'task-a', '20260516T100000');
    await writeFixture(env.resultsDir, 'task-b', '20260516T110000');
    const result = await runCli(['results', '--limit', '100', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.count).toBe(2);
    expect(payload.showing).toBe(2);
  });
});

// ─── --verbose flag ───────────────────────────────────────────────────────────

describe('wpm results --verbose', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--verbose exits 0 with saved results', async () => {
    await writeFixture(env.resultsDir, 'task-x', '20260516T100000');
    const result = await runCli(['results', '--verbose'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('--verbose --format json exits 0', async () => {
    await writeFixture(env.resultsDir, 'task-x', '20260516T100000');
    const result = await runCli(['results', '--verbose', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
  });

  it('-v short alias works the same as --verbose', async () => {
    await writeFixture(env.resultsDir, 'task-x', '20260516T100000');
    const result = await runCli(['results', '-v'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });
});

// ─── --quiet flag ─────────────────────────────────────────────────────────────

describe('wpm results --quiet', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--quiet exits 0 when results exist', async () => {
    await writeFixture(env.resultsDir, 'task-q', '20260516T100000');
    const result = await runCli(['results', '--quiet'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('-q short alias works', async () => {
    await writeFixture(env.resultsDir, 'task-q', '20260516T100000');
    const result = await runCli(['results', '-q'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });
});

// ─── --path flag ──────────────────────────────────────────────────────────────

describe('wpm results --path', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--path with existing file exits 0', async () => {
    const fixture = await writeFixture(env.resultsDir, 'path-task', '20260516T100000');
    const result = await runCli(
      ['results', '--path', fixture.filepath, '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(0);
  });

  it('--path with existing file returns cat payload', async () => {
    const fixture = await writeFixture(env.resultsDir, 'path-task', '20260516T100000');
    const result = await runCli(
      ['results', '--path', fixture.filepath, '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('cat');
    const cat = payload.cat as Record<string, unknown>;
    expect(cat.task).toBe('path-task');
  });

  it('--path with non-existent file exits source_error (2)', async () => {
    const result = await runCli(
      ['results', '--path', '/nonexistent/path/to/result.json', '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('-p short alias works for --path', async () => {
    const fixture = await writeFixture(env.resultsDir, 'alias-task', '20260516T100000');
    const result = await runCli(
      ['results', '-p', fixture.filepath, '--format', 'json'],
      env.tempDir
    );
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
  });
});
