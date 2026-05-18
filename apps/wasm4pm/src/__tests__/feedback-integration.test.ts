import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { captureFeedback, loadAlgorithmFeedback, getAlgorithmStats } from '@wasm4pm/observability';

describe('Feedback Loop Integration', () => {
  let testDir: string;
  let feedbackDir: string;
  const originalCwd = process.cwd();

  beforeEach(async () => {
    // Create test directory in temp
    testDir = path.join(os.tmpdir(), `wasm4pm-feedback-test-${Date.now()}`);
    feedbackDir = path.resolve(testDir, '.wasm4pm', 'algorithm-feedback');
    await fs.mkdir(feedbackDir, { recursive: true });

    // Mock process.cwd() to return testDir
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
  });

  afterEach(async () => {
    // Restore original cwd
    vi.restoreAllMocks();

    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  });

  describe('captureFeedback()', () => {
    it('should capture quality metrics for an algorithm run', async () => {
      await captureFeedback(
        'dfg',
        5000,
        {
          fitness: 0.92,
          precision: 0.88,
          generalization: 0.85,
          simplicity: 0.80,
        },
        125
      );

      // Verify file was created
      const feedbackFile = path.join(feedbackDir, 'dfg_feedback.jsonl');
      const content = await fs.readFile(feedbackFile, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(1);

      const record = JSON.parse(lines[0]);
      expect(record.algorithm).toBe('dfg');
      expect(record.log_size_bucket).toBe('1K-10K');
      expect(record.metrics.fitness).toBe(0.92);
      expect(record.execution_time_ms).toBe(125);
    });

    it('should append multiple records for the same algorithm', async () => {
      // First run
      await captureFeedback(
        'heuristic_miner',
        500,
        { fitness: 0.85, precision: 0.80, generalization: 0.75, simplicity: 0.70 },
        200
      );

      // Second run
      await captureFeedback(
        'heuristic_miner',
        2000,
        { fitness: 0.90, precision: 0.87, generalization: 0.82, simplicity: 0.78 },
        350
      );

      const records = await loadAlgorithmFeedback('heuristic_miner');
      expect(records.length).toBe(2);
      expect(records[0].log_size_bucket).toBe('100-1K');
      expect(records[1].log_size_bucket).toBe('1K-10K');
    });

    it('should include metadata when provided', async () => {
      await captureFeedback(
        'genetic',
        5000,
        { fitness: 0.88, precision: 0.84, generalization: 0.79, simplicity: 0.75 },
        450,
        {
          population_size: 50,
          generations: 100,
          seed: 42,
        }
      );

      const records = await loadAlgorithmFeedback('genetic');
      expect(records[0].metadata).toBeDefined();
      expect(records[0].metadata!.population_size).toBe(50);
    });

    it('should bucket log sizes correctly', async () => {
      const testCases = [
        { size: 50, bucket: '0-100' },
        { size: 500, bucket: '100-1K' },
        { size: 5000, bucket: '1K-10K' },
        { size: 50000, bucket: '10K-100K' },
        { size: 500000, bucket: '100K+' },
      ];

      for (const { size, bucket } of testCases) {
        await captureFeedback(
          'dfg',
          size,
          { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 },
          100
        );
      }

      const records = await loadAlgorithmFeedback('dfg');
      expect(records).toHaveLength(5);
      for (let i = 0; i < testCases.length; i++) {
        expect(records[i].log_size_bucket).toBe(testCases[i].bucket);
      }
    });

    it('should handle missing metrics (nulls)', async () => {
      await captureFeedback(
        'alpha_plus_plus',
        1000,
        {
          fitness: 0.88,
          precision: null,
          generalization: null,
          simplicity: null,
        },
        150
      );

      const records = await loadAlgorithmFeedback('alpha_plus_plus');
      expect(records[0].metrics.precision).toBeNull();
      expect(records[0].metrics.generalization).toBeNull();
    });

    it('should not throw on capture failure (non-blocking)', async () => {
      // Simulate a capture failure by making the directory unwritable
      await fs.chmod(feedbackDir, 0o444);

      // This should not throw
      let error;
      try {
        await captureFeedback(
          'dfg',
          1000,
          { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 },
          100
        );
      } catch (err) {
        error = err;
      }

      // Restore permissions for cleanup
      await fs.chmod(feedbackDir, 0o755);

      // Capture may warn but doesn't throw per TPS non-blocking rules
      expect(error).toBeUndefined();
    });
  });

  describe('getAlgorithmStats()', () => {
    it('should compute statistics across multiple runs', async () => {
      // Simulate multiple discovery runs
      await captureFeedback('dfg', 1000, { fitness: 0.90, precision: 0.85, generalization: 0.80, simplicity: 0.75 }, 100);
      await captureFeedback('dfg', 1500, { fitness: 0.92, precision: 0.87, generalization: 0.82, simplicity: 0.77 }, 110);
      await captureFeedback('dfg', 5000, { fitness: 0.94, precision: 0.90, generalization: 0.85, simplicity: 0.80 }, 200);

      const stats = await getAlgorithmStats('dfg');

      expect(stats.count).toBe(3);
      expect(stats.meanFitness).toBeCloseTo((0.90 + 0.92 + 0.94) / 3, 2);
      expect(stats.medianFitness).toBeCloseTo(0.92, 2);
      expect(stats.meanPrecision).toBeCloseTo((0.85 + 0.87 + 0.90) / 3, 2);
    });

    it('should break down statistics by log size bucket', async () => {
      // Small logs (100-1K)
      await captureFeedback('heuristic', 500, { fitness: 0.88, precision: 0.82, generalization: 0.77, simplicity: 0.70 }, 90);
      await captureFeedback('heuristic', 800, { fitness: 0.89, precision: 0.83, generalization: 0.78, simplicity: 0.71 }, 95);

      // Medium logs (1K-10K)
      await captureFeedback('heuristic', 3000, { fitness: 0.91, precision: 0.86, generalization: 0.81, simplicity: 0.75 }, 150);
      await captureFeedback('heuristic', 5000, { fitness: 0.92, precision: 0.87, generalization: 0.82, simplicity: 0.76 }, 160);

      const stats = await getAlgorithmStats('heuristic');

      expect(stats.bucketStats['100-1K'].count).toBe(2);
      expect(stats.bucketStats['100-1K'].meanFitness).toBeCloseTo((0.88 + 0.89) / 2, 2);
      expect(stats.bucketStats['1K-10K'].count).toBe(2);
      expect(stats.bucketStats['1K-10K'].meanFitness).toBeCloseTo((0.91 + 0.92) / 2, 2);
    });

    it('should return empty stats for non-existent algorithm', async () => {
      const stats = await getAlgorithmStats('nonexistent_algo');

      expect(stats.count).toBe(0);
      expect(stats.meanFitness).toBe(0);
      expect(stats.medianFitness).toBe(0);
      expect(stats.meanPrecision).toBeNull();
    });

    it('should handle algorithms with partial metrics', async () => {
      // Mix of full and partial metrics
      await captureFeedback(
        'ilp',
        1000,
        { fitness: 0.95, precision: 0.93, generalization: 0.88, simplicity: 0.85 },
        500
      );
      await captureFeedback('ilp', 2000, { fitness: 0.94, precision: null, generalization: null, simplicity: null }, 520);

      const stats = await getAlgorithmStats('ilp');

      expect(stats.count).toBe(2);
      expect(stats.meanFitness).toBeCloseTo((0.95 + 0.94) / 2, 2);
      // Only one precision value, so mean is just that one
      expect(stats.meanPrecision).toBeCloseTo(0.93, 2);
    });
  });

  describe('Conformance feedback integration', () => {
    it('should capture conformance check feedback', async () => {
      // Simulate a conformance check result
      await captureFeedback(
        'conformance_check',
        1000,
        {
          fitness: 0.82,
          precision: 0.79,
          generalization: null,
          simplicity: null,
        },
        200,
        {
          method: 'token-replay',
          threshold: 0.8,
          total_cases: 50,
          activity_key: 'concept:name',
        }
      );

      const records = await loadAlgorithmFeedback('conformance_check');
      expect(records).toHaveLength(1);
      expect(records[0].metrics.fitness).toBe(0.82);
      expect(records[0].metrics.precision).toBe(0.79);
      expect(records[0].metadata!.method).toBe('token-replay');
    });
  });
});
