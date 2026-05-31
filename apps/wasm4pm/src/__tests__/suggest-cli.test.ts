/**
 * wpm suggest — CLI integration tests
 *
 * Tests the `wpm suggest` command end-to-end using the real CLI binary.
 * The suggest command analyses an event log and recommends discovery algorithms
 * based on a stated goal (fast | balanced | quality | conformance | streaming).
 *
 * NOTE: suggest does NOT load wasm4pm.toml, so these tests are not affected by
 * any streaming preset config that may be present in the project root.
 *
 * Also covers `wpm run --auto-select`, which uses the same suggestion engine to
 * pick a discovery algorithm before execution.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { runCli, assertExitCode, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';

// CLI tests spawn a WASM subprocess — allow up to 30 s for each test.
vi.setConfig({ testTimeout: 30_000 });

// Absolute path to the repo root — independent of the test runner's CWD.
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const ROAD_TRAFFIC = path.join(REPO_ROOT, 'bench_data/roadtraffic100traces.xes');

describe('wpm suggest — algorithm recommendation CLI', () => {

  // ── Baseline: command succeeds and returns a well-formed payload ────────────

  describe('happy path', () => {
    it('exits 0 and returns a recommendations array', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json',
      ]);
      assertExitCode(result, 0);

      const body = JSON.parse(result.stdout) as {
        status: string;
        payload: {
          recommendations: Array<{
            algorithm: string;
            quality: number;
            speed: number;
            reason: string;
          }>;
        };
      };
      expect(body.status).toBe('ok');
      expect(Array.isArray(body.payload.recommendations)).toBe(true);
      expect(body.payload.recommendations.length).toBeGreaterThan(0);
    });

    it('each recommendation has algorithm, quality, speed, and reason fields', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json',
      ]);
      assertExitCode(result, 0);

      const body = JSON.parse(result.stdout) as {
        payload: {
          recommendations: Array<{
            algorithm: string;
            quality: number;
            speed: number;
            reason: string;
          }>;
        };
      };
      for (const rec of body.payload.recommendations) {
        expect(typeof rec.algorithm).toBe('string');
        expect(rec.algorithm.length).toBeGreaterThan(0);
        expect(typeof rec.quality).toBe('number');
        expect(typeof rec.speed).toBe('number');
        expect(typeof rec.reason).toBe('string');
      }
    });

    it('payload contains logStats with traceCount and eventCount', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json',
      ]);
      assertExitCode(result, 0);

      const body = JSON.parse(result.stdout) as {
        payload: {
          logStats: { traceCount: number; eventCount: number };
        };
      };
      expect(body.payload.logStats.traceCount).toBeGreaterThan(0);
      expect(body.payload.logStats.eventCount).toBeGreaterThan(0);
    });

    it('returns topPick and runCommand in payload', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json',
      ]);
      assertExitCode(result, 0);

      const body = JSON.parse(result.stdout) as {
        payload: { topPick: string; runCommand: string };
      };
      expect(typeof body.payload.topPick).toBe('string');
      expect(body.payload.topPick.length).toBeGreaterThan(0);
      expect(typeof body.payload.runCommand).toBe('string');
      expect(body.payload.runCommand).toMatch(/wpm run/);
    });

    it('produces human-readable output by default (no --format json)', async () => {
      const result = await runCli(['suggest', ROAD_TRAFFIC]);
      assertExitCode(result, 0);
      // Human output should mention the goal and at least one algorithm
      expect(result.stdout).toMatch(/Recommended algorithms|quality|speed|algorithm/i);
    });
  });

  // ── Goal flag ───────────────────────────────────────────────────────────────

  describe('--goal flag', () => {
    it('--goal quality selects higher-quality algorithms than --goal fast', async () => {
      const [fastResult, qualResult] = await Promise.all([
        runCli(['suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'fast']),
        runCli(['suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'quality']),
      ]);
      assertExitCode(fastResult, 0);
      assertExitCode(qualResult, 0);

      const fast = JSON.parse(fastResult.stdout) as {
        payload: { recommendations: Array<{ quality: number; speed: number }> };
      };
      const qual = JSON.parse(qualResult.stdout) as {
        payload: { recommendations: Array<{ quality: number; speed: number }> };
      };

      const fastTop = fast.payload.recommendations[0];
      const qualTop = qual.payload.recommendations[0];

      // quality goal top pick has strictly higher quality than fast goal top pick
      expect(qualTop.quality).toBeGreaterThan(fastTop.quality);
      // fast goal top pick has strictly higher speed than quality goal top pick
      expect(fastTop.speed).toBeGreaterThan(qualTop.speed);
    });

    it('--goal balanced succeeds and returns results', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'balanced',
      ]);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { goal: string; recommendations: unknown[] };
      };
      expect(body.payload.goal).toBe('balanced');
      expect(body.payload.recommendations.length).toBeGreaterThan(0);
    });

    it('--goal conformance succeeds and returns results', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json', '--goal', 'conformance',
      ]);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { goal: string; recommendations: unknown[] };
      };
      expect(body.payload.goal).toBe('conformance');
      expect(body.payload.recommendations.length).toBeGreaterThan(0);
    });

    it('--goal invalid exits with config error (exit 1)', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--goal', 'nonsense', '--format', 'json',
      ]);
      assertExitCode(result, EXIT_CODES.config_error);

      const body = JSON.parse(result.stdout) as {
        status: string;
        error: { code: string };
      };
      expect(body.status).toBe('error');
      expect(body.error.code).toBe('INVALID_GOAL');
    });
  });

  // ── --top flag ──────────────────────────────────────────────────────────────

  describe('--top flag', () => {
    it('--top 1 returns exactly 1 recommendation', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json', '--top', '1',
      ]);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { recommendations: unknown[] };
      };
      expect(body.payload.recommendations.length).toBe(1);
    });

    it('--top 5 returns up to 5 recommendations', async () => {
      const result = await runCli([
        'suggest', ROAD_TRAFFIC, '--format', 'json', '--top', '5',
      ]);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { recommendations: unknown[] };
      };
      expect(body.payload.recommendations.length).toBeLessThanOrEqual(5);
      expect(body.payload.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ── Error paths ─────────────────────────────────────────────────────────────

  describe('error paths', () => {
    it('missing input file exits with source error (exit 2)', async () => {
      const result = await runCli([
        'suggest', '/nonexistent/does-not-exist.xes', '--format', 'json',
      ]);
      // source_error (2) — file not found
      assertExitCode(result, EXIT_CODES.source_error);
    });

    it('no input at all exits with non-zero code', async () => {
      const result = await runCli(['suggest', '--format', 'json']);
      // config_error (1) or source_error (2) — no file provided
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// wpm run --auto-select
// ────────────────────────────────────────────────────────────────────────────

describe('wpm run --auto-select — suggestion-driven algorithm selection', () => {
  // Run from a temp dir that has NO wasm4pm.toml, so the streaming preset
  // in apps/wasm4pm/wasm4pm.toml (timeout=0) doesn't interfere.
  let testEnv: Awaited<ReturnType<typeof createCliTestEnv>>;
  beforeAll(async () => {
    testEnv = await createCliTestEnv();
  });
  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('exits 0 and returns a successful run result', async () => {
    const result = await runCli(
      ['run', ROAD_TRAFFIC, '--auto-select', '--format', 'json'],
      { cwd: testEnv.tempDir },
    );
    assertExitCode(result, 0);

    const body = JSON.parse(result.stdout) as {
      status: string;
      payload: { algorithm: string; status: string };
    };
    expect(body.status).toBe('ok');
    expect(body.payload.status).toBe('success');
  });

  it('payload shows which algorithm was actually used', async () => {
    const result = await runCli(
      ['run', ROAD_TRAFFIC, '--auto-select', '--format', 'json'],
      { cwd: testEnv.tempDir },
    );
    assertExitCode(result, 0);

    const body = JSON.parse(result.stdout) as {
      payload: { algorithm: string };
    };
    // Must be a non-empty algorithm name (not simd_streaming_dfg, which is streaming-only)
    expect(typeof body.payload.algorithm).toBe('string');
    expect(body.payload.algorithm.length).toBeGreaterThan(0);
    expect(body.payload.algorithm).not.toBe('simd_streaming_dfg');
  });

  it('stderr mentions the auto-selected algorithm when using human format', async () => {
    const result = await runCli(
      ['run', ROAD_TRAFFIC, '--auto-select'],
      { cwd: testEnv.tempDir },
    );
    // Human format: auto-select message goes to stderr
    expect(result.stderr).toMatch(/Auto-selected algorithm:/i);
  });

  it('result model contains process mining output (nodes or places)', async () => {
    const result = await runCli(
      ['run', ROAD_TRAFFIC, '--auto-select', '--format', 'json'],
      { cwd: testEnv.tempDir },
    );
    assertExitCode(result, 0);

    const body = JSON.parse(result.stdout) as {
      payload: { model: Record<string, unknown> };
    };
    const model = body.payload.model;
    // Model should have at least one of: nodes (DFG), places (Petri net)
    const hasDfgShape = Array.isArray(model['nodes']) || typeof model['nodes'] === 'number';
    const hasPetriShape = typeof model['places'] === 'number';
    expect(hasDfgShape || hasPetriShape).toBe(true);
  });
});
