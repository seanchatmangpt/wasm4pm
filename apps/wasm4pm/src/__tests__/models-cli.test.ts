import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import { getModelCache, resetModelCache } from '@wasm4pm/observability';

// Helper to extract JSON from CLI output (may have help text appended)
function extractJsonFromOutput(output: string): unknown {
  // Find the first JSON object by looking for leading { and parsing carefully
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

describe('wpm models — cached process model management CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
    resetModelCache();
  });

  afterEach(() => {
    env?.cleanup?.();
    resetModelCache();
  });

  describe('models list', () => {
    it('should list all cached models', async () => {
      const result = await runCli(['models', 'list'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
      expect(output.payload.cache_info).toBeDefined();
    });

    it('should show cache statistics', async () => {
      const result = await runCli(['models', 'list'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.cache_info.total_models).toBeGreaterThanOrEqual(0);
      expect(output.payload.cache_info.total_hits).toBeGreaterThanOrEqual(0);
      expect(output.payload.cache_info.total_misses).toBeGreaterThanOrEqual(0);
      expect(output.payload.cache_info.hit_rate).toBeGreaterThanOrEqual(0);
      expect(output.payload.cache_info.hit_rate).toBeLessThanOrEqual(1);
    });

    it('should include cache size in bytes', async () => {
      const result = await runCli(['models', 'list'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.cache_info.cache_size_bytes).toBeGreaterThanOrEqual(0);
      expect(typeof output.payload.cache_info.cache_size_bytes).toBe('number');
    });

    it('should show average model age', async () => {
      const result = await runCli(['models', 'list'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.cache_info.avg_model_age_ms).toBeGreaterThanOrEqual(0);
    });

    it('should support --algorithm filter', async () => {
      const result = await runCli(['models', 'list', '--algorithm', 'dfg'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.filter_applied).toBeDefined();
    });

    it('should support --sort parameter', async () => {
      const result = await runCli(['models', 'list', '--sort', 'duration'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.sort_by).toBeDefined();
    });

    it('should support --limit parameter', async () => {
      const result = await runCli(['models', 'list', '--limit', '50'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
      // Limit parameter is accepted by the CLI
    });

    it('should support --min-age and --max-age filters', async () => {
      const result = await runCli(
        ['models', 'list', '--min-age', '60', '--max-age', '3600'],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should report filtered algorithms', async () => {
      const result = await runCli(['models', 'list'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(Array.isArray(output.payload.filtered_algorithms)).toBe(true);
    });

    it('should show models by algorithm breakdown', async () => {
      const result = await runCli(['models', 'list'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.cache_info.models_by_algorithm).toBeDefined();
      expect(typeof output.payload.cache_info.models_by_algorithm).toBe('object');
    });
  });

  describe('models stats', () => {
    it('should show comprehensive cache statistics', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
    });

    it('should show hit rate as decimal string', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.hit_rate).toBeDefined();
      expect(typeof output.payload.hit_rate).toBe('string');
      const hitRate = parseFloat(output.payload.hit_rate);
      expect(hitRate).toBeGreaterThanOrEqual(0);
      expect(hitRate).toBeLessThanOrEqual(1);
    });

    it('should show cache size in both bytes and MB', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.cache_size_bytes).toBeGreaterThanOrEqual(0);
      expect(output.payload.cache_size_mb).toBeDefined();
    });

    it('should show time saved metrics', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.time_saved_ms).toBeGreaterThanOrEqual(0);
      expect(output.payload.time_saved_seconds).toBeDefined();
    });

    it('should report cache path', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.cache_path).toBe('.wasm4pm/models/');
    });

    it('should show average model age in seconds', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.avg_model_age_seconds).toBeGreaterThanOrEqual(0);
      expect(typeof output.payload.avg_model_age_seconds).toBe('number');
    });

    it('should show models per algorithm', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.models_by_algorithm).toBeDefined();
      expect(typeof output.payload.models_by_algorithm).toBe('object');
    });
  });

  describe('models clear', () => {
    it('should clear all cached models', async () => {
      const result = await runCli(['models', 'clear'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload.all_cleared).toBe(true);
      expect(output.payload.models_cleared).toBeGreaterThanOrEqual(0);
    });

    it('should support clearing by algorithm', async () => {
      const result = await runCli(['models', 'clear', '--algorithm', 'dfg'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
      // Algorithm parameter accepted by the CLI
    });

    it('should report total models before clearing', async () => {
      const result = await runCli(['models', 'clear'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.total_before).toBeGreaterThanOrEqual(0);
    });

    it('should work with --confirm flag', async () => {
      const result = await runCli(['models', 'clear', '--confirm'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('models warm', () => {
    it('should show warm-start cache status', async () => {
      const result = await runCli(['models', 'warm'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);

      const output = extractJsonFromOutput(result.stdout);
      expect(output.payload).toBeDefined();
    });

    it('should report warm_start_enabled flag', async () => {
      const result = await runCli(['models', 'warm'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.warm_start_enabled).toBe(true);
    });

    it('should show currently cached models count', async () => {
      const result = await runCli(['models', 'warm'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.current_cached_models).toBeGreaterThanOrEqual(0);
    });

    it('should show hit rate', async () => {
      const result = await runCli(['models', 'warm'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.hit_rate).toBeDefined();
      const hitRate = parseFloat(output.payload.hit_rate);
      expect(hitRate).toBeGreaterThanOrEqual(0);
      expect(hitRate).toBeLessThanOrEqual(1);
    });

    it('should show time saved metric', async () => {
      const result = await runCli(['models', 'warm'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.time_saved_ms).toBeGreaterThanOrEqual(0);
    });

    it('should provide recommendation based on hit rate', async () => {
      const result = await runCli(['models', 'warm'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload.recommendation).toBeDefined();
      expect(typeof output.payload.recommendation).toBe('string');
    });

    it('should support --enable flag', async () => {
      const result = await runCli(['models', 'warm', '--enable'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should support --disable flag', async () => {
      const result = await runCli(['models', 'warm', '--disable'], { env: env.env });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });

  describe('models exit codes', () => {
    it('should return success for valid operations', async () => {
      const commands = [
        ['models', 'list'],
        ['models', 'stats'],
        ['models', 'clear'],
        ['models', 'warm'],
      ];

      for (const cmd of commands) {
        const result = await runCli(cmd, { env: env.env });
        expect([EXIT_CODES.success, 0]).toContain(result.exitCode);
      }
    });
  });

  describe('models JSON output format', () => {
    it('should output valid JSON for all subcommands', async () => {
      const commands = [
        ['models', 'list'],
        ['models', 'stats'],
        ['models', 'clear'],
        ['models', 'warm'],
      ];

      for (const cmd of commands) {
        const result = await runCli(cmd, { env: env.env });
        expect(() => extractJsonFromOutput(result.stdout)).not.toThrow();
      }
    });

    it('should include status field', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.status).toBeDefined();
      expect(['ok', 'error']).toContain(output.status);
    });

    it('should include payload field', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      expect(output.payload).toBeDefined();
    });

    it('should include duration_ms field', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      const duration = output.meta?.duration_ms ?? output.duration_ms;
      expect(duration).toBeDefined();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should include operation name', async () => {
      const result = await runCli(['models', 'stats'], { env: env.env });
      const output = extractJsonFromOutput(result.stdout);

      const operation = output.command ?? output.operation;
      expect(operation).toBeDefined();
      expect(typeof operation).toBe('string');
    });
  });

  describe('models with cached data', () => {
    it('should reflect cache state changes after clear', async () => {
      // Get initial stats
      const statsResult1 = await runCli(['models', 'stats'], { env: env.env });
      const stats1 = extractJsonFromOutput(statsResult1.stdout);

      // Clear cache
      const clearResult = await runCli(['models', 'clear'], { env: env.env });
      expect(clearResult.exitCode).toBe(EXIT_CODES.success);

      // Get stats again
      const statsResult2 = await runCli(['models', 'stats'], { env: env.env });
      const stats2 = extractJsonFromOutput(statsResult2.stdout);

      // After clear, total should be 0
      expect(stats2.payload.total_models).toBe(0);
    });
  });

  describe('models parameter combinations', () => {
    it('should handle multiple filter parameters together', async () => {
      const result = await runCli(
        [
          'models',
          'list',
          '--algorithm',
          'dfg',
          '--sort',
          'duration',
          '--limit',
          '20',
        ],
        { env: env.env }
      );
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should handle min-age without max-age', async () => {
      const result = await runCli(['models', 'list', '--min-age', '100'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should handle max-age without min-age', async () => {
      const result = await runCli(['models', 'list', '--max-age', '3600'], {
        env: env.env,
      });
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });
  });
});
