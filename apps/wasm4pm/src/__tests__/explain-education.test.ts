/**
 * explain-education.test.ts
 *
 * Tests for the rich educational features of `wpm explain`:
 *   - Per-algorithm rich output (speed_tier, quality_tier in JSON payload)
 *   - `wpm explain compare <alg1> <alg2>` subcommand
 *   - `wpm explain concepts` subcommand
 *   - `wpm init --preset hospital|financial|manufacturing` domain presets
 *
 * MIGRATION NOTE (noun-verb rebuild): `wpm explain` -> `wpm model explain`,
 * `wpm init` -> `wpm config init` (`nouns/_removed.ts`), both bridged
 * unmodified to their legacy command bodies (`nouns/_bridge.ts`). Beyond
 * the rename, one REAL BUG was found and fixed as part of this migration
 * (not merely worked around): `nouns/model/explain.ts` originally routed
 * ANY first positional token of `compare` to `commands/interpret.ts`'s
 * metric-vs-metric `compare <metric> <v1> <v2>`, silently shadowing
 * `commands/explain.ts`'s OWN `compare <alg1> <alg2>` algorithm-vs-algorithm
 * subcommand — the exact feature this file tests. The routing now
 * disambiguates on the token following `compare` (a known metric name goes
 * to interpret; anything else, e.g. an algorithm id, goes to explain). See
 * `nouns/model/explain.ts`'s own doc comment for the full rationale.
 *
 * All bridged results are the legacy `{command,status,payload,meta}`
 * envelope (unwrapped access via `json.payload`), and every invocation
 * always gets pure JSON on stdout regardless of `--format` (the bridge
 * forces it) — see explain-cli.test.ts's file header for the general
 * contract notes this file also relies on.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Envelope<T = Record<string, unknown>> {
  status?: string;
  payload?: T;
}

function payloadOf<T = Record<string, unknown>>(stdout: string): T {
  const json = JSON.parse(stdout) as Envelope<T>;
  return (json.payload ?? (json as unknown as T));
}

describe('wpm model explain — educational enrichments (was: wpm explain)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  // -------------------------------------------------------------------------
  // 1. Algorithm explanations — JSON payload fields
  // -------------------------------------------------------------------------

  describe('wpm model explain dfg — JSON payload includes required fields', () => {
    it('exits 0 for a known algorithm', async () => {
      const result = await runCli(['model', 'explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('content includes "Directly-Follows" or "dfg"', async () => {
      const result = await runCli(['model', 'explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/directly.?follows|dfg/i);
    });

    it('JSON payload contains algorithm, speed_tier, quality_tier fields', async () => {
      const result = await runCli(['model', 'explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf(result.stdout);
      expect(payload).toHaveProperty('algorithm');
      expect(payload.algorithm).toMatch(/dfg/i);
      expect(payload).toHaveProperty('speed_tier');
      expect(['fast', 'balanced', 'slow']).toContain(payload.speed_tier);
      expect(payload).toHaveProperty('quality_tier');
      expect(['exploratory', 'balanced', 'quality']).toContain(payload.quality_tier);
    });

    it('dfg has speed_tier="fast" (speedScore=5, threshold ≤20)', async () => {
      const result = await runCli(['model', 'explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf(result.stdout);
      expect(payload.speed_tier).toBe('fast');
    });

    it('ilp has quality_tier="quality" (qualityScore=90, threshold >65)', async () => {
      const result = await runCli(['model', 'explain', 'ilp', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf(result.stdout);
      expect(payload.quality_tier).toBe('quality');
    });
  });

  // -------------------------------------------------------------------------
  // 2. wpm explain compare <alg1> <alg2>
  // -------------------------------------------------------------------------

  describe('wpm model explain compare (routing bug fixed as part of this migration — see file header)', () => {
    it('exits 0 when comparing two known algorithms', async () => {
      const result = await runCli(['model', 'explain', 'compare', 'dfg', 'inductive_miner'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON output has algorithm_a and algorithm_b', async () => {
      const result = await runCli(
        ['model', 'explain', 'compare', 'dfg', 'inductive_miner', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf(result.stdout);
      expect(payload).toHaveProperty('algorithm_a');
      expect(payload).toHaveProperty('algorithm_b');
    });

    it('JSON output has a comparison object with speed, quality, soundness, recommendation', async () => {
      const result = await runCli(
        ['model', 'explain', 'compare', 'dfg', 'inductive_miner', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ comparison?: Record<string, unknown> }>(result.stdout);
      expect(payload).toHaveProperty('comparison');
      const c = payload.comparison!;
      expect(c).toHaveProperty('speed');
      expect(c).toHaveProperty('quality');
      expect(c).toHaveProperty('soundness');
      expect(c).toHaveProperty('recommendation');
    });

    it('JSON payload carries the same speed/quality/recommendation data the old "SPEED"/"QUALITY"/"RECOMMENDATION" headings rendered (headings themselves are human-format-only and lost through the bridge)', async () => {
      // MIGRATION NOTE: those headings came from `formatComparisonOutput()`,
      // invoked only inside `emitResult()`'s human-format projection
      // callback (`commands/explain.ts`) — the same class of loss as
      // explain-cli.test.ts's "usage examples" note: the bridge forces
      // `--format=json --quiet`, so that callback never runs and the
      // headings are genuinely unreachable now. The underlying data they
      // rendered is still fully present in the JSON payload, asserted here.
      const result = await runCli(
        ['model', 'explain', 'compare', 'dfg', 'inductive_miner', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ comparison: Record<string, unknown> }>(result.stdout);
      expect(payload.comparison).toHaveProperty('speed');
      expect(payload.comparison).toHaveProperty('quality');
      expect(payload.comparison).toHaveProperty('recommendation');
    });

    it('exits 2 (INVALID_INPUT, via bridge collapse) with a usage message when compare is missing second algorithm', async () => {
      const result = await runCli(['model', 'explain', 'compare', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
      const json = JSON.parse(result.stdout) as { error?: { code?: string; message?: string } };
      expect(json.error?.code).toBe('INVALID_INPUT');
      expect(json.error?.message).toMatch(/usage|compare.*algorithm/i);
    });

    it('dfg is faster than ilp (speed_score lower)', async () => {
      const result = await runCli(
        ['model', 'explain', 'compare', 'dfg', 'ilp', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ comparison: { speed: { score_a: number; score_b: number; winner: string } } }>(result.stdout);
      const c = payload.comparison;
      // dfg speedScore=5, ilp speedScore=80 → dfg wins speed
      expect(c.speed.score_a).toBeLessThan(c.speed.score_b);
      expect(c.speed.winner).toMatch(/dfg/i);
    });

    it('ilp has higher quality score than dfg', async () => {
      const result = await runCli(
        ['model', 'explain', 'compare', 'dfg', 'ilp', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ comparison: { quality: { score_a: number; score_b: number; winner: string } } }>(result.stdout);
      const c = payload.comparison;
      // ilp qualityScore=90, dfg qualityScore=30 → ilp wins quality
      expect(c.quality.score_b).toBeGreaterThan(c.quality.score_a);
      expect(c.quality.winner).toMatch(/ilp/i);
    });

    it('"explain compare <metric> <v1> <v2>" still correctly routes to interpret\'s metric-vs-metric compare (disambiguation regression guard)', async () => {
      const result = await runCli(
        ['model', 'explain', 'compare', 'fitness', '0.5', '0.8', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ metric?: string; value1?: number; value2?: number }>(result.stdout);
      expect(payload.metric).toBe('fitness');
      expect(payload.value1).toBe(0.5);
      expect(payload.value2).toBe(0.8);
    });
  });

  // -------------------------------------------------------------------------
  // 3. wpm explain concepts
  // -------------------------------------------------------------------------

  describe('wpm model explain concepts', () => {
    it('exits 0', async () => {
      const result = await runCli(['model', 'explain', 'concepts'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('payload.content contains at least 5 distinct concept heading lines', async () => {
      // MIGRATION NOTE: matching heading lines against `result.stdout`
      // directly no longer works — the content's real newlines are
      // JSON-escaped `\n` two-character sequences in the raw stdout text,
      // so a `^...$` line-anchored regex with the `m` flag never matches
      // any of them. Parse the JSON and match against the unescaped
      // `payload.content` string instead, where real newlines are restored.
      const result = await runCli(['model', 'explain', 'concepts'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ content: string }>(result.stdout);
      const conceptHeadingMatches = payload.content.match(/^[A-Z][A-Z_ ]{3,}$/gm) ?? [];
      expect(conceptHeadingMatches.length).toBeGreaterThanOrEqual(5);
    });

    it('output includes fitness, precision, conformance, trace, activity', async () => {
      const result = await runCli(['model', 'explain', 'concepts'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/fitness/i);
      expect(result.stdout).toMatch(/precision/i);
      expect(result.stdout).toMatch(/conformance/i);
      expect(result.stdout).toMatch(/trace/i);
      expect(result.stdout).toMatch(/activity/i);
    });

    it('JSON payload has a concepts object', async () => {
      const result = await runCli(['model', 'explain', 'concepts', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ concepts: Record<string, unknown> }>(result.stdout);
      expect(payload).toHaveProperty('concepts');
      expect(typeof payload.concepts).toBe('object');
      expect(Object.keys(payload.concepts).length).toBeGreaterThanOrEqual(5);
    });
  });

  // -------------------------------------------------------------------------
  // 4. wpm config init --preset hospital | financial | manufacturing
  // -------------------------------------------------------------------------

  describe('wpm config init domain presets (was: wpm init)', () => {
    it('--preset hospital exits 0 and creates wasm4pm.toml', async () => {
      const result = await runCli(['config', 'init', '--preset', 'hospital', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const tomlPath = path.join(env.tempDir, 'wasm4pm.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
    });

    it('--preset financial exits 0 and creates wasm4pm.toml', async () => {
      const result = await runCli(['config', 'init', '--preset', 'financial', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const tomlPath = path.join(env.tempDir, 'wasm4pm.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
    });

    it('--preset manufacturing exits 0 and creates wasm4pm.toml', async () => {
      const result = await runCli(['config', 'init', '--preset', 'manufacturing', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const tomlPath = path.join(env.tempDir, 'wasm4pm.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
    });

    it('hospital preset output mentions clinical or hospital or guideline or pathway', async () => {
      const result = await runCli(['config', 'init', '--preset', 'hospital', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/clinical|hospital|pathway|guideline/i);
    });

    it('financial preset output mentions audit or regulatory or compliance or accuracy', async () => {
      const result = await runCli(['config', 'init', '--preset', 'financial', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/audit|regulatory|compliance|accuracy/i);
    });

    it('manufacturing preset output mentions shop.?floor or real.?time or monitoring', async () => {
      const result = await runCli(['config', 'init', '--preset', 'manufacturing', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/shop.?floor|real.?time|monitoring/i);
    });

    it('JSON payload preset field reflects the domain preset name, not the technical alias', async () => {
      const result = await runCli(
        ['config', 'init', '--preset', 'hospital', '--force', '--format', 'json'],
        { env: env.env, cwd: env.tempDir }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ preset: string }>(result.stdout);
      expect(payload.preset).toBe('hospital');
    });

    it('invalid domain preset exits 2 (INVALID_INPUT, via bridge collapse — was config_error=1)', async () => {
      const result = await runCli(['config', 'init', '--preset', 'agriculture'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Integration guard — existing explain behaviour unchanged
  // -------------------------------------------------------------------------

  describe('existing explain behaviour unchanged (regression guard)', () => {
    it('zero-arg explain still shows algorithm menu', async () => {
      const result = await runCli(['model', 'explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/algorithm guide|when to use which algorithm/i);
    });

    it('explain with unknown algorithm exits 0 (content explains it did not recognize the name — see explain-cli.test.ts for why this is not an error)', async () => {
      const result = await runCli(['model', 'explain', 'fake_algo_xyz'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const payload = payloadOf<{ content: string }>(result.stdout);
      expect(payload.content).toMatch(/unknown algorithm/i);
    });
  });
});
