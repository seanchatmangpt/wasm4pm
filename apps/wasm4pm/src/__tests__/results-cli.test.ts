/**
 * results CLI integration tests — list, --last, --cat, --diff, --verify, empty dir
 *
 * Van der Aalst QA perspective:
 * - `wpm results --format json` lists saved results from .wasm4pm/results/
 * - `wpm results --last --format json` returns the most recent result
 * - `wpm results` (empty dir) exits 0 with empty list message
 * - `wpm results --cat 1 --format json` returns the first result by index
 * - `wpm results --diff 1,2 --format json` compares two results; payload
 *   includes ref1, ref2, and a diff object with key metrics
 * - `wpm results --verify 1 --format json` verifies hash integrity; payload
 *   includes verified, ref, expected_hash, actual_hash
 *
 * Exit code contract (tested):
 *   0 = success
 *   1 = config_error  (--diff with wrong number of refs)
 *   2 = source_error  (ref not found)
 *   3 = execution_error (--verify hash mismatch detected)
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
    expect(() => { 
      try { parsed = JSON.parse(result.stdout); } catch(e) { console.error('STDOUT WAS:', result.stdout); throw e; }
    }).not.toThrow();
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

// ─── Gap tests: list JSON contract fields ─────────────────────────────────────

describe('wpm results: list JSON contract — id, path, timestamp fields', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('each result entry exposes id (1-based integer)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000');
    const r = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entries = payload.results as Array<Record<string, unknown>>;
    expect(entries.length).toBe(2);
    // id is 1-based; both entries must carry it as a number
    for (const entry of entries) {
      expect(typeof entry.id).toBe('number');
      expect((entry.id as number) >= 1).toBe(true);
    }
    // ids must be sequential
    const ids = entries.map((e) => e.id as number).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2]);
  });

  it('each result entry exposes path (absolute filepath)', async () => {
    await writeFixture(env.resultsDir, 'alpha', '20260516T120000');
    const r = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entries = payload.results as Array<Record<string, unknown>>;
    expect(entries.length).toBeGreaterThan(0);
    const entry = entries[0];
    expect(typeof entry.path).toBe('string');
    // path is the same as filepath (backward-compat alias)
    expect(entry.path).toBe(entry.filepath);
    // must end with .json
    expect((entry.path as string).endsWith('.json')).toBe(true);
  });

  it('each result entry exposes timestamp as ISO-8601 string', async () => {
    await writeFixture(env.resultsDir, 'ilp', '20260516T130000');
    const r = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entries = payload.results as Array<Record<string, unknown>>;
    const entry = entries[0];
    expect(typeof entry.timestamp).toBe('string');
    // ISO 8601 contains 'T'
    expect((entry.timestamp as string)).toMatch(/T/);
    // timestamp is the same as savedAt (backward-compat alias)
    expect(entry.timestamp).toBe(entry.savedAt);
  });

  it('each result entry still exposes  fields (index, name, filepath, savedAt)', async () => {
    await writeFixture(env.resultsDir, 'aco', '20260516T140000');
    const r = await runCli(['results', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entry = (payload.results as Array<Record<string, unknown>>)[0];
    // Backward-compat fields must still be present
    expect(typeof entry.index).toBe('number');
    expect(typeof entry.name).toBe('string');
    expect(typeof entry.filepath).toBe('string');
    expect(typeof entry.savedAt).toBe('string');
  });
});

// ─── Gap tests: --diff exit codes and JSON contract ──────────────────────────

describe('wpm results --diff: validation exit codes', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--diff with a single ref exits 1 (config_error)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--diff', '1', '--format', 'json'], env.tempDir);
    // config_error = 1: malformed --diff argument (not two refs)
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
    // Error code must identify the bad argument
    const err = parsed.error as Record<string, unknown>;
    expect(typeof err.code).toBe('string');
    expect(typeof err.message).toBe('string');
  });

  it('--diff with three refs exits 1 (config_error)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--diff', '1,2,3', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('--diff with empty string exits 1 (config_error)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--diff', '', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(1);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('--diff with valid refs but ref1 missing exits 2 (source_error)', async () => {
    // Only one fixture — ref 2 does not exist
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--diff', '1,99', '--format', 'json'], env.tempDir);
    // source_error = 2: ref resolves but file missing / index out of range
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('--diff with both refs missing exits 2 (source_error)', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const r = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });
});

describe('wpm results --diff: successful JSON contract', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('successful --diff exits 0', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000', { algorithm: 'dfg', elapsedMs: 100, fitness: 0.9 });
    await new Promise((r) => setTimeout(r, 20));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000', { algorithm: 'heuristic', elapsedMs: 200, fitness: 0.85 });
    const r = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
  });

  it('successful --diff JSON payload contains ref1 and ref2', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    await new Promise((r) => setTimeout(r, 20));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000');
    const r = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.ref1).toBe('1');
    expect(payload.ref2).toBe('2');
  });

  it('successful --diff JSON payload contains a diff object', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000', { algorithm: 'dfg', elapsedMs: 100, fitness: 0.9 });
    await new Promise((r) => setTimeout(r, 20));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000', { algorithm: 'heuristic', elapsedMs: 250, fitness: 0.8 });
    const r = await runCli(['results', '--diff', '1,2', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.diff).toBe('object');
    const diff = payload.diff as Record<string, unknown>;
    // diff must expose fitness metrics for both sides
    expect('fitness_a' in diff).toBe(true);
    expect('fitness_b' in diff).toBe(true);
    // fitness_delta must be numeric (or null when either side lacks fitness)
    const delta = diff.fitness_delta;
    expect(delta === null || typeof delta === 'number').toBe(true);
    // algorithm names must be present
    expect('algorithm_a' in diff).toBe(true);
    expect('algorithm_b' in diff).toBe(true);
    // elapsed timing
    expect('elapsed_ms_a' in diff).toBe(true);
    expect('elapsed_ms_b' in diff).toBe(true);
    // Jaccard similarity (null when no edges in either result)
    expect('jaccard_similarity' in diff).toBe(true);
  });

  it('successful --diff payload still has left/right SavedResult objects', async () => {
    // Files are sorted newest-first: index 1 = heuristic (written last),
    // index 2 = dfg (written first). Use --diff 2,1 to get dfg as left.
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000', { algorithm: 'dfg' });
    await new Promise((r) => setTimeout(r, 50));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000', { algorithm: 'heuristic' });
    // Index 2 = dfg (older), index 1 = heuristic (newer)
    const r = await runCli(['results', '--diff', '2,1', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    // Backward-compat: left and right must still be SavedResult objects
    expect(typeof payload.left).toBe('object');
    expect(typeof payload.right).toBe('object');
    const left = payload.left as Record<string, unknown>;
    const right = payload.right as Record<string, unknown>;
    expect(left.task).toBe('dfg');
    expect(right.task).toBe('heuristic');
  });
});

// ─── Gap tests: --verify exit codes and JSON contract ────────────────────────

describe('wpm results --verify: exit codes and JSON contract', () => {
  let env: TestEnv;
  beforeEach(async () => { env = await createTestEnv(); });
  afterEach(async () => { await env.cleanup(); });

  it('--verify with nonexistent index exits 2 (source_error)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--verify', '99', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('--verify with nonexistent filename exits 2 (source_error)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--verify', 'does-not-exist.json', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('error');
  });

  it('--verify when stored output_hash mismatches exits 4 (partial_failure)', async () => {
    // Write a fixture with a deliberately wrong output_hash (tamper simulation)
    await fs.mkdir(env.resultsDir, { recursive: true });
    const tamperedFixture = {
      version: 1,
      savedAt: new Date().toISOString(),
      task: 'tampered',
      input: 'log.xes',
      activityKey: 'concept:name',
      result: { algorithm: 'dfg', fitness: 0.9 },
      // This hash is intentionally wrong — it does not match the result above
      output_hash: 'deadbeefdeadbeefdeadbeefdeadbeef',
    };
    const fp = path.join(env.resultsDir, '20260516T100000-tampered.json');
    await fs.writeFile(fp, JSON.stringify(tamperedFixture), 'utf-8');

    const r = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    // partial_failure = 4: tampered payload detected
    expect(r.exitCode).toBe(4);
  });

  it('--verify payload includes verified boolean field', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    // May be 0 (no receipt, hashes match) or 3 (mismatch) depending on fixture
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(typeof payload.verified).toBe('boolean');
  });

  it('--verify payload includes ref field matching the supplied reference', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.ref).toBe('1');
  });

  it('--verify payload includes expected_hash and actual_hash fields', async () => {
    // Write fixture without output_hash so stored_output_hash is null
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    // expected_hash = what was stored at save time (may be null if not written)
    expect('expected_hash' in payload).toBe(true);
    // actual_hash = recomputed hash of current payload (always a string)
    expect(typeof payload.actual_hash).toBe('string');
    expect((payload.actual_hash as string).length).toBeGreaterThan(0);
  });

  it('--verify with tamper: payload has verified=false and hash_match=false', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const tamperedFixture = {
      version: 1,
      savedAt: new Date().toISOString(),
      task: 'tampered',
      input: 'log.xes',
      activityKey: 'concept:name',
      result: { algorithm: 'dfg', fitness: 0.9 },
      output_hash: 'deadbeefdeadbeefdeadbeefdeadbeef',
    };
    await fs.writeFile(
      path.join(env.resultsDir, '20260516T100000-tampered.json'),
      JSON.stringify(tamperedFixture),
      'utf-8'
    );

    const r = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    expect(r.exitCode).toBe(4);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.verified).toBe(false);
    expect(payload.hash_match).toBe(false);
    expect(payload.integrity).toBe('mismatch');
  });

  it('--verify with no receipt exits 0 (no_receipt is not an error)', async () => {
    // Write fixture with correct output_hash so it does NOT trigger mismatch;
    // There's no receipt directory, so integrity = no_receipt → exit 0.
    // Use writeFixture without output_hash (the helper does not compute it)
    // so stored_output_hash = null → storedHashMismatch = false → no_receipt path.
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await runCli(['results', '--verify', '1', '--format', 'json'], env.tempDir);
    // no_receipt → exit 0 (integrity warning, not an error)
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.integrity).toBe('no_receipt');
    expect(payload.verified).toBe(false); // no receipt ≠ verified
  });
});
