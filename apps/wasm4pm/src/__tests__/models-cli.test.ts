/**
 * Migrated from the old top-level `wpm models list|stats|clear|warm` surface.
 *
 * `wpm models` -> `wpm system models` (nouns/_removed.ts: `{ old: 'models',
 * replacement: 'system models' }`), bridged to `commands/models.ts`, which
 * still emits the legacy `{command,status,payload,meta}` envelope itself
 * (the bridge returns that object verbatim as the verb's JSON result — the
 * framework does not add a second wrapper around it).
 *
 * IMPORTANT: `commands/models.ts` only exposes `list|save|load|delete|
 * compare|export` (verified via `git log -p -- apps/wasm4pm/src/commands/
 * models.ts`, commit eded381f "feat(cli): enhance production workflow and
 * infrastructure commands", May 29 2026). That commit *intentionally*
 * relocated the model-cache `stats`/`clear` operations this old test
 * exercised onto `wpm cache models stats|clear` (now `wpm system cache
 * models stats|clear`), as part of a 3-layer cache (results/models/
 * conformance) redesign — this predates and is unrelated to the noun-verb
 * rebuild. There is no `models warm` equivalent anymore: the old
 * "toggle warm_start_enabled" feature does not exist; the closest current
 * behavior is `wpm system cache warm -i <log>`, a one-shot pre-load of a
 * given log file (different verb, different semantics), tested separately
 * below with its own contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import { resetModelCache } from '@wasm4pm/observability';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// Helper to extract JSON from CLI output (may have log/help text appended)
function extractJsonFromOutput(output: string): any {
  const startIdx = output.indexOf('{');
  if (startIdx === -1) throw new Error('No JSON found in output');

  let braceCount = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < output.length; i++) {
    const char = output[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return JSON.parse(output.substring(startIdx, i + 1));
        }
      }
    }
  }
  throw new Error('No complete JSON object found in output');
}

const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0" xes.features="nested-attributes">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <trace>
    <string key="concept:name" value="case_1"/>
    <event><string key="concept:name" value="register"/><date key="time:timestamp" value="2024-01-01T09:00:00Z"/></event>
    <event><string key="concept:name" value="decide"/><date key="time:timestamp" value="2024-01-01T09:10:00Z"/></event>
  </trace>
</log>`;

describe('wpm system models — process model repository CLI (was: wpm models)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
    resetModelCache();
  });

  afterEach(() => {
    env?.cleanup?.();
    resetModelCache();
  });

  describe('system models list', () => {
    it('should list all saved models', async () => {
      const result = await runCli(['system', 'models', 'list'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
      expect(Array.isArray(output.payload.models)).toBe(true);
      expect(output.payload.total).toBeGreaterThanOrEqual(0);
    });

    it('should report the models directory', async () => {
      const result = await runCli(['system', 'models', 'list'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(typeof output.payload.models_dir).toBe('string');
      expect(output.payload.models_dir.length).toBeGreaterThan(0);
    });

    it('should support --algorithm filter', async () => {
      const result = await runCli(['system', 'models', 'list', '--algorithm', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.filter_algorithm).toBe('dfg');
    });

    it('should report null filter_algorithm when no filter given', async () => {
      const result = await runCli(['system', 'models', 'list'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.filter_algorithm).toBeNull();
    });

    // --sort/--limit/--min-age/--max-age were never args on `models list`
    // (verified against commands/models.ts's `args` object) — the old test
    // asserted `payload.sort_by`/`payload.filter_applied` fields that this
    // verb has never emitted. Unknown citty args are accepted and ignored
    // rather than rejected, so the command still succeeds; this test now
    // just confirms that tolerance instead of a filtering effect that was
    // never implemented.
    it('accepts (and ignores) --sort/--limit/--min-age/--max-age without erroring', async () => {
      const result = await runCli(
        ['system', 'models', 'list', '--sort', 'duration', '--limit', '50', '--min-age', '60', '--max-age', '3600'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
    });
  });

  describe('system cache models stats (was: wpm models stats)', () => {
    it('should show comprehensive model-cache statistics', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
      expect(output.payload.models).toBeGreaterThanOrEqual(0);
      expect(output.payload.total_hits).toBeGreaterThanOrEqual(0);
      expect(output.payload.total_misses).toBeGreaterThanOrEqual(0);
    });

    it('should show hit rate as a percent string in [0,100]', async () => {
      // Field is `hit_rate_percent` (a "0.0"-"100.0" style string), not the
      // old `hit_rate` decimal-in-[0,1] — the cache redesign reports
      // percentages, not fractions.
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(typeof output.payload.hit_rate_percent).toBe('string');
      const hitRate = parseFloat(output.payload.hit_rate_percent);
      expect(hitRate).toBeGreaterThanOrEqual(0);
      expect(hitRate).toBeLessThanOrEqual(100);
    });

    it('should show cache size in human-readable and byte form', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.bytes_used).toBeGreaterThanOrEqual(0);
      expect(typeof output.payload.size_human).toBe('string');
    });

    it('should show time saved and average model age (human-formatted)', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(typeof output.payload.time_saved).toBe('string');
      expect(typeof output.payload.avg_model_age).toBe('string');
    });

    it('should show models per algorithm', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.models_by_algorithm).toBeDefined();
      expect(typeof output.payload.models_by_algorithm).toBe('object');
    });
  });

  describe('system cache models clear (was: wpm models clear)', () => {
    it('should clear all cached models', async () => {
      const result = await runCli(['system', 'cache', 'models', 'clear'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.models_removed).toBeGreaterThanOrEqual(0);
      expect(output.payload.algorithm).toBeNull();
    });

    it('should support clearing by algorithm', async () => {
      const result = await runCli(['system', 'cache', 'models', 'clear', '--algorithm', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.algorithm).toBe('dfg');
    });

    it('should reflect cache state changes after clear', async () => {
      const clearResult = await runCli(['system', 'cache', 'models', 'clear'], { env: env.env });
      expect(clearResult.exitCode).toBe(EXIT_CODES.success);

      const statsResult = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const stats = extractJsonFromOutput(statsResult.stdout);
      expect(stats.payload.models).toBe(0);
    });
  });

  // Replaces the old `wpm models warm --enable/--disable` toggle, which no
  // longer exists (see file header). `wpm system cache warm` is a one-shot
  // pre-load of a real log file into the discovery cache.
  describe('system cache warm (was: wpm models warm)', () => {
    it('requires an input file', async () => {
      const result = await runCli(['system', 'cache', 'warm'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('warms the cache from a real log and reports the outcome', async () => {
      const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-models-warm-'));
      const xesPath = path.join(tempDir, 'test.xes');
      await fs.writeFile(xesPath, MINIMAL_XES, 'utf-8');
      try {
        const result = await runCli(['system', 'cache', 'warm', '-i', xesPath], { env: env.env });
        expect(result.exitCode).toBe(EXIT_CODES.success);

        const output = extractJsonFromOutput(result.stdout);
        expect(output.payload.log_file).toBe('test.xes');
        expect(typeof output.payload.warmed).toBe('boolean');
        expect(output.payload.elapsed_ms).toBeGreaterThanOrEqual(0);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('exit codes across system models/cache subcommands', () => {
    it('should return success for valid operations', async () => {
      const commands = [
        ['system', 'models', 'list'],
        ['system', 'cache', 'models', 'stats'],
        ['system', 'cache', 'models', 'clear'],
      ];

      for (const cmd of commands) {
        const result = await runCli(cmd, { env: env.env });
        expect([EXIT_CODES.success, 0]).toContain(result.exitCode);
      }
    });
  });

  describe('JSON output contract', () => {
    it('should output valid JSON for all subcommands', async () => {
      const commands = [
        ['system', 'models', 'list'],
        ['system', 'cache', 'models', 'stats'],
        ['system', 'cache', 'models', 'clear'],
      ];

      for (const cmd of commands) {
        const result = await runCli(cmd, { env: env.env });
        expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
      }
    });

    it('should include status field', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.status).toBeDefined();
      expect(['ok', 'error']).toContain(output.status);
    });

    it('should include payload field', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload).toBeDefined();
    });

    it('should include duration_ms field', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      const duration = output.meta?.duration_ms ?? output.duration_ms;
      expect(duration).toBeDefined();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should include operation name', async () => {
      const result = await runCli(['system', 'cache', 'models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      const operation = output.command ?? output.operation;
      expect(operation).toBeDefined();
      expect(typeof operation).toBe('string');
    });
  });

  describe('parameter combinations', () => {
    it('should handle multiple filter parameters together on models list', async () => {
      const result = await runCli(
        ['system', 'models', 'list', '--algorithm', 'dfg', '--sort', 'duration', '--limit', '20'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should handle min-age without max-age', async () => {
      const result = await runCli(['system', 'models', 'list', '--min-age', '100'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should handle max-age without min-age', async () => {
      const result = await runCli(['system', 'models', 'list', '--max-age', '3600'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });
});
