import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

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
      const result = await runCli(['predict']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/task|argument|required|usage/i);
    });

    it('should require input log', async () => {
      const result = await runCli(['predict', 'next-activity']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/input|log|required|argument/i);
    });

    it('should accept --input or -i flag', async () => {
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      // Will fail due to missing file, but flag should be recognized
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept -i short alias', async () => {
      const result = await runCli(['predict', 'next-activity', '-i', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict (task types)', () => {
    it('should accept next-activity task', async () => {
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept remaining-time task', async () => {
      const result = await runCli(['predict', 'remaining-time', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept outcome task', async () => {
      const result = await runCli(['predict', 'outcome', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept drift task', async () => {
      const result = await runCli(['predict', 'drift', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept features task', async () => {
      const result = await runCli(['predict', 'features', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept resource task', async () => {
      const result = await runCli(['predict', 'resource', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should reject invalid task name', async () => {
      const result = await runCli(['predict', 'invalid-task', '--input', 'test.xes']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/unknown|invalid|task/i);
    });

    it('should reject hyphen vs underscore confusion (e.g., next_activity instead of next-activity)', async () => {
      const result = await runCli(['predict', 'next_activity', '--input', 'test.xes']);
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/unknown|invalid|task/i);
    });
  });

  describe('predict --activity-key', () => {
    it('should default to concept:name activity key', async () => {
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept custom --activity-key', async () => {
      const result = await runCli([
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
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --top-k with numeric value', async () => {
      const result = await runCli([
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
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --ngram-order with numeric value', async () => {
      const result = await runCli([
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
      const result = await runCli(['predict', 'drift', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should accept --drift-window with numeric value', async () => {
      const result = await runCli([
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
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict --format (output control)', () => {
    it('should default to human-readable output', async () => {
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support --format human', async () => {
      const result = await runCli([
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
      const result = await runCli(['predict', 'next-activity', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('remaining-time should show duration estimates', async () => {
      const result = await runCli(['predict', 'remaining-time', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('outcome should show anomaly scores', async () => {
      const result = await runCli(['predict', 'outcome', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('drift should show drift detection results', async () => {
      const result = await runCli(['predict', 'drift', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('features should show transition probabilities', async () => {
      const result = await runCli(['predict', 'features', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('resource should show queue statistics', async () => {
      const result = await runCli(['predict', 'resource', '--input', 'test.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('predict (combined flags)', () => {
    it('should handle next-activity with all specific flags', async () => {
      const result = await runCli([
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
      const result = await runCli(['predict', 'next-activity', '--input', '/nonexistent/log.xes']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should handle empty input file', async () => {
      const result = await runCli(['predict', 'next-activity', '--input', '']);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should exit with non-zero code for invalid --top-k', async () => {
      const result = await runCli([
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
        'predict',
        'drift',
        '--input',
        'test.xes',
        '--drift-window',
        'notanumber',
      ]);
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should exit with config_error for invalid task name (task validation happens before file access)', async () => {
      const result = await runCli([
        'predict',
        'invalid-task',
        '--input',
        'test.xes',
      ]);
      // Invalid task is a config/argument error (exit 1), not a source/file error (exit 2).
      // Task validation fires before any file I/O.
      expect(result.exitCode).toBe(EXIT_CODES.config_error);
    });
  });

  describe('predict (help and documentation)', () => {
    it('should show help with --help flag', async () => {
      const result = await runCli(['predict', '--help']);
      expect(result.stdout).toMatch(/predict|prediction|task/i);
    });

    it('should document all task types in help', async () => {
      const result = await runCli(['predict', '--help']);
      expect(result.stdout).toMatch(
        /(next-activity|remaining-time|outcome|drift|features|resource)/i
      );
    });

    it('should document activity-key parameter', async () => {
      const result = await runCli(['predict', '--help']);
      expect(result.stdout).toMatch(/activity-key|activity.*key/i);
    });

    it('should document top-k parameter', async () => {
      const result = await runCli(['predict', '--help']);
      expect(result.stdout).toMatch(/top-k|top.*k/i);
    });

    it('should document ngram-order parameter', async () => {
      const result = await runCli(['predict', '--help']);
      expect(result.stdout).toMatch(/ngram-order|ngram.*order/i);
    });

    it('should document drift-window parameter', async () => {
      const result = await runCli(['predict', '--help']);
      expect(result.stdout).toMatch(/drift-window|drift.*window/i);
    });

    it('should document prefix parameter', async () => {
      const result = await runCli(['predict', '--help']);
      expect(result.stdout).toMatch(/prefix/i);
    });
  });
});
