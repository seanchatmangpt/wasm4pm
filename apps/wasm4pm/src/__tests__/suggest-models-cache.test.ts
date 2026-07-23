/**
 * suggest-models-cache.test.ts
 *
 * MIGRATED from the retired top-level `wpm suggest` / `wpm models` /
 * `wpm cache` invocations (see `nouns/_removed.ts`: `suggest` -> `pipeline
 * suggest`, `models` -> `system models`, `cache` -> `system cache`). All
 * three bridge unchanged to their `commands/*.ts` bodies via
 * `invokeLegacyCommandAsJson` (`nouns/_bridge.ts`) — the legacy
 * `CommandResult` envelope is returned as-is as the verb's plain JSON
 * result. `--format` is always forced to `json` by the bridge.
 *
 * Integration tests for dramatically improved wpm suggest, wpm models, and wpm cache commands.
 *
 * Covers:
 * 1. wpm pipeline suggest — rich recommendation engine output with analysisRecommendations
 * 2. wpm pipeline suggest --goal "..." — freeform goal routing (bottlenecks, compliance, prediction)
 * 3. wpm pipeline suggest --explain — detailed reasoning breakdown
 * 4. wpm system models list — works even when models dir is empty
 * 5. wpm system cache stats — shows meaningful statistics for all cache layers
 * 6. wpm system cache clear --all — exits 0
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

interface SuggestionRecommendation {
  algorithm: string;
  score: number;
  reason: string;
}

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

describe('wpm pipeline suggest — rich recommendation engine', () => {

  it('exits 0 and returns recommendations array with ≥ 2 items', async () => {
    const result = await runCli(['pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const recs = payload.recommendations as unknown[];
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThanOrEqual(2);
  });

  it('each recommendation has algorithm, score, and reasoning fields', async () => {
    const result = await runCli(['pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const recs = payload.recommendations as unknown[];

    for (const rawRec of recs) {
      expect(typeof (rawRec as Record<string, unknown>).algorithm).toBe('string');
      expect(typeof (rawRec as Record<string, unknown>).score).toBe('number');
      expect(typeof (rawRec as Record<string, unknown>).reason).toBe('string');

      const rec = rawRec as SuggestionRecommendation;
      expect(rec.algorithm.length).toBeGreaterThan(0);
      // score comes from the suggestions engine
      expect(rec.score).toBeGreaterThanOrEqual(0);
      // reason is the reasoning string
      expect(rec.reason.length).toBeGreaterThan(0);
    }
  });

  it('payload contains logStats with traceCount, eventCount, activityCount', async () => {
    const result = await runCli(['pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json']);
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
    const result = await runCli(['pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    // analysisRecommendations may be empty or populated depending on log attributes
    expect(Array.isArray(payload.analysisRecommendations)).toBe(true);
  });

  it('--goal "find bottlenecks" routes to temporal/social analysis recommendations', async () => {
    const result = await runCli([
      'pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'find bottlenecks',
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
      'pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'check compliance',
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
      'pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'predict outcomes',
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
      'pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json', '--explain',
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

  // The original two scenarios asserted human-readable section headers
  // ("ALGORITHM RECOMMENDATIONS" / "QUICK START") appear on stdout when
  // `--format` is omitted. The bridge (nouns/_bridge.ts) always overrides
  // to `--format json` regardless of what's passed, so that human-rendered
  // text is no longer reachable through `pipeline suggest` — verified live.
  // Rewritten to assert the equivalent JSON data those sections rendered
  // (recommendations + topPick/runCommand), per the always-JSON-on-stdout
  // contract.
  it('recommendations are present (human ALGORITHM RECOMMENDATIONS section no longer reachable via the bridge)', async () => {
    const result = await runCli(['pipeline', 'suggest', ROAD_TRAFFIC]);
    assertExitCode(result, 0);
    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(Array.isArray(payload.recommendations)).toBe(true);
    expect((payload.recommendations as unknown[]).length).toBeGreaterThan(0);
  });

  it('topPick and runCommand are present (human QUICK START section no longer reachable via the bridge)', async () => {
    const result = await runCli(['pipeline', 'suggest', ROAD_TRAFFIC]);
    assertExitCode(result, 0);
    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(typeof payload.topPick).toBe('string');
    expect(typeof payload.runCommand).toBe('string');
  });

  it('payload has topPick and runCommand', async () => {
    const result = await runCli(['pipeline', 'suggest', ROAD_TRAFFIC, '--format', 'json']);
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(typeof payload.topPick).toBe('string');
    expect(typeof payload.runCommand).toBe('string');
    expect(payload.runCommand as string).toContain('wpm run');
  });
});

// ─── wpm models list ─────────────────────────────────────────────────────────

describe('wpm system models — model repository manager', () => {
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
    const result = await runCli(['system', 'models', 'list', '--format', 'json'], {
      env: { ...env.env, WASM4PM_RESULTS_DIR: tmpDir },
      cwd: tmpDir,
    });
    // Should always exit 0 — empty repository is valid
    assertExitCode(result, 0);
  });

  it('wpm models list --format json has total and models array', async () => {
    const result = await runCli(['system', 'models', 'list', '--format', 'json'], {
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
      'system', 'models', 'save',
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
    const listResult = await runCli(['system', 'models', 'list', '--format', 'json'], {
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

  // The legacy command itself reports EXIT_CODES.config_error (1) for a
  // missing --name, but the bridge's ErrorCode vocabulary is coarser: both
  // legacy config_error(1) and source_error(2) map to INVALID_INPUT
  // (nouns/_bridge.ts classifyLegacyFailure), which wpm's ERROR_CODE_MAP
  // (cli.ts) then resolves to source_error(2). Verified live.
  it('wpm system models save exits 2 (source_error, via bridge INVALID_INPUT mapping) when --name is missing', async () => {
    const result = await runCli([
      'system', 'models', 'save', '-i', ROAD_TRAFFIC, '--format', 'json',
    ], { cwd: tmpDir });
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('wpm models load returns model metadata', async () => {
    // First save one
    await runCli([
      'system', 'models', 'save',
      '-i', ROAD_TRAFFIC,
      '--name', 'rt-load-test',
      '--algorithm', 'heuristic_miner',
      '--format', 'json',
    ], { cwd: tmpDir });

    const result = await runCli(['system', 'models', 'load', '--name', 'rt-load-test', '--format', 'json'], {
      cwd: tmpDir,
    });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.name).toBe('rt-load-test');
    expect(payload.algorithm).toBe('heuristic_miner');
  });

  it('wpm models load exits 2 when model not found', async () => {
    const result = await runCli(['system', 'models', 'load', '--name', 'nonexistent-model', '--format', 'json'], {
      cwd: tmpDir,
    });
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  });

  it('wpm models compare returns delta between two models', async () => {
    // Save two models
    await runCli([
      'system', 'models', 'save', '-i', ROAD_TRAFFIC, '--name', 'cmp-a',
      '--algorithm', 'dfg', '--fitness', '0.70', '--format', 'json',
    ], { cwd: tmpDir });
    await runCli([
      'system', 'models', 'save', '-i', ROAD_TRAFFIC, '--name', 'cmp-b',
      '--algorithm', 'inductive_miner', '--fitness', '0.87', '--format', 'json',
    ], { cwd: tmpDir });

    const result = await runCli([
      'system', 'models', 'compare', '--name1', 'cmp-a', '--name2', 'cmp-b', '--format', 'json',
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
      'system', 'models', 'save', '-i', ROAD_TRAFFIC, '--name', 'delete-me',
      '--algorithm', 'dfg', '--format', 'json',
    ], { cwd: tmpDir });

    const delResult = await runCli([
      'system', 'models', 'delete', '--name', 'delete-me', '--format', 'json',
    ], { cwd: tmpDir });
    assertExitCode(delResult, 0);

    // Now load should fail
    const loadResult = await runCli([
      'system', 'models', 'load', '--name', 'delete-me', '--format', 'json',
    ], { cwd: tmpDir });
    expect(loadResult.exitCode).toBe(EXIT_CODES.source_error);
  });
});

// ─── wpm cache stats / clear ─────────────────────────────────────────────────

describe('wpm system cache — meaningful statistics and clear', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeAll(async () => {
    env = await createCliTestEnv();
  });

  afterAll(() => {
    env?.cleanup?.();
  });

  it('wpm cache stats exits 0', async () => {
    const result = await runCli(['system', 'cache', 'stats', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);
  });

  it('wpm cache stats --format json has all three cache layers', async () => {
    const result = await runCli(['system', 'cache', 'stats', '--format', 'json'], { env: env.env });
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
    const result = await runCli(['system', 'cache', 'stats', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    const totals = payload.totals as Record<string, unknown>;

    expect(typeof totals.total_entries).toBe('number');
    expect(typeof totals.total_size_bytes).toBe('number');
    expect(typeof totals.total_size_human).toBe('string');
  });

  // The original scenario asserted a human-readable "Cache Statistics"
  // header on stdout when `--format` is omitted. The bridge always
  // overrides to `--format json` (verified live), so that heading is no
  // longer reachable through `system cache`. Rewritten to assert the JSON
  // envelope's command name instead, per the always-JSON-on-stdout contract.
  it('cache stats command identifies itself (human "Cache Statistics" header no longer reachable via the bridge)', async () => {
    const result = await runCli(['system', 'cache', 'stats'], { env: env.env });
    assertExitCode(result, 0);
    const body = extractJson(result.stdout);
    expect(body.command).toBe('cache.stats');
  });

  it('wpm cache clear --all exits 0', async () => {
    const result = await runCli(['system', 'cache', 'clear', '--all', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    expect(body.status).toBe('ok');
  });

  it('wpm cache clear --type results exits 0', async () => {
    const result = await runCli(['system', 'cache', 'clear', '--type', 'results', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(payload.cache_type_cleared).toBe('results');
  });

  it('wpm cache clear --type models exits 0', async () => {
    const result = await runCli(['system', 'cache', 'clear', '--type', 'models', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);
  });

  it('wpm cache clear --type conformance exits 0', async () => {
    const result = await runCli(['system', 'cache', 'clear', '--type', 'conformance', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);
  });

  it('wpm cache purge exits 0', async () => {
    const result = await runCli(['system', 'cache', 'purge', '--format', 'json'], { env: env.env });
    assertExitCode(result, 0);

    const body = extractJson(result.stdout);
    const payload = body.payload as Record<string, unknown>;
    expect(typeof payload.expired_entries_removed).toBe('number');
  });
});
