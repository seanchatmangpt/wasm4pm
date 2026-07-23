/**
 * results CLI integration tests — list, --last, --cat, --diff, --verify, empty dir
 *
 * Migrated from `wpm results` -> `wpm evidence report` (bridged, unmodified
 * `commands/results.ts` body — see nouns/evidence/report.ts).
 *
 * Envelope-shape / exit-code notes verified live against the built CLI
 * (see nouns/_bridge.ts):
 *
 *   - On SUCCESS (legacy `status: 'ok'`, including a nonzero embedded
 *     `exit_code` such as 4 for a --verify tamper detection) the FULL
 *     legacy `{ command, status, payload, meta }` envelope is returned
 *     unchanged, and the legacy `exit_code` IS honored as the real process
 *     exit code (wpm's `resolveResultExitCode` checks both camelCase
 *     `exitCode` and snake_case `exit_code` — see cli.ts).
 *   - On FAILURE (legacy `status: 'error'`) the bridge THROWS a
 *     `NounVerbError`, so the new minimal `{ error: { code, message } }`
 *     envelope applies instead — the old `{ status: 'error', payload: null,
 *     error }` shape does not survive. The bridge's `classifyLegacyFailure`
 *     also COARSENS the exit code: legacy config_error (1) and
 *     source_error (2) BOTH collapse to wpm's INVALID_INPUT mapping, which
 *     is source_error (2) — so `--diff` with the wrong number of refs now
 *     exits 2, not 1 as it did pre-migration. This is a real, confirmed
 *     behavior change from bridging, not a test-writing choice.
 *   - `--format json`/`--format human` no longer make any difference:
 *     bridged verbs force JSON internally regardless (see
 *     `stripLegacyOutputFlags` in _bridge.ts) — there is no more
 *     human-readable text on stdout to assert against, ever.
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

// A single positional/flag invocation of `evidence report` forwarding to results.ts.
function report(args: string[], cwd: string): Promise<CliResult> {
  return runCli(['evidence', 'report', ...args], cwd);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('evidence report: empty directory (was: wpm results)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
    await fs.mkdir(env.resultsDir, { recursive: true });
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 when .wasm4pm/results/ is empty', async () => {
    const result = await report([], env.tempDir);
    expect(result.exitCode, `stdout: ${result.stdout}`).toBe(0);
  });

  it('returns JSON envelope with payload.count:0 and empty results array', async () => {
    const result = await report([], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.command).toBe('results');
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.count).toBe(0);
    expect(Array.isArray(payload.results)).toBe(true);
    expect((payload.results as unknown[]).length).toBe(0);
  });
});

describe('evidence report: listing with saved fixtures', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('lists saved result files with the correct envelope', async () => {
    await writeFixture(env.resultsDir, 'next-activity', '20260516T120000');
    const result = await report([], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.command).toBe('results');
    expect(parsed.status).toBe('ok');
    const payload = parsed.payload as Record<string, unknown>;
    expect(payload.count).toBeGreaterThan(0);
    expect((payload.results as unknown[]).length).toBeGreaterThan(0);
  });

  it('lists multiple fixtures and shows correct count', async () => {
    await writeFixture(env.resultsDir, 'next-activity', '20260516T100000');
    await writeFixture(env.resultsDir, 'remaining-time', '20260516T110000');
    await writeFixture(env.resultsDir, 'outcome', '20260516T120000');
    const result = await report([], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.count).toBe(3);
    expect((payload.results as unknown[]).length).toBe(3);
  });

  it('each result entry has name, filepath, and savedAt fields', async () => {
    await writeFixture(env.resultsDir, 'drift', '20260516T130000');
    const result = await report([], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entry = (payload.results as Array<Record<string, unknown>>)[0];
    expect(typeof entry.name).toBe('string');
    expect((entry.name as string).endsWith('.json')).toBe(true);
    expect(typeof entry.filepath).toBe('string');
    expect(typeof entry.savedAt).toBe('string');
    expect(typeof entry.index).toBe('number');
  });
});

describe('evidence report --last', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('exits 0 with empty results when no saved files exist', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const result = await report(['--last'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
  });

  it('returns the most recent result when multiple files exist', async () => {
    await writeFixture(env.resultsDir, 'older-task', '20260516T090000');
    await new Promise((r) => setTimeout(r, 50));
    await writeFixture(env.resultsDir, 'newer-task', '20260516T100000');
    const result = await report(['--last'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload).toHaveProperty('cat');
    const cat = payload.cat as Record<string, unknown>;
    expect(cat.task).toBe('newer-task');
  });

  it('result cat payload has correct SavedResult shape', async () => {
    await writeFixture(env.resultsDir, 'resource', '20260516T120000', { agents: 3 });
    const result = await report(['--last'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const payload = (JSON.parse(result.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const cat = payload.cat as Record<string, unknown>;
    expect(cat.version).toBe(1);
    expect(cat.task).toBe('resource');
    expect(cat.input).toBe('/revops/pipeline.xes');
    expect(cat.activityKey).toBe('concept:name');
    expect(cat).toHaveProperty('result');
  });
});

describe('evidence report --cat', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('--cat 1 returns the first listed result (index-based)', async () => {
    await writeFixture(env.resultsDir, 'first-task', '20260516T100000');
    const result = await report(['--cat', '1'], env.tempDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    expect(parsed.payload as Record<string, unknown>).toHaveProperty('cat');
  });

  it('--cat with nonexistent index exits non-zero with the new error envelope', async () => {
    await writeFixture(env.resultsDir, 'only-task', '20260516T100000');
    const result = await report(['--cat', '99'], env.tempDir);
    expect(result.exitCode).not.toBe(0);
    const parsed = JSON.parse(result.stdout) as { error?: { code: string; message: string } };
    expect(parsed.error).toBeDefined();
    expect(parsed.error!.code).toBe('INVALID_INPUT');
  });

  it('--cat with filename returns result by name', async () => {
    await writeFixture(env.resultsDir, 'named-task', '20260516T150000');
    const listResult = await report([], env.tempDir);
    const listPayload = (JSON.parse(listResult.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const filename = (listPayload.results as Array<Record<string, unknown>>)[0].name as string;

    const catResult = await report(['--cat', filename], env.tempDir);
    expect(catResult.exitCode).toBe(0);
    const catPayload = (JSON.parse(catResult.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const cat = catPayload.cat as Record<string, unknown>;
    expect(cat.task).toBe('named-task');
  });
});

// ─── list JSON contract fields ────────────────────────────────────────────────

describe('evidence report: list JSON contract — id, path, timestamp fields', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('each result entry exposes id (1-based integer), sequential across entries', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000');
    const r = await report([], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entries = payload.results as Array<Record<string, unknown>>;
    expect(entries.length).toBe(2);
    for (const entry of entries) {
      expect(typeof entry.id).toBe('number');
      expect((entry.id as number) >= 1).toBe(true);
    }
    const ids = entries.map((e) => e.id as number).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2]);
  });

  it('each result entry exposes path (absolute filepath, alias of filepath)', async () => {
    await writeFixture(env.resultsDir, 'alpha', '20260516T120000');
    const r = await report([], env.tempDir);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entry = (payload.results as Array<Record<string, unknown>>)[0];
    expect(typeof entry.path).toBe('string');
    expect(entry.path).toBe(entry.filepath);
    expect((entry.path as string).endsWith('.json')).toBe(true);
  });

  it('each result entry exposes timestamp (ISO-8601, alias of savedAt)', async () => {
    await writeFixture(env.resultsDir, 'ilp', '20260516T130000');
    const r = await report([], env.tempDir);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const entry = (payload.results as Array<Record<string, unknown>>)[0];
    expect(typeof entry.timestamp).toBe('string');
    expect(entry.timestamp as string).toMatch(/T/);
    expect(entry.timestamp).toBe(entry.savedAt);
  });
});

// ─── --diff exit codes and JSON contract ──────────────────────────────────────

describe('evidence report --diff: validation exit codes (COARSENED under bridging — see file doc comment)', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('--diff with a single ref exits 2 (was 1 pre-migration — bridge coarsens to INVALID_INPUT)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--diff', '1'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code: string; message: string } };
    expect(parsed.error?.code).toBe('INVALID_INPUT');
    expect(typeof parsed.error?.message).toBe('string');
  });

  it('--diff with three refs exits 2', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--diff', '1,2,3'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code: string } };
    expect(parsed.error?.code).toBe('INVALID_INPUT');
  });

  it('--diff with a bare comma (two empty refs) exits 2', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--diff', ','], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code: string } };
    expect(parsed.error).toBeDefined();
  });

  it('--diff with valid format but ref2 missing exits 2 (was already 2 pre-migration)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--diff', '1,99'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code: string } };
    expect(parsed.error).toBeDefined();
  });

  it('--diff with both refs missing exits 2', async () => {
    await fs.mkdir(env.resultsDir, { recursive: true });
    const r = await report(['--diff', '1,2'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code: string } };
    expect(parsed.error).toBeDefined();
  });
});

describe('evidence report --diff: successful JSON contract', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('successful --diff exits 0', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000', { algorithm: 'dfg', elapsedMs: 100, fitness: 0.9 });
    await new Promise((r) => setTimeout(r, 20));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000', { algorithm: 'heuristic', elapsedMs: 200, fitness: 0.85 });
    const r = await report(['--diff', '1,2'], env.tempDir);
    expect(r.exitCode).toBe(0);
  });

  it('successful --diff JSON payload contains ref1 and ref2', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    await new Promise((r) => setTimeout(r, 20));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000');
    const r = await report(['--diff', '1,2'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(payload.ref1).toBe('1');
    expect(payload.ref2).toBe('2');
  });

  it('successful --diff JSON payload contains a diff object with fitness/algorithm/elapsed/jaccard keys', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000', { algorithm: 'dfg', elapsedMs: 100, fitness: 0.9 });
    await new Promise((r) => setTimeout(r, 20));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000', { algorithm: 'heuristic', elapsedMs: 250, fitness: 0.8 });
    const r = await report(['--diff', '1,2'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const diff = payload.diff as Record<string, unknown>;
    expect(typeof diff).toBe('object');
    expect('fitness_a' in diff).toBe(true);
    expect('fitness_b' in diff).toBe(true);
    const delta = diff.fitness_delta;
    expect(delta === null || typeof delta === 'number').toBe(true);
    expect('algorithm_a' in diff).toBe(true);
    expect('algorithm_b' in diff).toBe(true);
    expect('elapsed_ms_a' in diff).toBe(true);
    expect('elapsed_ms_b' in diff).toBe(true);
    expect('jaccard_similarity' in diff).toBe(true);
  });

  it('successful --diff payload still has left/right SavedResult objects', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000', { algorithm: 'dfg' });
    await new Promise((r) => setTimeout(r, 50));
    await writeFixture(env.resultsDir, 'heuristic', '20260516T110000', { algorithm: 'heuristic' });
    const r = await report(['--diff', '2,1'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    const left = payload.left as Record<string, unknown>;
    const right = payload.right as Record<string, unknown>;
    expect(left.task).toBe('dfg');
    expect(right.task).toBe('heuristic');
  });
});

// ─── --verify exit codes and JSON contract ────────────────────────────────────

describe('evidence report --verify: exit codes and JSON contract', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.cleanup();
  });

  it('--verify with nonexistent index exits 2 (INVALID_INPUT)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--verify', '99'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code: string } };
    expect(parsed.error?.code).toBe('INVALID_INPUT');
  });

  it('--verify with nonexistent filename exits 2', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--verify', 'does-not-exist.json'], env.tempDir);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code: string } };
    expect(parsed.error).toBeDefined();
  });

  it('--verify when stored output_hash mismatches: exit_code 4 IS preserved (success-path exit codes survive bridging)', async () => {
    // Unlike the error path, this is a legacy `status: 'ok'` result with a
    // nonzero embedded `exit_code` (partial_failure=4) — it does NOT get
    // coarsened, because the bridge only rewrites results whose legacy
    // `status` is 'error'. See file doc comment.
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
    const r = await report(['--verify', '1'], env.tempDir);
    expect(r.exitCode).toBe(4);
    const parsed = JSON.parse(r.stdout) as { status: string; payload: Record<string, unknown> };
    expect(parsed.status).toBe('ok');
    expect(parsed.payload.verified).toBe(false);
    expect(parsed.payload.hash_match).toBe(false);
    expect(parsed.payload.integrity).toBe('mismatch');
  });

  it('--verify payload includes verified boolean, ref, expected_hash, actual_hash fields', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--verify', '1'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const payload = (JSON.parse(r.stdout) as Record<string, unknown>).payload as Record<string, unknown>;
    expect(typeof payload.verified).toBe('boolean');
    expect(payload.ref).toBe('1');
    expect('expected_hash' in payload).toBe(true);
    expect(typeof payload.actual_hash).toBe('string');
    expect((payload.actual_hash as string).length).toBeGreaterThan(0);
  });

  it('--verify with no receipt exits 0 (no_receipt is not an error)', async () => {
    await writeFixture(env.resultsDir, 'dfg', '20260516T100000');
    const r = await report(['--verify', '1'], env.tempDir);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as { status: string; payload: Record<string, unknown> };
    expect(parsed.status).toBe('ok');
    expect(parsed.payload.integrity).toBe('no_receipt');
    expect(parsed.payload.verified).toBe(false);
  });
});
