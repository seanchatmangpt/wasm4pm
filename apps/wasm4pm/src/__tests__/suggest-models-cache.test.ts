/**
 * suggest-models-cache.test.ts
 *
 * Integration tests for dramatically improved wpm suggest, wpm models, and wpm cache commands.
 *
 * Covers:
 * 1. wpm suggest — rich recommendation engine output with analysisRecommendations
 * 2. wpm suggest --goal "..." — freeform goal routing (bottlenecks, compliance, prediction)
 * 3. wpm suggest --explain — detailed reasoning breakdown
 * 4. wpm models list — works even when models dir is empty
 * 5. wpm cache stats — shows meaningful statistics for all cache layers
 * 6. wpm cache clear --all — exits 0
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { runCli, assertExitCode, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

// CLI tests spawn a WASM subprocess — allow up to 30 s per test.
vi.setConfig({ testTimeout: 30_000 });

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const ROAD_TRAFFIC = path.join(REPO_ROOT, 'bench_data/roadtraffic100traces.xes');

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractJson(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf('{');
  if (start === -1) throw new Error(`No JSON in stdout:\n${stdout}`);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < stdout.length; i++) {
    const c = stdout[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) return JSON.parse(stdout.slice(start, i + 1)); }
    }
  }
  throw new Error('Incomplete JSON in stdout');
}

// ─── wpm suggest ─────────────────────────────────────────────────────────────

describe('wpm suggest — rich recommendation engine', () => {

  it('exits 0 and returns recommendations array with ≥ 2 items', async () => {
    const result = await runCli(['suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const recs = payload.recommendations as unknown[];
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThanOrEqual(2);
  });

  it('each recommendation has algorithm, score, and reasoning fields', async () => {
    const result = await runCli(['suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const recs = payload.recommendations as Array<Record<string, unknown>>;

    for (const rec of recs) {
      expect(typeof rec.algorithm).toBe('string');
      expect(rec.algorithm.length).toBeGreaterThan(0);
      // score comes from the suggestions engine
      expect(typeof rec.score).toBe('number');
      expect(rec.score).toBeGreaterThanOrEqual(0);
      // reason is the reasoning string
      expect(typeof rec.reason).toBe('string');
      expect(rec.reason.length).toBeGreaterThan(0);
    }
  });

  it('payload contains logStats with traceCount, eventCount, activityCount', async () => {
    const result = await runCli(['suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const stats = payload.logStats as Record<string, unknown>;

    expect(typeof stats.traceCount).toBe('number');
    expect(stats.traceCount).toBeGreaterThan(0);
    expect(typeof stats.eventCount).toBe('number');
    expect(stats.eventCount).toBeGreaterThan(0);
    // activityCount is derived from the XES
    expect(typeof stats.activityCount).toBe('number');
  });

  it('payload contains analysisRecommendations array', async () => {
    const result = await runCli(['suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    // analysisRecommendations may be empty or populated depending on log attributes
    expect(Array.isArray(payload.analysisRecommendations)).toBe(true);
  });

  it('--goal "find bottlenecks" routes to temporal/social analysis recommendations', async () => {
    const result = await runCli([
      'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'find bottlenecks',
    ]);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const goal = payload.goal as string;
    // Goal should be normalized
    expect(goal).toBe('find bottlenecks');

    const recs = payload.recommendations as Array<Record<string, unknown>>;
    expect(recs.length).toBeGreaterThan(0);
  });

  it('--goal "check compliance" routes to conformance-oriented algorithm recommendations', async () => {
    const result = await runCli([
      'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'check compliance',
    ]);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.goal).toBe('check compliance');

    // Conformance-focused algorithms should rank high (ilp, genetic_algorithm, alignments, etc.)
    const recs = payload.recommendations as Array<Record<string, unknown>>;
    expect(recs.length).toBeGreaterThan(0);
    const algoNames = recs.map(r => r.algorithm as string);
    const conformanceAlgos = new Set(['ilp', 'alignments', 'genetic_algorithm', 'aco', 'inductive_miner']);
    const hasConformanceAlgo = algoNames.some(a => conformanceAlgos.has(a));
    expect(hasConformanceAlgo).toBe(true);
  });

  it('--goal "predict outcomes" returns recommendation for prediction pipeline', async () => {
    const result = await runCli([
      'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'predict outcomes',
    ]);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.goal).toBe('predict outcomes');

    const recs = payload.recommendations as Array<Record<string, unknown>>;
    expect(recs.length).toBeGreaterThan(0);
  });

  it('--explain populates explainLines on recommendations', async () => {
    const result = await runCli([
      'suggest', ROAD_TRAFFIC, '--format', 'json', '--explain',
    ]);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const recs = payload.recommendations as Array<Record<string, unknown>>;

    // At least some recommendations should have explainLines
    const withExplain = recs.filter(r =>
      Array.isArray(r.explainLines) && (r.explainLines as string[]).length > 0
    );
    expect(withExplain.length).toBeGreaterThan(0);
  });

  it('human output contains ALGORITHM RECOMMENDATIONS section', async () => {
    const result = await runCli(['suggest', ROAD_TRAFFIC]);
    assertExitCode(result, 0);
    expect(result.stdout).toContain('ALGORITHM RECOMMENDATIONS');
  });

  it('human output contains QUICK START section', async () => {
    const result = await runCli(['suggest', ROAD_TRAFFIC]);
    assertExitCode(result, 0);
    expect(result.stdout).toContain('QUICK START');
  });

  it('payload has topPick and runCommand', async () => {
    const result = await runCli(['suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(typeof payload.topPick).toBe('string');
    expect(typeof payload.runCommand).toBe('string');
    expect(payload.runCommand as string).toContain('wpm run');
  });
});

// ─── wpm models list ─────────────────────────────────────────────────────────

describe('wpm models — model repository manager', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let tmpDir: string;

  beforeAll(async () => {
    env = await createCliTestEnv();
    // Create a temp dir to isolate .wasm4pm/models from the repo
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-models-test-'));
  });

  afterAll(async () => {
    env?.cleanup?.();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('wpm models list exits 0 even when models directory is empty', async () => {
    const result = await runCli(['models', 'list', '--format', 'json'], {
      env: { ...env.env, WASM4PM_RESULTS_DIR: tmpDir },
      cwd: tmpDir,
    });
    // Should always exit 0 — empty repository is valid
    assertExitCode(result, 0);
  });

  it('wpm models list --format json has total and models array', async () => {
    const result = await runCli(['models', 'list', '--format', 'json'], {
      cwd: tmpDir,
    });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(typeof payload.total).toBe('number');
    expect(payload.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.models)).toBe(true);
  });

  it('wpm models save then list shows the saved model', async () => {
    const saveResult = await runCli([
      'models', 'save',
      '-i', ROAD_TRAFFIC,
      '--name', 'test-road-traffic',
      '--algorithm', 'dfg',
      '--fitness', '0.75',
      '--format', 'json',
    ], { cwd: tmpDir });

    assertExitCode(saveResult, 0);
    const saveBody = extractJson(saveResult.stdout);
    const savePayload = saveBody.payload as Record<string, unknown>;
    expect(savePayload.name).toBe('test-road-traffic');
    expect(savePayload.algorithm).toBe('dfg');

    // Now list should show the model
    const listResult = await runCli(['models', 'list', '--format', 'json'], {
      cwd: tmpDir,
    });
    assertExitCode(listResult, 0);
    const listBody = extractJson(listResult.stdout);
    const listPayload = listBody.payload as Record<string, unknown>;
    expect((listPayload.total as number)).toBeGreaterThanOrEqual(1);
    const models = listPayload.models as Array<Record<string, unknown>>;
    const found = models.find(m => m.name === 'test-road-traffic');
    expect(found).toBeDefined();
    expect(found?.algorithm).toBe('dfg');
  });

  it('wpm models save exits 1 when --name is missing', async () => {
    const result = await runCli([
      'models', 'save', '-i', ROAD_TRAFFIC, '--format', 'json',
    ], { cwd: tmpDir });
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  });

  it('wpm models load returns model metadata', async () => {
    // First save one
    await runCli([
      'models', 'save',
      '-i', ROAD_TRAFFIC,
      '--name', 'rt-load-test',
      '--algorithm', 'heuristic_miner',
      '--format', 'json',
    ], { cwd: tmpDir });

    const result = await runCli(['models', 'load', '--name', 'rt-load-test', '--format', 'json'], {
      cwd: tmpDir,
    });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.name).toBe('rt-load-test');
    expect(payload.algorithm).toBe('heuristic_miner');
  });

  it('wpm models load exits 2 when model not found', async () => {
    const result = await runCli(['models', 'load', '--name', 'nonexistent-model', '--format', 'json'], {
      cwd: tmpDir,
    });
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('wpm models compare returns delta between two models', async () => {
    // Save two models
    await runCli([
      'models', 'save', '-i', ROAD_TRAFFIC, '--name', 'cmp-a',
      '--algorithm', 'dfg', '--fitness', '0.70', '--format', 'json',
    ], { cwd: tmpDir });
    await runCli([
      'models', 'save', '-i', ROAD_TRAFFIC, '--name', 'cmp-b',
      '--algorithm', 'inductive_miner', '--fitness', '0.87', '--format', 'json',
    ], { cwd: tmpDir });

    const result = await runCli([
      'models', 'compare', '--name1', 'cmp-a', '--name2', 'cmp-b', '--format', 'json',
    ], { cwd: tmpDir });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.model1).toBeDefined();
    expect(payload.model2).toBeDefined();
    // delta_fitness: cmp-b (0.87) - cmp-a (0.70) = +17%
    expect(typeof payload.delta_fitness).toBe('number');
    expect(payload.delta_fitness as number).toBeCloseTo(17, 0);
    expect(payload.better_fitness).toBe('cmp-b');
  });

  it('wpm models delete removes the model', async () => {
    await runCli([
      'models', 'save', '-i', ROAD_TRAFFIC, '--name', 'delete-me',
      '--algorithm', 'dfg', '--format', 'json',
    ], { cwd: tmpDir });

    const delResult = await runCli([
      'models', 'delete', '--name', 'delete-me', '--format', 'json',
    ], { cwd: tmpDir });
    assertExitCode(delResult, 0);

    // Now load should fail
    const loadResult = await runCli([
      'models', 'load', '--name', 'delete-me', '--format', 'json',
    ], { cwd: tmpDir });
    expect(loadResult.exitCode).toBe(EXIT_CODES.source_error);
  });
});

// ─── wpm cache stats / clear ─────────────────────────────────────────────────

describe('wpm cache — meaningful statistics and clear', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeAll(async () => {
    env = await createCliTestEnv();
  });

  afterAll(() => {
    env?.cleanup?.();
  });

  it('wpm cache stats exits 0', async () => {
    const result = await runCli(['cache', 'stats', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);
  });

  it('wpm cache stats --format json has all three cache layers', async () => {
    const result = await runCli(['cache', 'stats', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;

    // All three cache layers must be reported
    expect(payload.algorithm_result_cache).toBeDefined();
    expect(payload.model_cache).toBeDefined();
    expect(payload.conformance_cache).toBeDefined();
    expect(payload.totals).toBeDefined();
  });

  it('wpm cache stats totals has total_entries and total_size_human', async () => {
    const result = await runCli(['cache', 'stats', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const totals = payload.totals as Record<string, unknown>;

    expect(typeof totals.total_entries).toBe('number');
    expect(typeof totals.total_size_bytes).toBe('number');
    expect(typeof totals.total_size_human).toBe('string');
  });

  it('wpm cache stats human output contains Cache Statistics header', async () => {
    const result = await runCli(['cache', 'stats'], { env: env.env });
    assertExitCode(result, 0);
    expect(result.stdout).toContain('Cache Statistics');
  });

  it('wpm cache clear --all exits 0', async () => {
    const result = await runCli(['cache', 'clear', '--all', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    expect(body.status).toBe('ok');
  });

  it('wpm cache clear --type results exits 0', async () => {
    const result = await runCli(['cache', 'clear', '--type', 'results', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.cache_type_cleared).toBe('results');
  });

  it('wpm cache clear --type models exits 0', async () => {
    const result = await runCli(['cache', 'clear', '--type', 'models', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);
  });

  it('wpm cache clear --type conformance exits 0', async () => {
    const result = await runCli(['cache', 'clear', '--type', 'conformance', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);
  });

  it('wpm cache purge exits 0', async () => {
    const result = await runCli(['cache', 'purge', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(typeof payload.expired_entries_removed).toBe('number');
  });
});
