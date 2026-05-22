import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rankAlgorithms,
  rankAlgorithmsByPerformance,
  getAlgorithmComparison,
  recommendBestAlgorithm,
  formatAlgorithmComparison,
} from '../algorithm-ranking.js';
import * as feedbackLoop from '../feedback-loop.js';

// Mock the feedback loop module
vi.mock('../feedback-loop.js', () => ({
  loadAlgorithmFeedback: vi.fn(),
  getAlgorithmStats: vi.fn(),
}));

describe('algorithm-ranking', () => {
  const mockGetAlgorithmStats = vi.mocked(feedbackLoop.getAlgorithmStats);
  const mockLoadAlgorithmFeedback = vi.mocked(feedbackLoop.loadAlgorithmFeedback);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rankAlgorithms', () => {
    it('should rank algorithms by composite score', async () => {
      mockGetAlgorithmStats.mockImplementation(async (algo) => {
        const scores: Record<string, any> = {
          dfg: {
            count: 10,
            meanFitness: 0.75,
            medianFitness: 0.76,
            meanPrecision: 0.70,
            bucketStats: {},
          },
          heuristic_miner: {
            count: 10,
            meanFitness: 0.85,
            medianFitness: 0.86,
            meanPrecision: 0.80,
            bucketStats: {},
          },
          inductive_miner: {
            count: 10,
            meanFitness: 0.80,
            medianFitness: 0.81,
            meanPrecision: 0.75,
            bucketStats: {},
          },
        };
        return scores[algo];
      });

      mockLoadAlgorithmFeedback.mockImplementation(async (algo) => {
        const feedback: Record<string, any> = {
          dfg: [
            {
              algorithm: 'dfg',
              log_size_bucket: '1K-10K',
              timestamp: new Date().toISOString(),
              execution_time_ms: 10,
              metrics: { fitness: 0.75, precision: 0.70, generalization: null, simplicity: null },
            },
          ],
          heuristic_miner: [
            {
              algorithm: 'heuristic_miner',
              log_size_bucket: '1K-10K',
              timestamp: new Date().toISOString(),
              execution_time_ms: 50,
              metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
            },
          ],
          inductive_miner: [
            {
              algorithm: 'inductive_miner',
              log_size_bucket: '1K-10K',
              timestamp: new Date().toISOString(),
              execution_time_ms: 100,
              metrics: { fitness: 0.80, precision: 0.75, generalization: null, simplicity: null },
            },
          ],
        };
        return feedback[algo] || [];
      });

      const ranked = await rankAlgorithms(['dfg', 'heuristic_miner', 'inductive_miner']);

      expect(ranked).toHaveLength(3);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
      // DFG ranks highest because of speed advantage
      // Composite score: dfg=(0.75*0.5 + 0.70*0.3 + 1.0*0.2)=0.785
      //                 heuristic=(0.85*0.5 + 0.80*0.3 + 0.5*0.2)=0.625
      expect(ranked[0].algorithm).toBe('dfg');
    });

    it('should rank by fitness metric', async () => {
      mockGetAlgorithmStats.mockImplementation(async (algo) => {
        const scores: Record<string, any> = {
          dfg: {
            count: 1,
            meanFitness: 0.70,
            medianFitness: 0.70,
            meanPrecision: 0.65,
            bucketStats: {},
          },
          heuristic_miner: {
            count: 1,
            meanFitness: 0.90,
            medianFitness: 0.90,
            meanPrecision: 0.85,
            bucketStats: {},
          },
        };
        return scores[algo];
      });

      mockLoadAlgorithmFeedback.mockResolvedValue([
        {
          algorithm: 'test',
          log_size_bucket: '1K-10K',
          timestamp: new Date().toISOString(),
          execution_time_ms: 50,
          metrics: { fitness: 0.9, precision: 0.85, generalization: null, simplicity: null },
        },
      ]);

      const ranked = await rankAlgorithms(['dfg', 'heuristic_miner'], 'fitness');

      expect(ranked[0].algorithm).toBe('heuristic_miner');
      expect(ranked[0].fitness).toBe(0.9);
      expect(ranked[1].algorithm).toBe('dfg');
      expect(ranked[1].fitness).toBe(0.7);
    });

    it('should rank by precision metric', async () => {
      mockGetAlgorithmStats.mockImplementation(async (algo) => {
        const scores: Record<string, any> = {
          dfg: {
            count: 1,
            meanFitness: 0.90,
            medianFitness: 0.90,
            meanPrecision: 0.50,
            bucketStats: {},
          },
          heuristic_miner: {
            count: 1,
            meanFitness: 0.80,
            medianFitness: 0.80,
            meanPrecision: 0.95,
            bucketStats: {},
          },
        };
        return scores[algo];
      });

      mockLoadAlgorithmFeedback.mockResolvedValue([
        {
          algorithm: 'test',
          log_size_bucket: '1K-10K',
          timestamp: new Date().toISOString(),
          execution_time_ms: 50,
          metrics: { fitness: 0.9, precision: 0.85, generalization: null, simplicity: null },
        },
      ]);

      const ranked = await rankAlgorithms(['dfg', 'heuristic_miner'], 'precision');

      expect(ranked[0].algorithm).toBe('heuristic_miner');
      expect(ranked[0].precision).toBe(0.95);
    });

    it('should rank by speed metric', async () => {
      mockGetAlgorithmStats.mockImplementation(async () => ({
        count: 1,
        meanFitness: 0.85,
        medianFitness: 0.85,
        meanPrecision: 0.80,
        bucketStats: {},
      }));

      mockLoadAlgorithmFeedback
        .mockResolvedValueOnce([
          {
            algorithm: 'dfg',
            log_size_bucket: '1K-10K',
            timestamp: new Date().toISOString(),
            execution_time_ms: 100,
            metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
          },
        ])
        .mockResolvedValueOnce([
          {
            algorithm: 'heuristic_miner',
            log_size_bucket: '1K-10K',
            timestamp: new Date().toISOString(),
            execution_time_ms: 10,
            metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
          },
        ]);

      const ranked = await rankAlgorithms(['dfg', 'heuristic_miner'], 'speed');

      // Faster algorithm should rank higher
      expect(ranked[0].algorithm).toBe('heuristic_miner');
    });

    it('should skip algorithms with no feedback', async () => {
      mockGetAlgorithmStats.mockImplementation(async (algo) => {
        if (algo === 'dfg') {
          return {
            count: 5,
            meanFitness: 0.85,
            medianFitness: 0.85,
            meanPrecision: 0.80,
            bucketStats: {},
          };
        }
        return {
          count: 0,
          meanFitness: 0,
          medianFitness: 0,
          meanPrecision: null,
          bucketStats: {},
        };
      });

      mockLoadAlgorithmFeedback.mockImplementation(async (algo) => {
        if (algo === 'dfg') {
          return [
            {
              algorithm: 'dfg',
              log_size_bucket: '1K-10K',
              timestamp: new Date().toISOString(),
              execution_time_ms: 10,
              metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
            },
          ];
        }
        return [];
      });

      const ranked = await rankAlgorithms(['dfg', 'unknown_algo']);

      // Only algorithms with feedback should be returned
      expect(ranked).toHaveLength(1);
      expect(ranked[0].algorithm).toBe('dfg');
      expect(ranked[0].sample_count).toBe(5);
    });

    it('should assign ranks correctly even with ties', async () => {
      mockGetAlgorithmStats.mockImplementation(async () => ({
        count: 1,
        meanFitness: 0.85,
        medianFitness: 0.85,
        meanPrecision: 0.80,
        bucketStats: {},
      }));

      mockLoadAlgorithmFeedback.mockResolvedValue([
        {
          algorithm: 'test',
          log_size_bucket: '1K-10K',
          timestamp: new Date().toISOString(),
          execution_time_ms: 50,
          metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
        },
      ]);

      const ranked = await rankAlgorithms(['dfg', 'heuristic_miner', 'inductive_miner']);

      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
    });
  });

  describe('rankAlgorithmsByPerformance', () => {
    it('should call rankAlgorithms with default metrics', async () => {
      mockGetAlgorithmStats.mockResolvedValue({
        count: 0,
        meanFitness: 0,
        medianFitness: 0,
        meanPrecision: null,
        bucketStats: {},
      });

      mockLoadAlgorithmFeedback.mockResolvedValue([]);

      const ranked = await rankAlgorithmsByPerformance('log-hash-123');

      expect(ranked).toBeDefined();
      expect(Array.isArray(ranked)).toBe(true);
    });

    it('should support different metrics', async () => {
      mockGetAlgorithmStats.mockResolvedValue({
        count: 1,
        meanFitness: 0.85,
        medianFitness: 0.85,
        meanPrecision: 0.80,
        bucketStats: {},
      });

      mockLoadAlgorithmFeedback.mockResolvedValue([
        {
          algorithm: 'test',
          log_size_bucket: '1K-10K',
          timestamp: new Date().toISOString(),
          execution_time_ms: 50,
          metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
        },
      ]);

      const ranked = await rankAlgorithmsByPerformance('log-hash-123', 'fitness');
      expect(ranked).toBeDefined();
    });
  });

  describe('getAlgorithmComparison', () => {
    it('should return comparison object with timestamp', async () => {
      mockGetAlgorithmStats.mockResolvedValue({
        count: 1,
        meanFitness: 0.85,
        medianFitness: 0.85,
        meanPrecision: 0.80,
        bucketStats: {},
      });

      mockLoadAlgorithmFeedback.mockResolvedValue([
        {
          algorithm: 'test',
          log_size_bucket: '1K-10K',
          timestamp: new Date().toISOString(),
          execution_time_ms: 50,
          metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
        },
      ]);

      const comparison = await getAlgorithmComparison('log-hash-123');

      expect(comparison.logHash).toBe('log-hash-123');
      expect(comparison.metric).toBe('composite');
      expect(comparison.timestamp).toBeDefined();
      expect(comparison.algorithms).toBeDefined();
      expect(Array.isArray(comparison.algorithms)).toBe(true);
    });

    it('should include algorithms with feedback in comparison', async () => {
      mockGetAlgorithmStats.mockImplementation(async (algo) => {
        const scores: Record<string, any> = {
          dfg: {
            count: 1,
            meanFitness: 0.75,
            medianFitness: 0.75,
            meanPrecision: 0.70,
            bucketStats: {},
          },
          heuristic_miner: {
            count: 1,
            meanFitness: 0.85,
            medianFitness: 0.85,
            meanPrecision: 0.80,
            bucketStats: {},
          },
          inductive_miner: {
            count: 0,
            meanFitness: 0,
            medianFitness: 0,
            meanPrecision: null,
            bucketStats: {},
          },
          alpha_plus_plus: {
            count: 0,
            meanFitness: 0,
            medianFitness: 0,
            meanPrecision: null,
            bucketStats: {},
          },
        };
        return scores[algo] || {
          count: 0,
          meanFitness: 0,
          medianFitness: 0,
          meanPrecision: null,
          bucketStats: {},
        };
      });

      mockLoadAlgorithmFeedback.mockImplementation(async (algo) => {
        const feedback: Record<string, any> = {
          dfg: [
            {
              algorithm: 'dfg',
              log_size_bucket: '1K-10K',
              timestamp: new Date().toISOString(),
              execution_time_ms: 10,
              metrics: { fitness: 0.75, precision: 0.70, generalization: null, simplicity: null },
            },
          ],
          heuristic_miner: [
            {
              algorithm: 'heuristic_miner',
              log_size_bucket: '1K-10K',
              timestamp: new Date().toISOString(),
              execution_time_ms: 50,
              metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
            },
          ],
        };
        return feedback[algo] || [];
      });

      const comparison = await getAlgorithmComparison('log-hash-123');

      expect(comparison.algorithms.length).toBeGreaterThan(0);
      expect(comparison.algorithms.some((a) => a.algorithm === 'dfg')).toBe(true);
      expect(comparison.algorithms.some((a) => a.algorithm === 'heuristic_miner')).toBe(true);
    });
  });

  describe('recommendBestAlgorithm', () => {
    it('should return best algorithm and top 3 alternatives', async () => {
      mockGetAlgorithmStats.mockImplementation(async (algo) => {
        const scores: Record<string, any> = {
          dfg: {
            count: 1,
            meanFitness: 0.70,
            medianFitness: 0.70,
            meanPrecision: 0.65,
            bucketStats: {},
          },
          heuristic_miner: {
            count: 1,
            meanFitness: 0.90,
            medianFitness: 0.90,
            meanPrecision: 0.85,
            bucketStats: {},
          },
          inductive_miner: {
            count: 1,
            meanFitness: 0.80,
            medianFitness: 0.80,
            meanPrecision: 0.75,
            bucketStats: {},
          },
          alpha_plus_plus: {
            count: 1,
            meanFitness: 0.75,
            medianFitness: 0.75,
            meanPrecision: 0.70,
            bucketStats: {},
          },
        };
        return scores[algo];
      });

      mockLoadAlgorithmFeedback.mockImplementation(async () => [
        {
          algorithm: 'test',
          log_size_bucket: '1K-10K',
          timestamp: new Date().toISOString(),
          execution_time_ms: 50,
          metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
        },
      ]);

      const recommendation = await recommendBestAlgorithm('log-hash-123');

      expect(recommendation.recommended).toBe('heuristic_miner');
      expect(recommendation.reason).toContain('heuristic_miner');
      expect(recommendation.alternativeTop3).toBeDefined();
      expect(Array.isArray(recommendation.alternativeTop3)).toBe(true);
      expect(recommendation.scoringMethod).toBe('composite');
    });

    it('should default to dfg when no feedback exists', async () => {
      mockGetAlgorithmStats.mockResolvedValue({
        count: 0,
        meanFitness: 0,
        medianFitness: 0,
        meanPrecision: null,
        bucketStats: {},
      });

      mockLoadAlgorithmFeedback.mockResolvedValue([]);

      const recommendation = await recommendBestAlgorithm('log-hash-123');

      expect(recommendation.recommended).toBe('dfg');
      expect(recommendation.reason).toContain('No performance data');
    });

    it('should support different scoring methods', async () => {
      mockGetAlgorithmStats.mockResolvedValue({
        count: 1,
        meanFitness: 0.85,
        medianFitness: 0.85,
        meanPrecision: 0.80,
        bucketStats: {},
      });

      mockLoadAlgorithmFeedback.mockResolvedValue([
        {
          algorithm: 'test',
          log_size_bucket: '1K-10K',
          timestamp: new Date().toISOString(),
          execution_time_ms: 50,
          metrics: { fitness: 0.85, precision: 0.80, generalization: null, simplicity: null },
        },
      ]);

      const recommendation = await recommendBestAlgorithm('log-hash-123', 'fitness');

      expect(recommendation.scoringMethod).toBe('fitness');
    });
  });

  describe('formatAlgorithmComparison', () => {
    it('should format comparison as human-readable table', () => {
      const comparison = {
        logHash: 'log-123',
        metric: 'composite' as const,
        timestamp: '2024-01-01T00:00:00Z',
        algorithms: [
          {
            algorithm: 'dfg',
            rank: 1,
            score: 0.92,
            fitness: 0.90,
            precision: 0.85,
            speed_ms: 10,
            sample_count: 5,
          },
          {
            algorithm: 'heuristic_miner',
            rank: 2,
            score: 0.88,
            fitness: 0.85,
            precision: 0.80,
            speed_ms: 50,
            sample_count: 5,
          },
        ],
      };

      const formatted = formatAlgorithmComparison(comparison);

      expect(formatted).toContain('Algorithm Ranking');
      expect(formatted).toContain('composite');
      expect(formatted).toContain('dfg');
      expect(formatted).toContain('heuristic_miner');
      expect(formatted).toContain('Rank');
      expect(formatted).toContain('Score');
      expect(formatted).toContain('Fitness');
      expect(formatted).toContain('Precision');
    });

    it('should handle null values gracefully', () => {
      const comparison = {
        logHash: 'log-123',
        metric: 'composite' as const,
        timestamp: '2024-01-01T00:00:00Z',
        algorithms: [
          {
            algorithm: 'dfg',
            rank: 1,
            score: 0.92,
            fitness: null,
            precision: null,
            speed_ms: null,
            sample_count: 0,
          },
        ],
      };

      const formatted = formatAlgorithmComparison(comparison);

      expect(formatted).toContain('-');
      expect(formatted).toContain('dfg');
    });

    it('should format score with 3 decimal places', () => {
      const comparison = {
        logHash: 'log-123',
        metric: 'composite' as const,
        timestamp: '2024-01-01T00:00:00Z',
        algorithms: [
          {
            algorithm: 'test_algo',
            rank: 1,
            score: 0.12345,
            fitness: 0.11111,
            precision: 0.22222,
            speed_ms: 5.55555,
            sample_count: 1,
          },
        ],
      };

      const formatted = formatAlgorithmComparison(comparison);

      expect(formatted).toContain('0.123');
      expect(formatted).toContain('0.111');
      expect(formatted).toContain('0.222');
    });
  });
});
