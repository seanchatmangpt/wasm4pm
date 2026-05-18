/**
 * results CLI integration tests — list, --last, empty directory
 *
 * Van der Aalst QA perspective:
 * - `wpm results --format json` lists saved results from .wasm4pm/results/
 * - `wpm results --last --format json` returns the most recent result
 * - `wpm results` (empty dir) exits 0 with empty list message
 * - `wpm results --cat 1 --format json` returns the first result by index
 *
 * All tests use an isolated temp directory as cwd to avoid polluting
 * the real .wasm4pm/results/ directory.
 *
 * Tests operate at the CLI level (subprocess) using the pre-built wpm.js
 * binary. The binary must exist at apps/wasm4pm/dist/bin/wpm.js.
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

// ─── Fixture builder ──────────────────────────────────────────────────────────

interface TestEnv {
  tempDir: string;
  resultsDir: string;
  cleanup: () => Promise<void>;
}

async function createTestEnv(): Promise<TestEnv> {
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-results-cli-'));
  const resultsDir = path.join(tempDir, '.wasm4pm', 'results');
  return {
    tempDir,
    resultsDir,
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
 * Write a valid SavedResult fixture JSON into the results directory.
 * The filename follows the {YYYYMMDDTHHmmss}-{task}.json convention.
 */
async function writeFixture(
  resultsDir: string,
  task: string,
  timestamp: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
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
  return filepath;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('wpm results: empty directory', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
    // Create the results dir but leave it empty
    await fs.mkdir(env.resultsDir, { recursive: true });
  });
  afterEach(async () => { await env.cleanup(); });

  it('exits 0 when .wasm4pm/results/ is empty', async () => {
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
  });

  it('returns JSON with count:0 and empty results array when no files', async () => {
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    let parsed: Record<string, unknown>;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    const p = parsed!;
    // Outer envelope
    expect(p.command).toBe('results');
    expect(p.status).toBe('ok');
    // Payload
    const payload = p.payload as Record<string, unknown>;
    expect(typeof payload.count).toBe('number');
    expect(payload.count).toBe(0);
    expect(Array.isArray(payload.results)).toBe(true);
    expect((payload.results as unknown[]).length).toBe(0);
  });

  it('exits 0 with no --format flag (human output) when directory is empty', async () => {
    const result = await runCli(['results'], env.tempDir);
    expect(result.exitCode).toBe(0);
    // The human output mentions the results directory and save hints when empty
    expect(result.stdout).toMatch(/Results are saved automatically|No saved results/i);
  });
});

describe('wpm results: listing with saved fixtures', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--format json lists saved result files with correct envelope', async () => {
    await writeFixture(env.resultsDir, 'next-activity', '20260516T120000');
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    let parsed: Record<string, unknown>;
    expect(() => { parsed = JSON.parse(result.stdout); }).not.toThrow();
    const p = parsed!;
    expect(p.command).toBe('results');
    expect(p.status).toBe('ok');

    const payload = p.payload as Record<string, unknown>;
    expect(typeof payload.count).toBe('number');
    expect((payload.count as number)).toBeGreaterThan(0);
    expect(Array.isArray(payload.results)).toBe(true);
    expect((payload.results as unknown[]).length).toBeGreaterThan(0);
  });

  it('lists multiple fixtures and shows correct count', async () => {
    await writeFixture(env.resultsDir, 'next-activity', '20260516T100000');
    await writeFixture(env.resultsDir, 'remaining-time', '20260516T110000');
    await writeFixture(env.resultsDir, 'outcome', '20260516T120000');

    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.count).toBe(3);
    expect((payload.results as unknown[]).length).toBe(3);
  });

  it('each result entry has name, filepath, and savedAt fields', async () => {
    await writeFixture(env.resultsDir, 'drift', '20260516T130000');
    const result = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const entries = payload.results as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries[0];
    expect(typeof entry.name).toBe('string');
    expect((entry.name as string).endsWith('.json')).toBe(true);
    expect(typeof entry.filepath).toBe('string');
    expect(typeof entry.savedAt).toBe('string');
    expect(typeof entry.index).toBe('number');
  });

  it('human-format listing includes result filenames in stdout', async () => {
    await writeFixture(env.resultsDir, 'features', '20260516T140000');
    const result = await runCli(['results'], env.tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/features/);
  });
});

describe('wpm results --last', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('exits 0 with empty results when no saved files exist', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await runCli(['results', '--last', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);
    // Returns empty list when no files
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
  });

  it('returns the most recent result when multiple files exist', async () => {
    // Create older first, newer second — sorted by mtime
    await writeFixture(env.resultsDir, 'older-task', '20260516T090000');
    // Small delay so mtime is distinct
    await new Promise((r) => setTimeout(r, 50));
    await writeFixture(env.resultsDir, 'newer-task', '20260516T100000');

    const result = await runCli(['results', '--last', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');

    // The cat payload should contain the saved result data
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('cat');
    const cat = payload.cat as Record<string, unknown>;
    // The most recently modified file should be the newer-task
    expect(cat.task).toBe('newer-task');
  });

  it('result cat payload has correct SavedResult shape', async () => {
    await writeFixture(env.resultsDir, 'resource', '20260516T120000', { agents: 3 });
    const result = await runCli(['results', '--last', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    const cat = payload.cat as Record<string, unknown>;
    expect(cat.version).toBe(1);
    expect(cat.task).toBe('resource');
    expect(cat.input).toBe('/revops/pipeline.xes');
    expect(cat.activityKey).toBe('concept:name');
    expect(cat).toHaveProperty('result');
  });
});

describe('wpm results --cat', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--cat 1 returns the first listed result (index-based)', async () => {
    await writeFixture(env.resultsDir, 'first-task', '20260516T100000');
    const result = await runCli(['results', '--cat', '1', '--format', 'json'], env.tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload).toHaveProperty('cat');
  });

  it('--cat with nonexistent index returns error exit code', async () => {
    await writeFixture(env.resultsDir, 'only-task', '20260516T100000');
    const result = await runCli(['results', '--cat', '99', '--format', 'json'], env.tempDir);
    // Should exit with a non-zero code (source_error = 2)
    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('--cat with filename returns result by name', async () => {
    await writeFixture(env.resultsDir, 'named-task', '20260516T150000');
    // List first to get the exact filename
    const listResult = await runCli(['results', '--format', 'json'], env.tempDir);
    const listParsed = JSON.parse(listResult.stdout) as Record<string, unknown>;
    const listPayload = listParsed.payload as Record<string, unknown>;
    const entries = listPayload.results as Array<Record<string, unknown>>;
    const filename = entries[0].name as string;

    const catResult = await runCli(['results', '--cat', filename, '--format', 'json'], env.tempDir);
    expect(catResult.exitCode).toBe(0);
    const catParsed = JSON.parse(catResult.stdout) as Record<string, unknown>;
    expect(catParsed.status).toBe('ok');
    const catPayload = catParsed.payload as Record<string, unknown>;
    expect(catPayload).toHaveProperty('cat');
    const cat = catPayload.cat as Record<string, unknown>;
    expect(cat.task).toBe('named-task');
  });
});
