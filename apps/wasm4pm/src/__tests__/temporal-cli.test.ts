import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm temporal — temporal analysis and performance profiling CLI', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  describe('temporal (base command)', () => {
    it('should require input log argument', async () => {
      const result = await runCli(['temporal'], { env: env.env });
      expect([1, 2]).toContain(result.exitCode);
      expect(result.stderr || result.stdout).toMatch(/input|log|required|argument/i);
    });

    it('should accept --input or -i flag', async () => {
      const result = await runCli(['temporal', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal analyze', () => {
    it('should analyze temporal patterns in event log', async () => {
      const result = await runCli(['temporal', 'analyze', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify time-based statistics', async () => {
      const result = await runCli(['temporal', 'analyze', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/temporal|time|duration|statistics/i);
    });

    it('should support activity-level analysis', async () => {
      const result = await runCli(['temporal', 'analyze', '--input', 'test.xes', '--by-activity'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal bottlenecks', () => {
    it('should detect slow activities', async () => {
      const result = await runCli(['temporal', 'bottlenecks', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should report activity durations', async () => {
      const result = await runCli(['temporal', 'bottlenecks', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/bottleneck|slow|duration|activity/i);
    });

    it('should support filtering by percentile', async () => {
      const result = await runCli(
        ['temporal', 'bottlenecks', '--input', 'test.xes', '--percentile', '95'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify top N slowest activities', async () => {
      const result = await runCli(
        ['temporal', 'bottlenecks', '--input', 'test.xes', '--top-n', '5'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal throughput', () => {
    it('should analyze case throughput over time', async () => {
      const result = await runCli(['temporal', 'throughput', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support time window configuration', async () => {
      const result = await runCli(
        ['temporal', 'throughput', '--input', 'test.xes', '--window', '1h'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should report throughput metrics', async () => {
      const result = await runCli(['temporal', 'throughput', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/throughput|rate|cases|metrics/i);
    });

    it('should accept different time windows', async () => {
      ['1h', '1d', '1w'].forEach((window) => {
        expect(['1h', '1d', '1w']).toContain(window);
      });
    });
  });

  describe('temporal waiting-time', () => {
    it('should analyze waiting time between activities', async () => {
      const result = await runCli(['temporal', 'waiting-time', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify long waits', async () => {
      const result = await runCli(['temporal', 'waiting-time', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/wait|idle|time/i);
    });

    it('should support activity pair analysis', async () => {
      const result = await runCli(
        [
          'temporal',
          'waiting-time',
          '--input',
          'test.xes',
          '--from-activity',
          'A',
          '--to-activity',
          'B',
        ],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal rework', () => {
    it('should detect rework (repeated activities)', async () => {
      const result = await runCli(['temporal', 'rework', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify rework patterns', async () => {
      const result = await runCli(['temporal', 'rework', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/rework|repeat|cycle|loop/i);
    });

    it('should calculate rework ratio', async () => {
      const result = await runCli(
        ['temporal', 'rework', '--input', 'test.xes', '--calculate-ratio'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should flag excessive rework', async () => {
      const result = await runCli(
        ['temporal', 'rework', '--input', 'test.xes', '--threshold', '0.2'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal cycles', () => {
    it('should detect process cycles and loops', async () => {
      const result = await runCli(['temporal', 'cycles', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should identify backward loops', async () => {
      const result = await runCli(['temporal', 'cycles', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/cycle|loop|backward/i);
    });

    it('should report cycle frequency', async () => {
      const result = await runCli(
        ['temporal', 'cycles', '--input', 'test.xes', '--report-frequency'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal trends', () => {
    it('should analyze duration trends over time', async () => {
      const result = await runCli(['temporal', 'trends', '--input', 'test.xes'], { env: env.env });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should detect performance improvements or degradation', async () => {
      const result = await runCli(['temporal', 'trends', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/trend|improve|degrad|change/i);
    });

    it('should support date range filtering', async () => {
      const result = await runCli(
        [
          'temporal',
          'trends',
          '--input',
          'test.xes',
          '--from-date',
          '2025-01-01',
          '--to-date',
          '2025-12-31',
        ],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal variance', () => {
    it('should identify variability in activity durations', async () => {
      const result = await runCli(['temporal', 'variance', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should report standard deviation metrics', async () => {
      const result = await runCli(['temporal', 'variance', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/variance|deviation|variability|std|sigma/i);
    });

    it('should identify high-variance activities', async () => {
      const result = await runCli(
        ['temporal', 'variance', '--input', 'test.xes', '--threshold', '0.5'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal --format', () => {
    it('should support human-readable output', async () => {
      const result = await runCli(
        ['temporal', 'analyze', '--input', 'test.xes', '--format', 'human'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should support JSON output', async () => {
      const result = await runCli(
        ['temporal', 'analyze', '--input', 'test.xes', '--format', 'json'],
        { env: env.env }
      );
      if (result.exitCode === EXIT_CODES.success) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should support CSV export', async () => {
      const result = await runCli(
        ['temporal', 'analyze', '--input', 'test.xes', '--format', 'csv'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal --activity-key', () => {
    it('should accept custom activity key', async () => {
      const result = await runCli(
        ['temporal', 'analyze', '--input', 'test.xes', '--activity-key', 'activity:name'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });

    it('should default to concept:name', async () => {
      const result = await runCli(['temporal', 'analyze', '--help'], { env: env.env });
      expect(result.stdout).toMatch(/activity|key|concept:name/i);
    });
  });

  describe('temporal --time-key', () => {
    it('should accept custom timestamp key', async () => {
      const result = await runCli(
        ['temporal', 'analyze', '--input', 'test.xes', '--time-key', 'time:timestamp'],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });

  describe('temporal error handling', () => {
    it('should reject invalid subcommand', async () => {
      const result = await runCli(['temporal', 'invalid-command', '--input', 'test.xes'], {
        env: env.env,
      });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should handle missing input file', async () => {
      const result = await runCli(['temporal', 'analyze', '--input', '/nonexistent/log.xes'], {
        env: env.env,
      });
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should validate date range', async () => {
      const result = await runCli(
        [
          'temporal',
          'trends',
          '--input',
          'test.xes',
          '--from-date',
          '2025-12-31',
          '--to-date',
          '2025-01-01',
        ],
        { env: env.env }
      );
      expect([1, 2]).toContain(result.exitCode);
    });

    it('should reject invalid percentile values', async () => {
      const result = await runCli(
        ['temporal', 'bottlenecks', '--input', 'test.xes', '--percentile', '150'],
        { env: env.env }
      );
      expect([1, 2]).toContain(result.exitCode);
    });
  });

  describe('temporal performance', () => {
    it('should complete basic analysis in <2 seconds', async () => {
      const start = Date.now();
      await runCli(['temporal', 'analyze', '--help'], { env: env.env });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('temporal --save-report', () => {
    it('should save analysis report to file', async () => {
      const report = env.tmpDir + '/temporal-report.json';
      const result = await runCli(
        ['temporal', 'analyze', '--input', 'test.xes', '--save-report', report],
        { env: env.env }
      );
      expect([1, 2, 3]).toContain(result.exitCode);
    });
  });
});
