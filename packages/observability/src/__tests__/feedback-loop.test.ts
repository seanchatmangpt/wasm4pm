import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  captureFeedback,
  loadAlgorithmFeedback,
  getAlgorithmStats,
  getLogSizeBucket,
  estimateGeneralization,
  estimateSimplicity,
  type QualityMetrics,
} from '../feedback-loop.js';

const testFeedbackDir = path.join(process.cwd(), '.wasm4pm', 'algorithm-feedback');

describe('feedback-loop', () => {
  beforeEach(async () => {
    // Clean up test feedback directory before each test
    try {
      await fs.rm(testFeedbackDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist yet
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testFeedbackDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getLogSizeBucket', () => {
    it('should classify 50 events as 0-100 bucket', () => {
      expect(getLogSizeBucket(50)).toBe('0-100');
    });

    it('should classify 100 events as 0-100 bucket', () => {
      expect(getLogSizeBucket(100)).toBe('0-100');
    });

    it('should classify 500 events as 100-1K bucket', () => {
      expect(getLogSizeBucket(500)).toBe('100-1K');
    });

    it('should classify 1000 events as 100-1K bucket', () => {
      expect(getLogSizeBucket(1000)).toBe('100-1K');
    });

    it('should classify 5000 events as 1K-10K bucket', () => {
      expect(getLogSizeBucket(5000)).toBe('1K-10K');
    });

    it('should classify 50000 events as 10K-100K bucket', () => {
      expect(getLogSizeBucket(50000)).toBe('10K-100K');
    });

    it('should classify 500000 events as 100K+ bucket', () => {
      expect(getLogSizeBucket(500000)).toBe('100K+');
    });
  });

  describe('estimateGeneralization', () => {
    it('should return 1.0 when all traces are identical', () => {
      const gen = estimateGeneralization(1, 100);
      expect(gen).toBeCloseTo(1.0, 1);
    });

    it('should return 0 when every trace is unique', () => {
      const gen = estimateGeneralization(100, 100);
      expect(gen).toBe(0);
    });

    it('should return intermediate value for mixed variants', () => {
      const gen = estimateGeneralization(25, 100); // 25% variance
      expect(gen).toBeGreaterThan(0);
      expect(gen).toBeLessThan(1);
    });

    it('should handle edge case of 0 traces', () => {
      const gen = estimateGeneralization(0, 0);
      expect(gen).toBe(0);
    });
  });

  describe('estimateSimplicity', () => {
    it('should return higher score for fewer elements', () => {
      const simple = estimateSimplicity(5, 1000); // 5 elements, 1000 events
      const complex = estimateSimplicity(50, 1000); // 50 elements, 1000 events
      expect(simple).toBeGreaterThan(complex);
    });

    it('should return values between 0 and 1', () => {
      const score = estimateSimplicity(10, 1000);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle zero log size', () => {
      const score = estimateSimplicity(5, 0);
      expect(score).toBe(0);
    });
  });

  describe('captureFeedback', () => {
    it('should capture feedback for dfg algorithm', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.92,
        precision: 0.88,
        generalization: 0.75,
        simplicity: 0.85,
      };

      await captureFeedback('dfg', 500, metrics, 145);

      const records = await loadAlgorithmFeedback('dfg');
      expect(records).toHaveLength(1);
      expect(records[0].algorithm).toBe('dfg');
      expect(records[0].log_size_bucket).toBe('100-1K');
      expect(records[0].metrics.fitness).toBe(0.92);
      expect(records[0].metrics.precision).toBe(0.88);
      expect(records[0].execution_time_ms).toBe(145);
    });

    it('should capture feedback with metadata', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.85,
        precision: 0.80,
        generalization: 0.70,
        simplicity: 0.75,
      };

      const metadata = {
        activity_key: 'concept:name',
        dependency_threshold: 0.2,
      };

      await captureFeedback('heuristic_miner', 2000, metrics, 250, metadata);

      const records = await loadAlgorithmFeedback('heuristic_miner');
      expect(records).toHaveLength(1);
      expect(records[0].metadata).toEqual(metadata);
    });

    it('should append multiple feedback records for same algorithm', async () => {
      const metrics1: QualityMetrics = {
        fitness: 0.90,
        precision: 0.85,
        generalization: 0.80,
        simplicity: 0.75,
      };

      const metrics2: QualityMetrics = {
        fitness: 0.88,
        precision: 0.83,
        generalization: 0.78,
        simplicity: 0.72,
      };

      await captureFeedback('inductive_miner', 500, metrics1, 300);
      await captureFeedback('inductive_miner', 1500, metrics2, 450);

      const records = await loadAlgorithmFeedback('inductive_miner');
      expect(records).toHaveLength(2);
      expect(records[0].metrics.fitness).toBe(0.90);
      expect(records[1].metrics.fitness).toBe(0.88);
    });

    it('should handle null precision gracefully', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.80,
        precision: null,
        generalization: null,
        simplicity: 0.70,
      };

      await captureFeedback('genetic_algorithm', 5000, metrics, 1200);

      const records = await loadAlgorithmFeedback('genetic_algorithm');
      expect(records).toHaveLength(1);
      expect(records[0].metrics.precision).toBeNull();
    });

    it('should set timestamp if not provided', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.85,
        precision: 0.80,
        generalization: 0.75,
        simplicity: 0.70,
      };

      await captureFeedback('alpha_plus_plus', 1000, metrics, 200);

      const records = await loadAlgorithmFeedback('alpha_plus_plus');
      expect(records[0].timestamp).toBeDefined();
      // Should be ISO string
      expect(new Date(records[0].timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('loadAlgorithmFeedback', () => {
    it('should return empty array if no feedback exists', async () => {
      const records = await loadAlgorithmFeedback('nonexistent_algo');
      expect(records).toEqual([]);
    });

    it('should load all feedback records for an algorithm', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.85,
        precision: 0.80,
        generalization: 0.75,
        simplicity: 0.70,
      };

      // Capture 3 feedback records
      await captureFeedback('test_algo', 100, metrics, 50);
      await captureFeedback('test_algo', 1000, metrics, 100);
      await captureFeedback('test_algo', 10000, metrics, 200);

      const records = await loadAlgorithmFeedback('test_algo');
      expect(records).toHaveLength(3);
    });

    it('should preserve record order', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.85,
        precision: 0.80,
        generalization: 0.75,
        simplicity: 0.70,
      };

      await captureFeedback('ordered_algo', 100, metrics, 50);
      await captureFeedback('ordered_algo', 1000, { ...metrics, fitness: 0.90 }, 100);
      await captureFeedback('ordered_algo', 10000, { ...metrics, fitness: 0.95 }, 200);

      const records = await loadAlgorithmFeedback('ordered_algo');
      expect(records[0].metrics.fitness).toBe(0.85);
      expect(records[1].metrics.fitness).toBe(0.90);
      expect(records[2].metrics.fitness).toBe(0.95);
    });
  });

  describe('getAlgorithmStats', () => {
    it('should compute mean and median fitness', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.85,
        precision: 0.80,
        generalization: 0.75,
        simplicity: 0.70,
      };

      // Add 5 records with increasing fitness scores
      for (let i = 0; i < 5; i++) {
        await captureFeedback('stats_algo', 1000 + i * 100, {
          ...metrics,
          fitness: 0.70 + i * 0.05, // 0.70, 0.75, 0.80, 0.85, 0.90
        }, 100 + i * 10);
      }

      const stats = await getAlgorithmStats('stats_algo');
      expect(stats.count).toBe(5);
      expect(stats.meanFitness).toBeCloseTo(0.80, 2); // Average of 0.70-0.90
      expect(stats.medianFitness).toBeCloseTo(0.80, 2); // Middle value
    });

    it('should compute bucket statistics', async () => {
      const metrics: QualityMetrics = {
        fitness: 0.85,
        precision: 0.80,
        generalization: 0.75,
        simplicity: 0.70,
      };

      // Add records in different size buckets
      await captureFeedback('bucket_algo', 50, metrics, 30);
      await captureFeedback('bucket_algo', 75, { ...metrics, fitness: 0.90 }, 35);
      await captureFeedback('bucket_algo', 500, { ...metrics, fitness: 0.88 }, 100);
      await captureFeedback('bucket_algo', 5000, { ...metrics, fitness: 0.92 }, 200);

      const stats = await getAlgorithmStats('bucket_algo');
      expect(stats.bucketStats['0-100']).toBeDefined();
      expect(stats.bucketStats['0-100'].count).toBe(2);
      expect(stats.bucketStats['100-1K']).toBeDefined();
      expect(stats.bucketStats['1K-10K']).toBeDefined();
    });

    it('should handle empty feedback gracefully', async () => {
      const stats = await getAlgorithmStats('empty_algo');
      expect(stats.count).toBe(0);
      expect(stats.meanFitness).toBe(0);
      expect(stats.medianFitness).toBe(0);
      expect(stats.meanPrecision).toBeNull();
    });

    it('should ignore null precision in mean computation', async () => {
      const metrics1: QualityMetrics = {
        fitness: 0.85,
        precision: 0.80,
        generalization: 0.75,
        simplicity: 0.70,
      };

      const metrics2: QualityMetrics = {
        fitness: 0.90,
        precision: null,
        generalization: 0.80,
        simplicity: 0.75,
      };

      await captureFeedback('mixed_precision_algo', 1000, metrics1, 100);
      await captureFeedback('mixed_precision_algo', 2000, metrics2, 150);

      const stats = await getAlgorithmStats('mixed_precision_algo');
      expect(stats.meanPrecision).toBeCloseTo(0.80, 2); // Only counts the one with precision
    });
  });

  describe('feedback lifecycle', () => {
    it('should capture and aggregate feedback across algorithms', async () => {
      const dfgMetrics: QualityMetrics = {
        fitness: 0.80,
        precision: 0.75,
        generalization: 0.70,
        simplicity: 0.80,
      };

      const heuristicMetrics: QualityMetrics = {
        fitness: 0.88,
        precision: 0.85,
        generalization: 0.80,
        simplicity: 0.70,
      };

      // DFG runs
      await captureFeedback('dfg', 1000, dfgMetrics, 50);
      await captureFeedback('dfg', 5000, { ...dfgMetrics, fitness: 0.82 }, 60);

      // Heuristic runs
      await captureFeedback('heuristic_miner', 1000, heuristicMetrics, 150);
      await captureFeedback('heuristic_miner', 5000, { ...heuristicMetrics, fitness: 0.90 }, 180);

      const dfgStats = await getAlgorithmStats('dfg');
      const heuristicStats = await getAlgorithmStats('heuristic_miner');

      expect(dfgStats.count).toBe(2);
      expect(heuristicStats.count).toBe(2);
      expect(heuristicStats.meanFitness).toBeGreaterThan(dfgStats.meanFitness);
    });
  });
});
