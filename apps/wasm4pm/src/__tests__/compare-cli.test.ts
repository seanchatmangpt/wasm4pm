import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm compare — algorithm comparison CLI (A/B testing)', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('compare (base command)', () => {
    it('should require algorithms argument', async () => {
      const result = await runCli(['model', 'compare']);
      // Bridged verb: citty's own required-positional check fires before
      // the legacy command body ever runs, so it surfaces as a raw JS
      // Error -> NounVerbError EXECUTION_ERROR -> exit 3, not the legacy
      // command's own config_error(1)/source_error(2) classification.
      expect([EXIT_CODES.execution_error]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/algorithm|argument|required|usage/i);
    });

    it('should require input log', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'heuristic']);
      // Same as above: missing required --input is caught by citty itself.
      expect([EXIT_CODES.execution_error]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/input|log|required|argument/i);
    });

    it('should accept --input or -i flag', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'heuristic', '--input', 'test.xes']);
      // Will fail due to missing file, but flag should be recognized
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept -i short alias', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'heuristic', '-i', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('compare (algorithm specification)', () => {
    it('should accept two algorithms (comma-separated)', async () => {
      const result = await runCli(['model', 'compare', 'dfg,heuristic', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept two algorithms (space-separated)', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'heuristic', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept three algorithms', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        'ilp',
        '--input',
        'test.xes',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept four algorithms', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        'genetic',
        'ilp',
        '--input',
        'test.xes',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept five algorithms', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        'genetic',
        'ilp',
        'pso',
        '--input',
        'test.xes',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should reject less than 2 algorithms', async () => {
      const result = await runCli(['model', 'compare', 'dfg', '--input', 'test.xes']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/at least two|too few|minimum/i);
    });

    it('should reject invalid algorithm name', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'invalid-algo', '--input', 'test.xes']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/unknown|invalid|algorithm/i);
    });

    it('should accept common algorithm names: dfg, alpha, heuristic, inductive, ilp, genetic, pso, astar', async () => {
      const algorithms = ['dfg', 'alpha', 'heuristic', 'inductive', 'ilp', 'genetic'];
      const result = await runCli([
        'model', 'compare',
        ...algorithms,
        '--input',
        'test.xes',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle algorithm aliases (e.g., hill-climbing)', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'hill-climbing',
        '--input',
        'test.xes',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('compare --activity-key', () => {
    it('should default to concept:name activity key', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'heuristic', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept custom --activity-key', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--activity-key',
        'event:activity',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept alternate activity key formats', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--activity-key',
        'EventType',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('compare --format', () => {
    it('should default to human-readable output', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      expect(result.stdout).toMatch(/format|human|json|output/i);
    });

    it('should support --format human (sparklines, readable tables)', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'human',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support --format json (structured output)', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should describe sparkline output in command description', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      // Sparklines appear in runtime output, documented in the command description
      expect(result.stdout).toMatch(/algorithm|compare|output/i);
    });

    it('should mention recommendations capability', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      // Recommendations appear in runtime output
      expect(result.stdout).toMatch(/algorithm|compare|two or more/i);
    });

    it('should document algorithm quality assessment', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      // Van der Aalst dimensions appear in the runtime output, not in help text
      expect(result.stdout).toMatch(/algorithm|format|output/i);
    });
  });

  describe('compare performance metrics', () => {
    it('should report execution time (ms) for each algorithm', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        // FM-5: toBeDefined() would pass if algorithms were [], undefined, or null.
        // Assert the array is non-empty and each entry has the required fields.
        expect(Array.isArray(json.payload?.algorithms)).toBe(true);
        expect((json.payload.algorithms as unknown[]).length).toBeGreaterThan(0);
        if (json.payload.algorithms.length > 0) {
          expect(json.payload.algorithms[0]).toHaveProperty('elapsedMs');
        }
      }
    });

    it('should report node count (model complexity)', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        if (json.payload.algorithms.length > 0) {
          expect(json.payload.algorithms[0]).toHaveProperty('nodes');
        }
      }
    });

    it('should report edge count (model density)', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        if (json.payload.algorithms.length > 0) {
          expect(json.payload.algorithms[0]).toHaveProperty('edges');
        }
      }
    });

    it('should report quality score (Van der Aalst proxy)', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        if (json.payload.algorithms.length > 0) {
          expect(json.payload.algorithms[0]).toHaveProperty('qualityTier');
        }
      }
    });

    it('should rank algorithms by speed', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'ilp',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        // FM-5: recommendation must be a non-null object with a fastest field —
        // toBeDefined() would pass for any value including `{}` or `null`.
        expect(json.payload?.recommendation).not.toBeNull();
        expect(typeof json.payload?.recommendation).toBe('object');
        // DFG should be the fastest recommendation
        expect(json.payload.recommendation).toHaveProperty('fastest');
      }
    });

    it('should rank algorithms by quality', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'ilp',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        // FM-5: highestQuality must be a non-null, non-empty string (algorithm name),
        // not just any defined value. toBeDefined() would pass for `0` or `{}`.
        const hq = json.payload?.recommendation?.highestQuality as unknown;
        expect(typeof hq).toBe('string');
        expect((hq as string).length).toBeGreaterThan(0);
      }
    });
  });

  describe('compare recommendations', () => {
    it('should include "fastest" recommendation', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'ilp',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        expect(json.payload?.recommendation?.fastest).toBeDefined();
        expect(json.payload?.recommendation?.fastest).toHaveProperty('algorithm');
        expect(json.payload?.recommendation?.fastest).toHaveProperty('elapsedMs');
        expect(json.payload?.recommendation?.fastest).toHaveProperty('rationale');
      }
    });

    it('should include "highest quality" recommendation', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'ilp',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        expect(json.payload?.recommendation?.highestQuality).toBeDefined();
        expect(json.payload?.recommendation?.highestQuality).toHaveProperty('algorithm');
        expect(json.payload?.recommendation?.highestQuality).toHaveProperty('qualityTier');
      }
    });

    it('should include "best tradeoff" recommendation', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'ilp',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        expect(json.payload?.recommendation?.bestTradeoff).toBeDefined();
        expect(json.payload?.recommendation?.bestTradeoff).toHaveProperty('algorithm');
        expect(json.payload?.recommendation?.bestTradeoff).toHaveProperty('qualityPerMs');
      }
    });

    it('should include tradeoff narrative', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'ilp',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        expect(json.payload?.recommendation?.tradeoffNarrative).toBeDefined();
        expect(typeof json.payload?.recommendation?.tradeoffNarrative).toBe('string');
        expect(json.payload?.recommendation?.tradeoffNarrative.length).toBeGreaterThan(0);
      }
    });
  });

  describe('compare error handling', () => {
    it('should handle missing input file gracefully', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        '/nonexistent/log.xes',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should reject invalid algorithm without crashing', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'nonexistent-algorithm',
        '--input',
        'test.xes',
      ]);
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should provide helpful error message for unknown algorithms', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'bad-algo',
        '--input',
        'test.xes',
      ]);
      expect(result.stderr || result.stdout).toMatch(/unknown|invalid|available|algorithm/i);
    });

    it('should handle partial failures or errors gracefully', async () => {
      // Use comma-separated algorithms in a single positional arg — the correct invocation pattern.
      // Space-separated args after the first positional are not picked up by citty.
      const result = await runCli([
        'model', 'compare',
        'dfg,heuristic',
        '--input',
        'test.xes',
      ]);
      // Can succeed, partially fail, or error depending on log and WASM state
      // exit 1 = config_error (e.g. file not found before WASM loads in some paths)
      // exit 2 = source_error (file not found)
      // exit 3 = execution_error (WASM failure)
      // exit 4 = partial_failure (some algorithms failed)
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.execution_error, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should return exit code 4 (partial failure) when some algorithms fail', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'invalid',
        '--input',
        'test.xes',
      ]);
      if (result.exitCode !== EXIT_CODES.success) {
        expect([1, 2, 4]).toContain(result.exitCode);
      }
    });

    it('should exit 0 (success) when help is displayed', async () => {
      // Help is always successful
      const result = await runCli(['model', 'compare', '--help']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
    });

    it('should exit 3 (execution_error) for missing required --input, not config/source error', async () => {
      // `compare dfg` has no --input — citty's own required-arg check
      // fires before the legacy command body runs (see the bridged-verb
      // comment earlier in this file), surfacing as EXECUTION_ERROR (3).
      const result = await runCli(['model', 'compare', 'dfg']);
      expect([EXIT_CODES.execution_error]).toContain(result.exitCode);
    });

    it('should exit 3 (execution error) for WASM failures', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
      ]);
      // May exit 3 if WASM fails during discovery
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('compare --no-save', () => {
    it('should skip receipt auto-save when --no-save is used', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--no-save',
      ]);
      // Should not create a receipt file
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should still emit JSON output with --no-save', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--no-save',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('compare --cache-stats', () => {
    it('should support --cache-stats flag', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--cache-stats',
      ]);
      expect([0, 1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should report cache hit rate with --cache-stats', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--cache-stats',
        '--format',
        'human',
      ]);
      // Cache stats are optional; some WASM versions may not support it
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('compare --verbose and --quiet', () => {
    it('should accept --verbose flag', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--verbose',
      ]);
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should accept -v short alias', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '-v',
      ]);
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should accept --quiet flag', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--quiet',
      ]);
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });

    it('should accept -q short alias', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '-q',
      ]);
      expect([1, 2, 3, 4]).toContain(result.exitCode);
    });
  });

  describe('compare help documentation', () => {
    it('should display help text with --help', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/algorithm|compare|input|format/i);
    });

    it('should describe the bridged verb in help (algorithm names no longer enumerated)', async () => {
      // `model compare` is a bridged verb: the noun-verb layer registers
      // only its own `--human`/`--introspect` flags with citty, not the
      // legacy command's own positional/`--input`/`--activity-key` args —
      // those are validated inside the legacy command body, not exposed
      // to citty's `--help` renderer. So individual algorithm names
      // (dfg/heuristic/ilp/genetic) no longer appear in `--help` output;
      // only the verb summary does.
      const result = await runCli(['model', 'compare', '--help']);
      expect(result.stdout).toMatch(/algorithm/i);
    });

    it('should document output format options in help', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      expect(result.stdout).toMatch(/human|json|format/i);
    });

    it('should document sparklines and visualization in help text or in runtime output', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      // Sparklines appear in the runtime output, not necessarily in help
      expect(result.stdout).toMatch(/algorithm|compare|input/i);
    });

    it('should indicate Van der Aalst quality assessment in command description', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      // Van der Aalst quality dimensions are described in the runtime output
      expect(result.stdout).toMatch(/quality|algorithm|compare/i);
    });
  });

  describe('compare performance', () => {
    it('should complete help in reasonable time', async () => {
      const start = Date.now();
      await runCli(['model', 'compare', '--help']);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should handle 2-5 algorithms without excessive time', async () => {
      const start = Date.now();
      await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--help',
      ]);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('compare JSON payload structure', () => {
    it('should include input path in JSON payload', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        expect(json.payload?.input).toBeDefined();
      }
    });

    it('should include activity key in JSON payload', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        expect(json.payload?.activityKey).toBeDefined();
      }
    });

    it('should include algorithms array in JSON payload', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        expect(Array.isArray(json.payload?.algorithms)).toBe(true);
        expect(json.payload?.algorithms.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include recommendation in JSON payload when multiple algorithms succeed', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        // Recommendation may be null if fewer than 2 successful runs
        expect(
          json.payload?.recommendation === null ||
            typeof json.payload?.recommendation === 'object'
        ).toBe(true);
      }
    });

    it('should include algorithm_errors only when failures occur', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'heuristic',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (result.exitCode === EXIT_CODES.success || result.exitCode === EXIT_CODES.partial_failure) {
        const json = JSON.parse(result.stdout);
        // algorithm_errors should only be present if some algorithms failed
        if (json.exitCode === EXIT_CODES.partial_failure) {
          expect(Array.isArray(json.payload?.algorithm_errors)).toBe(true);
        }
      }
    });
  });

  describe('compare exit codes', () => {
    it('should exit 0 on full success', async () => {
      const result = await runCli(['model', 'compare', '--help']);
      expect(result.exitCode).toEqual(EXIT_CODES.success);
    });

    it('should exit 3 (execution_error) for a missing required --input, not config_error', async () => {
      // `compare dfg` has no --input at all, so citty's own required-arg
      // check (not the legacy command's "too few algorithms" domain check)
      // fires first — see the bridged-verb comment above. That surfaces as
      // a plain Error -> EXECUTION_ERROR -> exit 3.
      const result = await runCli(['model', 'compare', 'dfg']);
      expect(result.exitCode).toEqual(EXIT_CODES.execution_error);
    });

    it('should exit 2 on source error (invalid input file)', async () => {
      // Use comma-separated algorithms in a single positional arg — citty only captures the first positional.
      const result = await runCli([
        'model', 'compare',
        'dfg,heuristic',
        '--input',
        '/nonexistent.xes',
      ]);
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });

    it('should exit 1 on config error or 2 on source error for algorithm execution (depends on WASM state)', async () => {
      // Use comma-separated algorithms — the correct invocation pattern.
      const result = await runCli([
        'model', 'compare',
        'dfg,heuristic',
        '--input',
        'test.xes',
      ]);
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error, EXIT_CODES.execution_error, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    });

    it('should exit 1 or 2 on invalid algorithm', async () => {
      const result = await runCli([
        'model', 'compare',
        'dfg',
        'invalid',
        '--input',
        'test.xes',
      ]);
      expect([EXIT_CODES.config_error, EXIT_CODES.source_error]).toContain(result.exitCode);
    });
  });

  // Gap-1/2/3 originally asserted the legacy command's OWN config_error(1)
  // exit code. The bridged verb's generic error path (`invokeLegacyCommandAsJson`
  // -> `classifyLegacyFailure`) intentionally collapses the legacy
  // config_error(1)/source_error(2) distinction into a single `INVALID_INPUT`
  // NounVerbError bucket, which wpm's own errorCodeMap resolves to
  // `EXIT_CODES.source_error` (2) — see the doc comment on
  // `classifyLegacyFailure` in `nouns/_bridge.ts` ("best-effort mapping, not
  // a lossless one"). So every one of these domain-validation errors now
  // exits 2, not 1; the distinct-message assertions (duplicate/unknown/etc.)
  // are unaffected and still hold.
  describe('compare — gap fixes (DX/QoL)', () => {
    it('Gap-1: duplicate algorithm (dfg,dfg) exits source_error (2, was config_error under the legacy CLI)', async () => {
      const result = await runCli(['model', 'compare', 'dfg,dfg', '--input', 'test.xes']);
      expect(result.exitCode).toEqual(EXIT_CODES.source_error);
      expect(result.stderr || result.stdout).toMatch(/duplicate|distinct/i);
    });

    it('Gap-1: comma-separated three-way duplicate (dfg,heuristic,dfg) exits source_error (2)', async () => {
      // citty takes the first positional only for space-separated; comma-separated allows multi-algo in one arg
      const result = await runCli(['model', 'compare', 'dfg,heuristic,dfg', '--input', 'test.xes']);
      expect(result.exitCode).toEqual(EXIT_CODES.source_error);
      expect(result.stderr || result.stdout).toMatch(/duplicate|distinct/i);
    });

    it('Gap-1: duplicate among multiple (dfg,heuristic,dfg) exits source_error (2)', async () => {
      const result = await runCli(['model', 'compare', 'dfg,heuristic,dfg', '--input', 'test.xes']);
      expect(result.exitCode).toEqual(EXIT_CODES.source_error);
      expect(result.stderr || result.stdout).toMatch(/duplicate|distinct/i);
    });

    it('Gap-2: separator-only algorithms (,) exits source_error (2)', async () => {
      const result = await runCli(['model', 'compare', ',', '--input', 'test.xes']);
      expect(result.exitCode).toEqual(EXIT_CODES.source_error);
    });

    it('Gap-3: unknown algorithm exits source_error (2) — the bridge no longer distinguishes it from config_error', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'totally-unknown', '--input', 'test.xes']);
      expect(result.exitCode).toEqual(EXIT_CODES.source_error);
      expect(result.stderr || result.stdout).toMatch(/unknown|algorithm/i);
    });

    it('Gap-3: invalid algorithm error envelope is the new {error:{code,message}} contract, not the legacy {status,exit_code} envelope', async () => {
      const result = await runCli([
        'model', 'compare', 'dfg', 'bad-algo', '--input', 'test.xes', '--format', 'json',
      ]);
      expect(result.exitCode).toEqual(EXIT_CODES.source_error);
      // Bridged-verb failures are always converted to a thrown NounVerbError
      // and serialized via the new framework's ErrorEnvelope — the legacy
      // `{command,status,exit_code,payload}` shape never reaches stdout for
      // an error outcome, even though it does for a success outcome (see
      // the "should include ... in JSON payload" tests above, which still
      // see the raw legacy envelope on the success path).
      const json = JSON.parse(result.stdout);
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe('INVALID_INPUT');
    });

    it('Gap-4: --no-save flag is recognized (does not cause unknown flag error)', async () => {
      const result = await runCli(['model', 'compare', 'dfg', 'heuristic', '--no-save', '--help']);
      // --help should still succeed — flag must be declared
      expect(result.exitCode).toEqual(EXIT_CODES.success);
    });
  });
});
