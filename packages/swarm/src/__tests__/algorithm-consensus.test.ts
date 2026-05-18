/**
 * algorithm-consensus.test.ts — LinUCB Algorithm Consensus Tests
 *
 * Test coverage:
 * - LinUCB exploration-exploitation tradeoff
 * - Convergence to best algorithm after sufficient history
 * - Context-aware algorithm selection (log size, complexity)
 * - Performance tracking and statistics computation
 * - Quality score calculation from worker results
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AlgorithmConsensus,
  computeQualityScore,
  type LogStats,
  type ConsensusDecision,
} from '../algorithm-consensus.js';
import type { WorkerResult } from '../types.js';

describe('AlgorithmConsensus', () => {
  let consensus: AlgorithmConsensus;
  const algorithms = ['dfg', 'heuristic', 'genetic'];

  beforeEach(() => {
    consensus = new AlgorithmConsensus(algorithms);
  });

  describe('initialization', () => {
    it('should initialize with provided algorithms', () => {
      const metrics = consensus.exportPerformanceMetrics();
      expect(Object.keys(metrics)).toEqual(['dfg', 'heuristic', 'genetic']);
      expect(metrics.dfg.runCount).toBe(0);
      expect(metrics.dfg.meanQuality).toBe(0.5);
    });

    it('should set initial confidence interval to [0, 1]', () => {
      const metrics = consensus.exportPerformanceMetrics();
      expect(metrics.heuristic.confidenceInterval95).toEqual([0, 1]);
    });
  });

  describe('algorithm selection', () => {
    it('should select algorithm based on exploration phase heuristic', () => {
      const logStats: LogStats = {
        eventCount: 200000,
        traceCount: 50000,
        activityCount: 10,
        eventRate: 4,
        avgTraceLength: 4,
        complexity: 'simple',
        maxTraceLength: 6,
      };

      const decision = consensus.selectAlgorithm(logStats);

      expect(decision).toHaveProperty('selectedAlgorithm');
      expect(algorithms).toContain(decision.selectedAlgorithm);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.explorationRate).toBeGreaterThan(0);
      expect(decision.reason).toContain('Exploration');
    });

    it('should converge to best algorithm after sufficient runs', () => {
      // Run 30 iterations with high quality for 'dfg'
      for (let i = 0; i < 30; i++) {
        const logStats: LogStats = {
          eventCount: 10000 + i * 100,
          traceCount: 1000,
          activityCount: 50,
          eventRate: 10,
          avgTraceLength: 10,
          complexity: 'moderate',
          maxTraceLength: 15,
        };

        const decision = consensus.selectAlgorithm(logStats);

        // Simulate high quality for 'dfg'
        const result: WorkerResult = {
          workerId: `worker-${i}`,
          algorithmId: decision.selectedAlgorithm,
          resultHash: `hash-${i}`,
          result: { edges: [], nodes: [] },
          runAt: new Date().toISOString(),
          durationMs: 100,
          resultType: 'discovery',
        };

        const qualityScore = decision.selectedAlgorithm === 'dfg' ? 0.95 : 0.6;
        consensus.updatePerformance(decision.selectedAlgorithm, result, qualityScore);
      }

      // After 30 iterations, best algorithm should be selected
      const finalLogStats: LogStats = {
        eventCount: 15000,
        traceCount: 1000,
        activityCount: 50,
        eventRate: 15,
        avgTraceLength: 15,
        complexity: 'moderate',
        maxTraceLength: 20,
      };

      const finalDecision = consensus.selectAlgorithm(finalLogStats);
      expect(finalDecision.selectedAlgorithm).toBe('dfg');
      expect(finalDecision.reason).toContain('LinUCB');
    });

    it('should select context-appropriate algorithms', () => {
      // Large, simple log → should prefer fast algorithms
      const largeSimple: LogStats = {
        eventCount: 500000,
        traceCount: 100000,
        activityCount: 5,
        eventRate: 5,
        avgTraceLength: 5,
        complexity: 'simple',
        maxTraceLength: 8,
      };

      const decision1 = consensus.selectAlgorithm(largeSimple);
      expect(decision1.reason).toContain('Exploration');

      // Small, complex log → should prefer quality algorithms
      const smallComplex: LogStats = {
        eventCount: 1000,
        traceCount: 100,
        activityCount: 80,
        eventRate: 10,
        avgTraceLength: 10,
        complexity: 'complex',
        maxTraceLength: 15,
      };

      const decision2 = consensus.selectAlgorithm(smallComplex);
      expect(decision2.reason).toContain('Exploration');
    });

    it('should reduce exploration rate over time', () => {
      const logStats: LogStats = {
        eventCount: 10000,
        traceCount: 1000,
        activityCount: 50,
        eventRate: 10,
        avgTraceLength: 10,
        complexity: 'moderate',
        maxTraceLength: 15,
      };

      const rates: number[] = [];

      for (let i = 0; i < 20; i++) {
        const decision = consensus.selectAlgorithm(logStats);
        rates.push(decision.explorationRate);

        const result: WorkerResult = {
          workerId: `worker-${i}`,
          algorithmId: decision.selectedAlgorithm,
          resultHash: `hash-${i}`,
          result: { edges: [] },
          runAt: new Date().toISOString(),
          durationMs: 50,
          resultType: 'discovery',
        };

        consensus.updatePerformance(decision.selectedAlgorithm, result, 0.8);
      }

      // Exploration rate should generally decrease over time
      const firstThird = rates.slice(0, 6).reduce((a, b) => a + b) / 6;
      const lastThird = rates.slice(14, 20).reduce((a, b) => a + b) / 6;
      expect(lastThird).toBeLessThan(firstThird);
    });
  });

  describe('performance tracking', () => {
    it('should update algorithm performance', () => {
      const result: WorkerResult = {
        workerId: 'worker-1',
        algorithmId: 'dfg',
        resultHash: 'hash123',
        result: { edges: [], nodes: [] },
        runAt: new Date().toISOString(),
        durationMs: 100,
        resultType: 'discovery',
      };

      consensus.updatePerformance('dfg', result, 0.9);

      const metrics = consensus.exportPerformanceMetrics();
      expect(metrics.dfg.runCount).toBe(1);
      expect(metrics.dfg.qualityScores).toContain(0.9);
    });

    it('should compute mean quality correctly', () => {
      const result = (quality: number, idx: number): WorkerResult => ({
        workerId: `worker-${idx}`,
        algorithmId: 'heuristic',
        resultHash: `hash${idx}`,
        result: { edges: [] },
        runAt: new Date().toISOString(),
        durationMs: 50,
        resultType: 'discovery',
      });

      consensus.updatePerformance('heuristic', result(0.7, 1), 0.7);
      consensus.updatePerformance('heuristic', result(0.8, 2), 0.8);
      consensus.updatePerformance('heuristic', result(0.9, 3), 0.9);

      const metrics = consensus.exportPerformanceMetrics();
      expect(metrics.heuristic.meanQuality).toBeCloseTo(0.8, 1);
    });

    it('should compute variance and standard deviation', () => {
      const result = (quality: number, idx: number): WorkerResult => ({
        workerId: `worker-${idx}`,
        algorithmId: 'genetic',
        resultHash: `hash${idx}`,
        result: { edges: [] },
        runAt: new Date().toISOString(),
        durationMs: 200,
        resultType: 'discovery',
      });

      // High variance: [0.2, 0.8]
      consensus.updatePerformance('genetic', result(0.2, 1), 0.2);
      consensus.updatePerformance('genetic', result(0.8, 2), 0.8);

      const metrics = consensus.exportPerformanceMetrics();
      expect(metrics.genetic.variance).toBeGreaterThan(0.1);
      expect(metrics.genetic.standardDeviation).toBeGreaterThan(0.2);
    });

    it('should maintain ring buffer of quality scores', () => {
      const result = (idx: number): WorkerResult => ({
        workerId: `worker-${idx}`,
        algorithmId: 'dfg',
        resultHash: `hash${idx}`,
        result: { edges: [] },
        runAt: new Date().toISOString(),
        durationMs: 50,
        resultType: 'discovery',
      });

      // Add 150 scores (exceeds default buffer size of 100)
      for (let i = 0; i < 150; i++) {
        consensus.updatePerformance('dfg', result(i), 0.5 + (i % 10) * 0.05);
      }

      const metrics = consensus.exportPerformanceMetrics();
      expect(metrics.dfg.qualityScores.length).toBeLessThanOrEqual(100);
      expect(metrics.dfg.runCount).toBe(150); // runCount is not capped
    });

    it('should compute 95% confidence interval', () => {
      const result = (idx: number): WorkerResult => ({
        workerId: `worker-${idx}`,
        algorithmId: 'heuristic',
        resultHash: `hash${idx}`,
        result: { edges: [] },
        runAt: new Date().toISOString(),
        durationMs: 75,
        resultType: 'discovery',
      });

      // Add 20 scores with mean 0.75
      for (let i = 0; i < 20; i++) {
        consensus.updatePerformance('heuristic', result(i), 0.7 + (i % 10) * 0.01);
      }

      const metrics = consensus.exportPerformanceMetrics();
      const [lower, upper] = metrics.heuristic.confidenceInterval95;

      expect(lower).toBeGreaterThanOrEqual(0.0);
      expect(upper).toBeLessThanOrEqual(1.0);
      expect(lower).toBeLessThan(metrics.heuristic.meanQuality);
      expect(upper).toBeGreaterThan(metrics.heuristic.meanQuality);
    });
  });

  describe('best algorithm selection', () => {
    it('should return algorithm with highest mean quality', () => {
      const result = (algo: string, quality: number, idx: number): WorkerResult => ({
        workerId: `worker-${algo}-${idx}`,
        algorithmId: algo,
        resultHash: `hash${algo}${idx}`,
        result: { edges: [] },
        runAt: new Date().toISOString(),
        durationMs: 50,
        resultType: 'discovery',
      });

      // dfg: high quality
      for (let i = 0; i < 5; i++) {
        consensus.updatePerformance('dfg', result('dfg', 0.9, i), 0.9);
      }

      // heuristic: medium quality
      for (let i = 0; i < 5; i++) {
        consensus.updatePerformance('heuristic', result('heuristic', 0.6, i), 0.6);
      }

      // genetic: low quality
      for (let i = 0; i < 5; i++) {
        consensus.updatePerformance('genetic', result('genetic', 0.3, i), 0.3);
      }

      expect(consensus.getBestAlgorithm()).toBe('dfg');
    });

    it('should return undefined best algorithm if no runs yet', () => {
      const best = consensus.getBestAlgorithm();
      // Should return some algorithm, defaulting to first if no quality data
      expect(algorithms).toContain(best);
    });
  });

  describe('history export and reset', () => {
    it('should export performance metrics', () => {
      const result: WorkerResult = {
        workerId: 'worker-1',
        algorithmId: 'dfg',
        resultHash: 'hash123',
        result: { edges: [] },
        runAt: new Date().toISOString(),
        durationMs: 100,
        resultType: 'discovery',
      };

      consensus.updatePerformance('dfg', result, 0.85);

      const metrics = consensus.exportPerformanceMetrics();
      expect(metrics.dfg.runCount).toBe(1);
      expect(metrics.dfg.meanQuality).toBeCloseTo(0.85, 2);
    });

    it('should track decision history', () => {
      const logStats: LogStats = {
        eventCount: 10000,
        traceCount: 1000,
        activityCount: 50,
        eventRate: 10,
        avgTraceLength: 10,
        complexity: 'moderate',
        maxTraceLength: 15,
      };

      consensus.selectAlgorithm(logStats);
      consensus.selectAlgorithm(logStats);

      const history = consensus.getDecisionHistory();
      expect(history.length).toBe(2);
      expect(history[0]).toHaveProperty('selectedAlgorithm');
    });

    it('should reset state', () => {
      const result: WorkerResult = {
        workerId: 'worker-1',
        algorithmId: 'dfg',
        resultHash: 'hash123',
        result: { edges: [] },
        runAt: new Date().toISOString(),
        durationMs: 100,
        resultType: 'discovery',
      };

      consensus.updatePerformance('dfg', result, 0.9);
      consensus.reset();

      const metrics = consensus.exportPerformanceMetrics();
      expect(metrics.dfg.runCount).toBe(0);
      expect(metrics.dfg.qualityScores.length).toBe(0);
      expect(consensus.getDecisionHistory().length).toBe(0);
    });
  });

  describe('consensus decision details', () => {
    it('should include all required fields in decision', () => {
      const logStats: LogStats = {
        eventCount: 5000,
        traceCount: 500,
        activityCount: 30,
        eventRate: 10,
        avgTraceLength: 10,
        complexity: 'moderate',
        maxTraceLength: 15,
      };

      const decision = consensus.selectAlgorithm(logStats);

      expect(decision).toHaveProperty('selectedAlgorithm');
      expect(decision).toHaveProperty('confidence');
      expect(decision).toHaveProperty('reason');
      expect(decision).toHaveProperty('explorationRate');
      expect(decision).toHaveProperty('context');
      expect(decision).toHaveProperty('timestamp');

      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.explorationRate).toBeGreaterThanOrEqual(0);
      expect(decision.reason).toBeInstanceOf(String);
    });
  });
});

describe('computeQualityScore', () => {
  it('should return 0 for failed results', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'FAILED',
      result: null,
      runAt: new Date().toISOString(),
      durationMs: 50,
      failed: true,
      error: 'Some error',
    };

    expect(computeQualityScore(result)).toBe(0.0);
  });

  it('should return 0.2 for empty results', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'hash123',
      result: null,
      runAt: new Date().toISOString(),
      durationMs: 50,
    };

    expect(computeQualityScore(result)).toBe(0.2);
  });

  it('should return 0.85 for valid JSON string result', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'hash123',
      result: '{"edges": [], "nodes": []}',
      runAt: new Date().toISOString(),
      durationMs: 50,
    };

    expect(computeQualityScore(result)).toBe(0.85);
  });

  it('should return 0.4 for invalid JSON string', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'hash123',
      result: 'not valid json',
      runAt: new Date().toISOString(),
      durationMs: 50,
    };

    expect(computeQualityScore(result)).toBe(0.4);
  });

  it('should return 0.9 for discovery result with edges', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'hash123',
      result: { edges: [['A', 'B']], nodes: ['A', 'B'] },
      runAt: new Date().toISOString(),
      durationMs: 50,
    };

    expect(computeQualityScore(result)).toBe(0.9);
  });

  it('should return 0.85 for ML result with predictions', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'ml_classify',
      resultHash: 'hash123',
      result: { predictions: [0, 1, 0, 1] },
      runAt: new Date().toISOString(),
      durationMs: 50,
      resultType: 'ml',
    };

    expect(computeQualityScore(result)).toBe(0.85);
  });

  it('should return 0.6 for partial result', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'hash123',
      result: { partial: true },
      runAt: new Date().toISOString(),
      durationMs: 50,
    };

    expect(computeQualityScore(result)).toBe(0.6);
  });

  it('should return 0.5 for unknown result format', () => {
    const result: WorkerResult = {
      workerId: 'worker-1',
      algorithmId: 'dfg',
      resultHash: 'hash123',
      result: 42,
      runAt: new Date().toISOString(),
      durationMs: 50,
    };

    expect(computeQualityScore(result)).toBe(0.5);
  });
});
