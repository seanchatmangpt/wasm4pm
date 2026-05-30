/**
 * explain-education.test.ts
 *
 * Tests for the rich educational features added to `wpm explain`:
 *   - Per-algorithm rich output (speed_tier, quality_tier in JSON payload)
 *   - `wpm explain compare <alg1> <alg2>` subcommand
 *   - `wpm explain concepts` subcommand
 *   - `wpm init --preset hospital|financial|manufacturing` domain presets
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('wpm explain — educational enrichments', () => {
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

  describe('wpm explain dfg — JSON payload includes required fields', () => {
    it('exits 0 for a known algorithm', async () => {
      const result = await runCli(['explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('human output includes "Directly-Follows" or "dfg" in content', async () => {
      const result = await runCli(['explain', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/directly.?follows|dfg/i);
    });

    it('JSON payload contains algorithm, speed_tier, quality_tier fields', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      expect(payload).toHaveProperty('algorithm');
      expect(payload.algorithm).toMatch(/dfg/i);
      expect(payload).toHaveProperty('speed_tier');
      expect(['fast', 'balanced', 'slow']).toContain(payload.speed_tier);
      expect(payload).toHaveProperty('quality_tier');
      expect(['exploratory', 'balanced', 'quality']).toContain(payload.quality_tier);
    });

    it('dfg has speed_tier="fast" (speedScore=5, threshold ≤20)', async () => {
      const result = await runCli(['explain', 'dfg', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      expect(payload.speed_tier).toBe('fast');
    });

    it('ilp has quality_tier="quality" (qualityScore=90, threshold >65)', async () => {
      const result = await runCli(['explain', 'ilp', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      expect(payload.quality_tier).toBe('quality');
    });
  });

  // -------------------------------------------------------------------------
  // 2. wpm explain compare <alg1> <alg2>
  // -------------------------------------------------------------------------

  describe('wpm explain compare', () => {
    it('exits 0 when comparing two known algorithms', async () => {
      const result = await runCli(['explain', 'compare', 'dfg', 'inductive_miner'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('JSON output has algorithm_a and algorithm_b', async () => {
      const result = await runCli(
        ['explain', 'compare', 'dfg', 'inductive_miner', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      expect(payload).toHaveProperty('algorithm_a');
      expect(payload).toHaveProperty('algorithm_b');
    });

    it('JSON output has a comparison object with speed, quality, soundness, recommendation', async () => {
      const result = await runCli(
        ['explain', 'compare', 'dfg', 'inductive_miner', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      expect(payload).toHaveProperty('comparison');
      const c = payload.comparison;
      expect(c).toHaveProperty('speed');
      expect(c).toHaveProperty('quality');
      expect(c).toHaveProperty('soundness');
      expect(c).toHaveProperty('recommendation');
    });

    it('human output contains "SPEED", "QUALITY", and "RECOMMENDATION" headings', async () => {
      const result = await runCli(['explain', 'compare', 'dfg', 'inductive_miner'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/SPEED/);
      expect(result.stdout).toMatch(/QUALITY/);
      expect(result.stdout).toMatch(/RECOMMENDATION/i);
    });

    it('exits 1 with helpful message when compare is missing second algorithm', async () => {
      const result = await runCli(['explain', 'compare', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
      expect(result.stdout + result.stderr).toMatch(/usage|compare.*algorithm/i);
    });

    it('dfg is faster than ilp (speed_score lower)', async () => {
      const result = await runCli(
        ['explain', 'compare', 'dfg', 'ilp', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      const c = payload.comparison;
      // dfg speedScore=5, ilp speedScore=80 → dfg wins speed
      expect(c.speed.score_a).toBeLessThan(c.speed.score_b);
      expect(c.speed.winner).toMatch(/dfg/i);
    });

    it('ilp has higher quality score than dfg', async () => {
      const result = await runCli(
        ['explain', 'compare', 'dfg', 'ilp', '--format', 'json'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      const c = payload.comparison;
      // ilp qualityScore=90, dfg qualityScore=30 → ilp wins quality
      expect(c.quality.score_b).toBeGreaterThan(c.quality.score_a);
      expect(c.quality.winner).toMatch(/ilp/i);
    });
  });

  // -------------------------------------------------------------------------
  // 3. wpm explain concepts
  // -------------------------------------------------------------------------

  describe('wpm explain concepts', () => {
    it('exits 0', async () => {
      const result = await runCli(['explain', 'concepts'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('output contains at least 5 distinct concept terms', async () => {
      const result = await runCli(['explain', 'concepts'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      // Each concept appears as an upper-case heading line
      const conceptHeadingMatches = result.stdout.match(/^[A-Z][A-Z_ ]{3,}$/gm) ?? [];
      expect(conceptHeadingMatches.length).toBeGreaterThanOrEqual(5);
    });

    it('output includes fitness, precision, conformance, trace, activity', async () => {
      const result = await runCli(['explain', 'concepts'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/fitness/i);
      expect(result.stdout).toMatch(/precision/i);
      expect(result.stdout).toMatch(/conformance/i);
      expect(result.stdout).toMatch(/trace/i);
      expect(result.stdout).toMatch(/activity/i);
    });

    it('JSON payload has a concepts object', async () => {
      const result = await runCli(['explain', 'concepts', '--format', 'json'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      expect(payload).toHaveProperty('concepts');
      expect(typeof payload.concepts).toBe('object');
      expect(Object.keys(payload.concepts).length).toBeGreaterThanOrEqual(5);
    });
  });

  // -------------------------------------------------------------------------
  // 4. wpm init --preset hospital | financial | manufacturing
  // -------------------------------------------------------------------------

  describe('wpm init domain presets', () => {
    it('--preset hospital exits 0 and creates wasm4pm.toml', async () => {
      const result = await runCli(['init', '--preset', 'hospital', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const tomlPath = path.join(env.tempDir, 'wasm4pm.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
    });

    it('--preset financial exits 0 and creates wasm4pm.toml', async () => {
      const result = await runCli(['init', '--preset', 'financial', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const tomlPath = path.join(env.tempDir, 'wasm4pm.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
    });

    it('--preset manufacturing exits 0 and creates wasm4pm.toml', async () => {
      const result = await runCli(['init', '--preset', 'manufacturing', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const tomlPath = path.join(env.tempDir, 'wasm4pm.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
    });

    it('hospital preset human output mentions clinical or hospital or guideline or pathway', async () => {
      const result = await runCli(['init', '--preset', 'hospital', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/clinical|hospital|pathway|guideline/i);
    });

    it('financial preset human output mentions audit or regulatory or compliance or accuracy', async () => {
      const result = await runCli(['init', '--preset', 'financial', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/audit|regulatory|compliance|accuracy/i);
    });

    it('manufacturing preset human output mentions shop.?floor or real.?time or monitoring', async () => {
      const result = await runCli(['init', '--preset', 'manufacturing', '--force'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/shop.?floor|real.?time|monitoring/i);
    });

    it('JSON payload preset field reflects the domain preset name, not the technical alias', async () => {
      const result = await runCli(
        ['init', '--preset', 'hospital', '--force', '--format', 'json'],
        { env: env.env, cwd: env.dir }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const json = JSON.parse(result.stdout);
      const payload = json.payload ?? json;
      expect(payload.preset).toBe('hospital');
    });

    it('invalid domain preset exits 1', async () => {
      const result = await runCli(['init', '--preset', 'agriculture'], {
        env: env.env,
        cwd: env.tempDir,
      });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Integration guard — existing explain behaviour unchanged
  // -------------------------------------------------------------------------

  describe('existing explain behaviour unchanged (regression guard)', () => {
    it('zero-arg explain still shows algorithm menu', async () => {
      const result = await runCli(['explain'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/algorithm guide|when to use which algorithm/i);
    });

    it('explain with unknown algorithm still exits 1', async () => {
      const result = await runCli(['explain', 'fake_algo_xyz'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });
  });
});
