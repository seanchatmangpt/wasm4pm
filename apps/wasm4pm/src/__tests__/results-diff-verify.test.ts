/**
 * evidence report --diff and --verify CLI tests (was: wpm results --diff/--verify)
 *
 * Migrated from `wpm results` -> `wpm evidence report` (bridged, unmodified
 * `commands/results.ts` body — see nouns/evidence/report.ts).
 *
 * See results-cli.test.ts's file doc comment for the full writeup of the
 * bridging behavior verified live: on success (legacy `status: 'ok'`,
 * including a nonzero embedded `exit_code`) the full legacy envelope AND
 * exit code are preserved; on failure (legacy `status: 'error'`) the
 * envelope becomes `{ error: { code, message } }` and the exit code is
 * COARSENED — legacy config_error (1) and source_error (2) both collapse
 * to exit 2 (wpm's INVALID_INPUT -> source_error mapping). Every exit-code
 * expectation below that changed from the pre-migration original is called
 * out inline.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

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

function report(args: string[], cwd: string): Promise<CliResult> {
  return runCli(['evidence', 'report', ...args], cwd);
}

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

function errorOf(r: CliResult): { code: string; message: string } | undefined {
  return (JSON.parse(r.stdout) as { error?: { code: string; message: string } }).error;
}

// ─── --diff flag ──────────────────────────────────────────────────────────────

describe('evidence report --diff: malformed refs (no comma)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 2 when --diff has no comma (was 1 pre-migration — see file doc comment)', async () => {
    const result = await report(['--diff', 'onlyone'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('returns the new {error:{code,message}} envelope when --diff has no comma', async () => {
    const result = await report(['--diff', 'onlyone'], env.tempDir);
    const err = errorOf(result);
    expect(err).toBeDefined();
    expect(err!.code).toBe('INVALID_INPUT');
    expect(err!.message).toMatch(/diff|comma|two/i);
  });

  it('exits 2 when --diff has more than two parts (two commas)', async () => {
    const result = await report(['--diff', '1,2,3'], env.tempDir);
    expect(result.exitCode).toBe(2);
    expect(errorOf(result)).toBeDefined();
  });

  it('exits non-zero when --diff is a bare comma (two empty refs)', async () => {
    const result = await report(['--diff', ','], env.tempDir);
    expect(result.exitCode).not.toBe(0);
  });
});

describe('evidence report --diff: missing refs (valid format but non-existent)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 2 when both refs are indexes that do not exist', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await report(['--diff', '5,6'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits 2 when first ref does not exist', async () => {
    await writeFixture(env.resultsDir, 'first', '20260516T100000');
    await writeFixture(env.resultsDir, 'second', '20260516T110000');
    const result = await report(['--diff', '99,1'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits 2 when second ref does not exist', async () => {
    await writeFixture(env.resultsDir, 'first', '20260516T100000');
    await writeFixture(env.resultsDir, 'second', '20260516T110000');
    const result = await report(['--diff', '1,99'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('error envelope has code INVALID_INPUT', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await report(['--diff', '1,99'], env.tempDir);
    expect(result.exitCode).toBe(2);
    expect(errorOf(result)?.code).toBe('INVALID_INPUT');
  });

  it('exits 2 when ref is a non-existent filename (not index)', async () => {
    await writeFixture(env.resultsDir, 'real-task', '20260516T100000');
    const result = await report(['--diff', '20260101T000000-ghost.json,1'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits 2 when no results exist at all', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await report(['--diff', '1,2'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });
});

describe('evidence report --diff: successful comparison', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 when comparing two valid results by index', async () => {
    await writeFixture(env.resultsDir, 'run-alpha', '20260516T100000', { fitness: 0.85 });
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'run-heuristic', '20260516T110000', { fitness: 0.91 });
    const result = await report(['--diff', '1,2'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('JSON diff payload has left and right fields', async () => {
    await writeFixture(env.resultsDir, 'run-alpha', '20260516T100000', { fitness: 0.85 });
    await new Promise((r) => setTimeout(r, 30));
    await writeFixture(env.resultsDir, 'run-heuristic', '20260516T110000', { fitness: 0.91 });
    const result = await report(['--diff', '1,2'], env.tempDir);
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
    const result = await report(['--diff', '1,2'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const left = payload.left as Record<string, unknown>;
    const right = payload.right as Record<string, unknown>;
    expect([left.task, right.task].sort()).toEqual(['task-left', 'task-right'].sort());
  });

  it('can diff using filenames instead of indexes', async () => {
    const f1 = await writeFixture(env.resultsDir, 'alpha-run', '20260516T100000');
    const f2 = await writeFixture(env.resultsDir, 'heuristic-run', '20260516T110000');
    const result = await report(['--diff', `${f1.name},${f2.name}`], env.tempDir);
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as Record<string, unknown>).status).toBe('ok');
  });

  it('diff with same index twice exits 0 (self-comparison is valid)', async () => {
    await writeFixture(env.resultsDir, 'same-task', '20260516T100000');
    const result = await report(['--diff', '1,1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    expect((JSON.parse(result.stdout) as Record<string, unknown>).status).toBe('ok');
  });
});

// ─── --verify flag ────────────────────────────────────────────────────────────

describe('evidence report --verify: ref not found', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 2 when ref does not exist (empty dir)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await report(['--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits 2 when index is out of range', async () => {
    await writeFixture(env.resultsDir, 'only-one', '20260516T100000');
    const result = await report(['--verify', '99'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('exits 2 when filename ref does not match any file', async () => {
    await writeFixture(env.resultsDir, 'real', '20260516T100000');
    const result = await report(['--verify', '20260101T000000-ghost.json'], env.tempDir);
    expect(result.exitCode).toBe(2);
  });

  it('error envelope has code INVALID_INPUT when ref not found', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await report(['--verify', 'phantom'], env.tempDir);
    expect(result.exitCode).toBe(2);
    expect(errorOf(result)?.code).toBe('INVALID_INPUT');
  });
});

describe('evidence report --verify: valid ref (no matching receipt)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 when result exists but no receipt (integrity=no_receipt)', async () => {
    await writeFixture(env.resultsDir, 'some-task', '20260516T100000');
    const result = await report(['--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('JSON verify payload has integrity: no_receipt', async () => {
    await writeFixture(env.resultsDir, 'some-task', '20260516T100000');
    const result = await report(['--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('integrity');
    expect(payload.integrity).toBe('no_receipt');
  });

  it('verify payload has recomputed_output_hash as a BLAKE3 hex-64 string', async () => {
    await writeFixture(env.resultsDir, 'hash-task', '20260516T100000');
    const result = await report(['--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(typeof payload.recomputed_output_hash).toBe('string');
    expect(payload.recomputed_output_hash as string).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verify payload has receipt_found: false when no receipts dir', async () => {
    await writeFixture(env.resultsDir, 'unreceipted', '20260516T100000');
    const result = await report(['--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.receipt_found).toBe(false);
  });

  it('verify payload has result_file field with .json extension', async () => {
    await writeFixture(env.resultsDir, 'my-task', '20260516T100000');
    const result = await report(['--verify', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(typeof payload.result_file).toBe('string');
    expect((payload.result_file as string).endsWith('.json')).toBe(true);
  });

  it('verify by filename also exits 0 with no_receipt', async () => {
    const fixture = await writeFixture(env.resultsDir, 'my-task', '20260516T100000');
    const result = await report(['--verify', fixture.name], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.integrity).toBe('no_receipt');
  });
});

// ─── --limit flag ─────────────────────────────────────────────────────────────

describe('evidence report --limit', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('--limit 1 shows only 1 result when 3 exist', async () => {
    await writeFixture(env.resultsDir, 'task-a', '20260516T100000');
    await writeFixture(env.resultsDir, 'task-b', '20260516T110000');
    await writeFixture(env.resultsDir, 'task-c', '20260516T120000');
    const result = await report(['--limit', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.count).toBe(3);
    expect(payload.showing).toBe(1);
    expect((payload.results as unknown[]).length).toBe(1);
  });

  it('--limit 0 shows 0 results but exits 0', async () => {
    await writeFixture(env.resultsDir, 'task-a', '20260516T100000');
    const result = await report(['--limit', '0'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.showing).toBe(0);
    expect((payload.results as unknown[]).length).toBe(0);
  });

  it('--limit with non-numeric value exits 2 (INVALID_INPUT — was config_error 1 pre-migration)', async () => {
    const result = await report(['--limit', 'notanumber'], env.tempDir);
    expect(result.exitCode).toBe(2);
    expect(errorOf(result)?.code).toBe('INVALID_INPUT');
  });

  it('--limit exceeding total count returns all results', async () => {
    await writeFixture(env.resultsDir, 'task-a', '20260516T100000');
    await writeFixture(env.resultsDir, 'task-b', '20260516T110000');
    const result = await report(['--limit', '100'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.count).toBe(2);
    expect(payload.showing).toBe(2);
  });
});

// ─── --verbose / --quiet flags ────────────────────────────────────────────────

describe('evidence report --verbose / --quiet', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('--verbose exits 0 with saved results', async () => {
    await writeFixture(env.resultsDir, 'task-x', '20260516T100000');
    const result = await report(['--verbose'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('-v short alias works the same as --verbose', async () => {
    await writeFixture(env.resultsDir, 'task-x', '20260516T100000');
    const result = await report(['-v'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('--quiet exits 0 when results exist', async () => {
    await writeFixture(env.resultsDir, 'task-q', '20260516T100000');
    const result = await report(['--quiet'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('-q short alias works', async () => {
    await writeFixture(env.resultsDir, 'task-q', '20260516T100000');
    const result = await report(['-q'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });
});

// ─── --path flag ──────────────────────────────────────────────────────────────

describe('evidence report --path', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('--path with an existing file within cwd returns the cat payload', async () => {
    const fixture = await writeFixture(env.resultsDir, 'path-task', '20260516T100000');
    const result = await report(['--path', fixture.filepath], env.tempDir);
    expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('cat');
    expect((payload.cat as Record<string, unknown>).task).toBe('path-task');
  });

  it('--path with non-existent file exits 2 (INVALID_INPUT)', async () => {
    const result = await report(['--path', '/nonexistent/path/to/result.json'], env.tempDir);
    expect(result.exitCode).toBe(2);
    expect(errorOf(result)?.code).toBe('INVALID_INPUT');
  });

  it('-p short alias works for --path', async () => {
    const fixture = await writeFixture(env.resultsDir, 'alias-task', '20260516T100000');
    const result = await report(['-p', fixture.filepath], env.tempDir);
    expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
    expect((JSON.parse(result.stdout) as Record<string, unknown>).status).toBe('ok');
  });
});
