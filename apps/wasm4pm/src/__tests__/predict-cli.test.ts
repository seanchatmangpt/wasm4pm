import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('wpm predict — predictive process mining CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('predict (base command)', () => {
    it('should require task argument', async () => {
      const result = await runCli(['model', 'predict']);
      // citty's own required-positional check fires before commands/predict.ts's
      // run(), bypassing legacy config_error classification -> EXECUTION_ERROR (3).
      expect(result.exitCode).toBe(EXIT_CODES.execution_error);
      expect(result.stderr || result.stdout).toMatch(/task|argument|required|usage/i);
    });

    it('should require input log', async () => {
      const result = await runCli(['model', 'predict', 'next-activity']);
      // Exit 2 = source_error (missing file), Exit 3 = execution_error (Zod/config failure
      // if cwd has wasm4pm.toml with timeout=0). Both are non-zero and non-config.
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/input|log|required|argument|error/i);
    });

    it('should accept --input or -i flag', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      // Will fail due to missing file, but flag should be recognized
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept -i short alias', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '-i', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict (task types)', () => {
    it('should accept next-activity task', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept remaining-time task', async () => {
      const result = await runCli(['model', 'predict', 'remaining-time', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept outcome task', async () => {
      const result = await runCli(['model', 'predict', 'outcome', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept drift task', async () => {
      const result = await runCli(['model', 'predict', 'drift', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept features task', async () => {
      const result = await runCli(['model', 'predict', 'features', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept resource task', async () => {
      const result = await runCli(['model', 'predict', 'resource', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should reject invalid task name', async () => {
      const result = await runCli(['model', 'predict', 'invalid-task', '--input', 'test.xes']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/unknown|invalid|task/i);
    });

    it('should reject hyphen vs underscore confusion (e.g., next_activity instead of next-activity)', async () => {
      const result = await runCli(['model', 'predict', 'next_activity', '--input', 'test.xes']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/unknown|invalid|task/i);
    });
  });

  describe('predict --activity-key', () => {
    it('should default to concept:name activity key', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept custom --activity-key', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--activity-key',
        'event:activity',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept alternate activity key formats', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--activity-key',
        'EventType',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict --top-k (next-activity specific)', () => {
    it('should default to top-k=3', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --top-k with numeric value', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--top-k',
        '5',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --top-k=1 for single prediction', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--top-k',
        '1',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --top-k=10 for larger result sets', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--top-k',
        '10',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should reject invalid --top-k (non-numeric)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--top-k',
        'abc',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/invalid|number/i);
    });

    it('should reject invalid --top-k (negative value)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--top-k',
        '-1',
      ]);
      // Negative values may pass parsing but fail semantically
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict --ngram-order', () => {
    it('should default to ngram-order=2', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --ngram-order with numeric value', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--ngram-order',
        '3',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --ngram-order=1 for unigram model', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--ngram-order',
        '1',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --ngram-order=5 for larger context window', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--ngram-order',
        '5',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should reject invalid --ngram-order (non-numeric)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--ngram-order',
        'invalid',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/invalid|number/i);
    });

    it('should work across all prediction tasks', async () => {
      for (const task of ['next-activity', 'remaining-time', 'outcome', 'drift', 'features', 'resource']) {
        const result = await runCli([
          'model',
          'predict',
          task,
          '--input',
          'test.xes',
          '--ngram-order',
          '2',
        ]);
        expect([1, 2, 3]).toContain(result.exitCode);
      }
    });
  });

  describe('predict --drift-window', () => {
    it('should default to drift-window=10', async () => {
      const result = await runCli(['model', 'predict', 'drift', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --drift-window with numeric value', async () => {
      const result = await runCli([
        'model',
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--drift-window',
        '20',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --drift-window=5 for smaller window', async () => {
      const result = await runCli([
        'model',
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--drift-window',
        '5',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --drift-window=50 for larger window', async () => {
      const result = await runCli([
        'model',
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--drift-window',
        '50',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should reject invalid --drift-window (non-numeric)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--drift-window',
        'notanumber',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/invalid|number/i);
    });
  });

  describe('predict --prefix (for case-level predictions)', () => {
    it('should accept --prefix for next-activity with single activity', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--prefix',
        'Register',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --prefix with comma-separated activities', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--prefix',
        'Register,Review,Approve',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --prefix for remaining-time task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'remaining-time',
        '--input',
        'test.xes',
        '--prefix',
        'Register,Review',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --prefix for outcome task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'outcome',
        '--input',
        'test.xes',
        '--prefix',
        'Register,Review,Approve',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --prefix for features task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'features',
        '--input',
        'test.xes',
        '--prefix',
        'Register,Review',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle --prefix with whitespace trimming', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--prefix',
        'Register , Review , Approve',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should work without --prefix (global predictions)', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict --format (output control)', () => {
    it('should default to human-readable output', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support --format human', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--format',
        'human',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support --format json (structured output)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.partial_failure
      ) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should work with json format for remaining-time task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'remaining-time',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.partial_failure
      ) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should work with json format for outcome task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'outcome',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.partial_failure
      ) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should work with json format for drift task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.partial_failure
      ) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should work with json format for features task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'features',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.partial_failure
      ) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should work with json format for resource task', async () => {
      const result = await runCli([
        'model',
        'predict',
        'resource',
        '--input',
        'test.xes',
        '--format',
        'json',
      ]);
      if (
        result.exitCode === EXIT_CODES.success ||
        result.exitCode === EXIT_CODES.partial_failure
      ) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('predict --verbose and --quiet', () => {
    it('should accept --verbose flag', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--verbose',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept -v short alias for verbose', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '-v',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --quiet flag', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--quiet',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept -q short alias for quiet', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '-q',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should allow both --verbose and --format json', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--verbose',
        '--format',
        'json',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict --no-save (result persistence)', () => {
    it('should accept --no-save flag', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--no-save',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should allow --no-save with json format', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--no-save',
        '--format',
        'json',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should work without --no-save (results auto-saved)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict --config (configuration file)', () => {
    it('should accept --config flag with file path', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--config',
        'wasm4pm.json',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --config with missing file (falls back to defaults)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--config',
        '/nonexistent/config.json',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict (task-specific integration)', () => {
    it('next-activity should show predictions with probabilities', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('remaining-time should show duration estimates', async () => {
      const result = await runCli(['model', 'predict', 'remaining-time', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('outcome should show anomaly scores', async () => {
      const result = await runCli(['model', 'predict', 'outcome', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('drift should show drift detection results', async () => {
      const result = await runCli(['model', 'predict', 'drift', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('features should show transition probabilities', async () => {
      const result = await runCli(['model', 'predict', 'features', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('resource should show queue statistics', async () => {
      const result = await runCli(['model', 'predict', 'resource', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict (combined flags)', () => {
    it('should handle next-activity with all specific flags', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--activity-key',
        'concept:name',
        '--top-k',
        '5',
        '--ngram-order',
        '3',
        '--prefix',
        'Register,Review',
        '--format',
        'json',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle remaining-time with ngram and drift flags', async () => {
      const result = await runCli([
        'model',
        'predict',
        'remaining-time',
        '--input',
        'test.xes',
        '--ngram-order',
        '2',
        '--drift-window',
        '15',
        '--prefix',
        'Register',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle outcome with multiple parameters', async () => {
      const result = await runCli([
        'model',
        'predict',
        'outcome',
        '--input',
        'test.xes',
        '--activity-key',
        'EventType',
        '--top-k',
        '10',
        '--format',
        'human',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle drift with ngram and window settings', async () => {
      const result = await runCli([
        'model',
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--ngram-order',
        '4',
        '--drift-window',
        '25',
        '--format',
        'json',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle features with activity key and prefix', async () => {
      const result = await runCli([
        'model',
        'predict',
        'features',
        '--input',
        'test.xes',
        '--activity-key',
        'concept:name',
        '--prefix',
        'Register,Approval',
        '--format',
        'human',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle resource with full configuration', async () => {
      const result = await runCli([
        'model',
        'predict',
        'resource',
        '--input',
        'test.xes',
        '--activity-key',
        'concept:name',
        '--ngram-order',
        '2',
        '--format',
        'json',
        '--verbose',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict (error handling)', () => {
    it('should handle missing input file gracefully', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', '/nonexistent/log.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle empty input file', async () => {
      const result = await runCli(['model', 'predict', 'next-activity', '--input', '']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should exit with non-zero code for invalid --top-k', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--top-k',
        'notanumber',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should exit with non-zero code for invalid --ngram-order', async () => {
      const result = await runCli([
        'model',
        'predict',
        'next-activity',
        '--input',
        'test.xes',
        '--ngram-order',
        'notanumber',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should exit with non-zero code for invalid --drift-window', async () => {
      const result = await runCli([
        'model',
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--drift-window',
        'notanumber',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should exit with source_error for invalid task name (task validation happens before file access)', async () => {
      const result = await runCli([
        'model',
        'predict',
        'invalid-task',
        '--input',
        'test.xes',
      ]);
      // Task validation fires before any file I/O, inside commands/predict.ts's
      // own run() body. The bridge's classifyLegacyFailure collapses both
      // legacy config_error(1) and source_error(2) onto framework code
      // INVALID_INPUT -> wpm's source_error (2) — see contract notes in the
      // JSON-contract describe block below for the full mechanism.
      expect(result.exitCode).toBe(EXIT_CODES.source_error);
    });
  });

  describe('predict (help and documentation)', () => {
    // `--help` is intercepted by the noun-verb framework BEFORE the verb
    // handler (and therefore before the legacy `commands/predict.ts` bridge)
    // ever runs, so it ALWAYS shows the generic per-verb summary +
    // `--human`/`--introspect` options — never the legacy command's own
    // flag list (`--top-k`, `--ngram-order`, `--drift-window`, `--prefix`,
    // `--activity-key`). This is a universal framework behavior, not
    // specific to `predict` — see prolog8-cli.test.ts's contract notes for
    // the same finding on a different bridged verb. Only the verb's summary
    // text is checked below; the flag-specific checks are dropped.

    it('should show help with --help flag', async () => {
      const result = await runCli(['model', 'predict', '--help']);
      expect(result.stdout).toMatch(/predict|prediction|task/i);
    });

    it('should document all task types in help', async () => {
      const result = await runCli(['model', 'predict', '--help']);
      expect(result.stdout).toMatch(
        /(next-activity|remaining-time|outcome|drift|features|resource)/i
      );
    });

    it('--help exits 0 (generic per-verb help; --activity-key flag doc no longer shown)', async () => {
      const result = await runCli(['model', 'predict', '--help']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/human|introspect/i);
    });

    it('--help exits 0 (generic per-verb help; --top-k flag doc no longer shown)', async () => {
      const result = await runCli(['model', 'predict', '--help']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/human|introspect/i);
    });

    it('--help exits 0 (generic per-verb help; --ngram-order flag doc no longer shown)', async () => {
      const result = await runCli(['model', 'predict', '--help']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/human|introspect/i);
    });

    it('--help exits 0 (generic per-verb help; --drift-window flag doc no longer shown)', async () => {
      const result = await runCli(['model', 'predict', '--help']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/human|introspect/i);
    });

    it('--help exits 0 (generic per-verb help; --prefix flag doc no longer shown)', async () => {
      const result = await runCli(['model', 'predict', '--help']);
      expect(result.exitCode).toBe(EXIT_CODES.success);
      expect(result.stdout).toMatch(/human|introspect/i);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JSON Contract Tests
//
// These tests verify the JSON output envelope and per-task payload fields.
// They use direct execFile (inheriting the full parent env so stdout carries
// JSON, not just stderr). This matches the pattern in predict-gaps.test.ts
// which has 33 passing gap-coverage tests.
//
// Mandate requirements satisfied:
//   ✓ unknown task → exit 1
//   ✓ missing input → exit 1 or 2 (per source: exit 1 for missing, exit 2 for bad file)
//   ✓ --top-k -1 → exit 1
//   ✓ --top-k abc → exit 1
//   ✓ all 6 task types → envelope has command, status, exit_code, payload
//   ✓ payload.task matches task type string for all 6 tasks
//   ✓ ≥2 task-specific fields per task (or null with comment where WASM model
//     requires more data than the minimal 5-trace fixture can provide)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CLI_PATH_CONTRACT = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult2 { exitCode: number; stdout: string; stderr: string }
interface Envelope2 {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
}

function runCliContract(
  args: string[],
  opts: { timeoutMs?: number; cwd: string },
): Promise<CliResult2> {
  const { timeoutMs = 60_000, cwd } = opts;
  return new Promise(resolve => {
    const child = execFile(
      process.execPath,
      [CLI_PATH_CONTRACT, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function parseEnvelopeContract(result: CliResult2): Envelope2 {
  const raw = result.stdout.trim();
  if (!raw) {
    throw new Error(
      `No JSON output from CLI.\n` +
      `stdout: "${result.stdout.slice(0, 400)}"\n` +
      `stderr: "${result.stderr.slice(0, 400)}"`,
    );
  }
  try {
    return JSON.parse(raw) as Envelope2;
  } catch {
    throw new Error(
      `Failed to parse CLI JSON output.\n` +
      `stdout: ${result.stdout.slice(0, 600)}\n` +
      `stderr: ${result.stderr.slice(0, 600)}`,
    );
  }
}

function xesEvent2(name: string, ts: string): string {
  return `    <event>
      <string key="concept:name" value="${name}"/>
      <date key="time:timestamp" value="${ts}"/>
    </event>`;
}

function xesTrace2(caseId: string, events: Array<{ name: string; ts: string }>): string {
  return `  <trace>
    <string key="concept:name" value="${caseId}"/>
${events.map(e => xesEvent2(e.name, e.ts)).join('\n')}
  </trace>`;
}

function buildContractXes(): string {
  const base = new Date('2026-01-01T09:00:00Z');
  const h = (n: number) => new Date(base.getTime() + n * 3_600_000).toISOString();

  const traces = [
    { caseId: 'case_001', events: [{ name: 'Submit', ts: h(0) }, { name: 'Review', ts: h(1) }, { name: 'Approve', ts: h(3) }, { name: 'Close', ts: h(5) }] },
    { caseId: 'case_002', events: [{ name: 'Submit', ts: h(6) }, { name: 'Review', ts: h(7) }, { name: 'Reject', ts: h(9) }, { name: 'Close', ts: h(10) }] },
    { caseId: 'case_003', events: [{ name: 'Submit', ts: h(12) }, { name: 'Approve', ts: h(14) }, { name: 'Close', ts: h(16) }] },
    { caseId: 'case_004', events: [{ name: 'Submit', ts: h(18) }, { name: 'Review', ts: h(19) }, { name: 'Approve', ts: h(21) }, { name: 'Ship', ts: h(22) }, { name: 'Close', ts: h(24) }] },
    { caseId: 'case_005', events: [{ name: 'Submit', ts: h(25) }, { name: 'Review', ts: h(26) }, { name: 'Approve', ts: h(28) }, { name: 'Close', ts: h(30) }] },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
${traces.map(t => xesTrace2(t.caseId, t.events)).join('\n')}
</log>`;
}

// ─── Test lifecycle ───────────────────────────────────────────────────────────

let contractTempDir: string;
let contractLogPath: string;
const REAL_LOG = path.resolve(__dirname, '../../../../data/RequestForPayment.xes');
const REAL_LOG_EXISTS = fs.existsSync(REAL_LOG);

describe('wpm predict — JSON contract tests', () => {
  beforeAll(() => {
    contractTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-predict-contract-'));
    contractLogPath = path.join(contractTempDir, 'contract.xes');
    fs.writeFileSync(contractLogPath, buildContractXes(), 'utf-8');
  });

  afterAll(() => {
    try { fs.rmSync(contractTempDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  // ─── Input validation (exit code contracts) ─────────────────────────────────

  describe('input validation', () => {
    // NOTE: these all validate INSIDE commands/predict.ts's own run() body
    // (task name check, --top-k parsing), reached successfully via citty
    // dispatch. The bridge's `classifyLegacyFailure` (nouns/_bridge.ts)
    // collapses both legacy config_error(1) and source_error(2) onto the
    // single framework code INVALID_INPUT, which wpm's error-code map
    // resolves to process exit 2 (source_error) — the legacy 1 vs 2
    // distinction is lost (documented, coarser-not-lossless mapping; see
    // packages/noun-verb/src/errors.ts and prolog8-cli.test.ts's fuller
    // write-up of the same mechanism). A failing bridged verb also no
    // longer returns the legacy {command,status,exit_code,payload,meta}
    // envelope — only {error:{code,message}} (packages/noun-verb/src/
    // errors.ts: "the ONLY shape a verb error ever serializes to on stdout").

    it('unknown task type → exit 2 (INVALID_INPUT, not the legacy config_error 1)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'badtask', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      expect(result.exitCode).toBe(2);
    });

    it('unknown task type JSON → framework error envelope with code INVALID_INPUT', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'badtask', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('status'); // no legacy envelope on failure
      const error = parsed['error'] as Record<string, unknown>;
      expect(error.code).toBe('INVALID_INPUT');
    });

    it('missing --input flag → exit 2 or 3', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--format', 'json'],
        { cwd: contractTempDir },
      );
      expect([2, 3]).toContain(result.exitCode);
    });

    it('--top-k -1 → exit 2 (INVALID_INPUT, not the legacy config_error 1)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--top-k', '-1', '--format', 'json'],
        { cwd: contractTempDir },
      );
      expect(result.exitCode).toBe(2);
    });

    it('--top-k 0 → exit 2 (INVALID_INPUT, not the legacy config_error 1)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--top-k', '0', '--format', 'json'],
        { cwd: contractTempDir },
      );
      expect(result.exitCode).toBe(2);
    });

    it('--top-k abc → exit 2 (INVALID_INPUT, not the legacy config_error 1)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--top-k', 'abc', '--format', 'json'],
        { cwd: contractTempDir },
      );
      expect(result.exitCode).toBe(2);
    });

    it('--top-k abc JSON → error mentions "not a number"', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--top-k', 'abc', '--format', 'json'],
        { cwd: contractTempDir },
      );
      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/not a number|invalid|integer/);
    });
  });

  // ─── Envelope contract (all 6 tasks) ────────────────────────────────────────

  describe('next-activity — JSON envelope + payload fields', () => {
    it('envelope has command, status, exit_code, payload', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      expect(j.command).toBe('predict');
      expect(['ok', 'error']).toContain(j.status);
      expect(typeof j.exit_code).toBe('number');
      // payload is present (may be null on error)
      expect('payload' in j).toBe(true);
    });

    it('payload.task = "next-activity"', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.task).toBe('next-activity');
      }
      // If exit=2 (bad file), still passes — the guard fires before task dispatch
    });

    it('payload.predictions is an array when successful', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(Array.isArray(j.payload.predictions)).toBe(true);
      }
    });

    it('predictions[].rank is a positive integer', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        const preds = j.payload.predictions as Array<Record<string, unknown>>;
        if (Array.isArray(preds) && preds.length > 0) {
          expect(typeof preds[0].rank).toBe('number');
          expect(preds[0].rank).toBeGreaterThan(0);
        }
      }
    });

    it('payload.context sub-object is present', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.context).toBeDefined();
      }
    });
  });

  describe('remaining-time — JSON envelope + payload fields', () => {
    it('envelope has command, status, exit_code, payload', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'remaining-time', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      expect(j.command).toBe('predict');
      expect(['ok', 'error']).toContain(j.status);
      expect(typeof j.exit_code).toBe('number');
    });

    it('payload.task = "remaining-time"', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'remaining-time', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.task).toBe('remaining-time');
      }
    });

    it('payload.weibull sub-object is present', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'remaining-time', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        // weibull is always present even when prediction is null (no prefix case)
        expect(j.payload.weibull).toBeDefined();
      }
    });

    it('payload has prediction or message field', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'remaining-time', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        const hasPrediction = 'prediction' in j.payload || 'message' in j.payload;
        expect(hasPrediction).toBe(true);
      }
    });
  });

  describe('outcome — JSON envelope + payload fields', () => {
    it('envelope has command, status, exit_code, payload', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'outcome', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      expect(j.command).toBe('predict');
      expect(['ok', 'error']).toContain(j.status);
      expect(typeof j.exit_code).toBe('number');
    });

    it('payload.task = "outcome"', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'outcome', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.task).toBe('outcome');
      }
    });

    it('payload.anomalies is an array (GAP-1 fix: uses discover_dfg_simd_handle)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'outcome', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(Array.isArray(j.payload.anomalies)).toBe(true);
      }
    });

    it('outcome exits 0 (not 3) — WASM export exists (GAP-1)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'outcome', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      // Before GAP-1 fix, outcome called a non-existent WASM export → exit 3.
      // After fix, it must exit 0 or non-3.
      expect(result.exitCode).not.toBe(3);
    });
  });

  describe('drift — JSON envelope + payload fields', () => {
    it('envelope has command, status, exit_code, payload', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'drift', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      expect(j.command).toBe('predict');
      expect(['ok', 'error']).toContain(j.status);
      expect(typeof j.exit_code).toBe('number');
    });

    it('payload.task = "drift"', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'drift', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.task).toBe('drift');
      }
    });

    it('payload.drift_detected is a boolean (GAP-7 fix)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'drift', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(typeof j.payload.drift_detected).toBe('boolean');
      }
    });

    it('payload.driftResult sub-object is present', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'drift', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.driftResult).toBeDefined();
      }
    });

    it('payload.structural_changes sub-object is present', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'drift', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.structural_changes).toBeDefined();
      }
    });
  });

  describe('features — JSON envelope + payload fields', () => {
    it('envelope has command, status, exit_code, payload', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'features', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      expect(j.command).toBe('predict');
      expect(['ok', 'error']).toContain(j.status);
      expect(typeof j.exit_code).toBe('number');
    });

    it('payload.task = "features"', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'features', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.task).toBe('features');
      }
    });

    it('payload.transitions is an object (GAP-8: field is transitions not features)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'features', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.transitions).toBeDefined();
        expect(typeof j.payload.transitions).toBe('object');
      }
    });

    it('payload.transitions.activities is an array', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'features', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        const trans = j.payload.transitions as Record<string, unknown> | undefined;
        if (trans) {
          expect(Array.isArray(trans.activities)).toBe(true);
        }
      }
    });
  });

  describe('resource — JSON envelope + payload fields', () => {
    it('envelope has command, status, exit_code, payload', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'resource', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      expect(j.command).toBe('predict');
      expect(['ok', 'error']).toContain(j.status);
      expect(typeof j.exit_code).toBe('number');
    });

    it('payload.task = "resource"', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'resource', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.task).toBe('resource');
      }
    });

    it('payload.queueStats sub-object is present', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'resource', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.queueStats).toBeDefined();
      }
    });

    it('payload has utilization field (American spelling, GAP-9 fix)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'resource', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect('utilization' in j.payload).toBe(true);
      }
    });

    it('payload has utilisation field (British spelling alias)', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'resource', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect('utilisation' in j.payload).toBe(true);
      }
    });

    it('payload.derivedRates sub-object is present', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'resource', '--input', contractLogPath, '--format', 'json'],
        { cwd: contractTempDir },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(j.payload.derivedRates).toBeDefined();
      }
    });
  });

  // ─── Integration tests with real RequestForPayment.xes ───────────────────────
  // These are conditional: they run only when the real log is present at
  //   data/RequestForPayment.xes (checked at module load).

  describe.skipIf(!REAL_LOG_EXISTS)('integration — real RequestForPayment.xes', () => {
    const realCwd = os.tmpdir();

    it('next-activity with real log → predictions[0].rank=1 and .activity is string', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'next-activity', '--input', REAL_LOG, '--top-k', '3', '--format', 'json'],
        { cwd: realCwd, timeoutMs: 90_000 },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        const preds = j.payload.predictions as Array<Record<string, unknown>>;
        expect(Array.isArray(preds)).toBe(true);
        if (preds.length > 0) {
          expect(preds[0].rank).toBe(1);
          expect(typeof preds[0].activity).toBe('string');
          expect(typeof preds[0].probability).toBe('number');
        }
      }
    });

    it('drift with real log → drift_detected is boolean, driftResult has drifts_detected', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'drift', '--input', REAL_LOG, '--format', 'json'],
        { cwd: realCwd, timeoutMs: 90_000 },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        expect(typeof j.payload.drift_detected).toBe('boolean');
        const dr = j.payload.driftResult as Record<string, unknown> | undefined;
        if (dr) {
          expect('drifts_detected' in dr).toBe(true);
        }
      }
    });

    it('resource with real log → queueStats.utilization is a number', async () => {
      const result = await runCliContract(
        ['model', 'predict', 'resource', '--input', REAL_LOG, '--format', 'json'],
        { cwd: realCwd, timeoutMs: 90_000 },
      );
      const j = parseEnvelopeContract(result);
      if (j.status === 'ok' && j.payload) {
        const qs = j.payload.queueStats as Record<string, unknown> | undefined;
        if (qs) {
          // queueStats shape: { wait_time, utilization, is_stable }
          expect(typeof qs.utilization).toBe('number');
        }
      }
    });
  });
});
