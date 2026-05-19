/**
 * baseline-capture.test.ts
 *
 * Tests for baseline capture and regression detection harnesses.
 *
 * Test categories:
 *   A - Baseline capture mechanics
 *   B - Regression detection (fitness/precision thresholds)
 *   C - Baseline fixture format validation
 *   D - Batch operations
 *   E - Summary and reporting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { AlgorithmBaseline } from '../harness/baseline-capture.js';
import {
  captureAlgorithmBaseline,
  captureAlgorithmBaselineBatch,
  checkRegressionAgainstBaseline,
} from '../harness/baseline-capture.js';
import {
  checkRegressionAgainstBaseline as checkRegression,
  summarizeRegressionReports,
  detailedRegressionReport,
} from '../harness/baseline-regression-check.js';

// Load baselines fixture
const baselineData = `{
  "version": "26.4.18",
  "timestamp": "2026-05-18T00:00:00Z",
  "description": "Test baseline fixture",
  "discovery_algorithms": {
    "dfg_n100": {
      "id": "dfg_n100_a10",
      "algorithm": "dfg",
      "fitness": 0.95,
      "precision": 0.92,
      "qualityScore": 0.935,
      "nodeCount": 10,
      "edgeCount": 24,
      "durationMs": 2,
      "profile": "browser",
      "capturedAt": "2026-05-18T00:00:00Z"
    }
  },
  "analysis_algorithms": {},
  "simulation_algorithms": {},
  "ml_algorithms": {}
}`;
const baselines = JSON.parse(baselineData) as typeof import('../../fixtures/algorithm-baselines.json');

/**
 * Mock Kernel for testing
 */
class MockKernel {
  async run(algorithmId: string, logHandle: string, params: Record<string, unknown>) {
    // Return mock result based on algorithm
    const results: Record<string, unknown> = {
      dfg: { nodes: ['A', 'B', 'C'], edges: [['A', 'B'], ['B', 'C']] },
      heuristic_miner: { nodes: ['A', 'B', 'C'], edges: [['A', 'B'], ['B', 'C']] },
      genetic_algorithm: {
        nodes: ['A', 'B', 'C', 'D'],
        edges: [['A', 'B'], ['B', 'C'], ['C', 'D'], ['A', 'D']],
      },
      ml_classify: { accuracy: 0.82, predictions: [] },
      ml_cluster: { silhouette: 0.75, clusters: 5 },
    };

    return JSON.stringify(results[algorithmId] || { nodes: [], edges: [] });
  }
}

describe('Baseline Capture', () => {
  let kernel: MockKernel;

  beforeEach(() => {
    kernel = new MockKernel();
  });

  // Category A: Baseline capture mechanics
  describe('captureAlgorithmBaseline', () => {
    it('A1: captures baseline metrics for DFG algorithm', async () => {
      const baseline = await captureAlgorithmBaseline(kernel, 'dfg', 'log_handle_1', {
        activity_key: 'concept:name',
      });

      expect(baseline).toBeDefined();
      expect(baseline.algorithm).toBe('dfg');
      expect(baseline.fitness).toBeGreaterThanOrEqual(0);
      expect(baseline.fitness).toBeLessThanOrEqual(1);
      expect(baseline.precision).toBeGreaterThanOrEqual(0);
      expect(baseline.precision).toBeLessThanOrEqual(1);
      expect(baseline.qualityScore).toBe((baseline.fitness + baseline.precision) / 2);
      expect(baseline.durationMs).toBeGreaterThanOrEqual(0);
      expect(baseline.nodeCount).toBeGreaterThanOrEqual(0);
      expect(baseline.edgeCount).toBeGreaterThanOrEqual(0);
    });

    it('A2: captures baseline with custom options', async () => {
      const baseline = await captureAlgorithmBaseline(
        kernel,
        'heuristic_miner',
        'log_handle_2',
        { activity_key: 'custom:key', dependency_threshold: 0.3 },
        {
          activityKey: 'custom:key',
          profile: 'fog',
          captureMetadata: true,
        }
      );

      expect(baseline.profile).toBe('fog');
      expect(baseline.logMetadata).toBeDefined();
      expect(baseline.logMetadata?.activityKey).toBe('custom:key');
    });

    it('A3: captures baseline for ML algorithm (classify)', async () => {
      const baseline = await captureAlgorithmBaseline(
        kernel,
        'ml_classify',
        'log_handle_3',
        { method: 'knn', k: 3 }
      );

      expect(baseline.algorithm).toBe('ml_classify');
      expect(baseline.fitness).toBe(0.82); // From mock result
    });

    it('A4: captures baseline for ML algorithm (cluster)', async () => {
      const baseline = await captureAlgorithmBaseline(
        kernel,
        'ml_cluster',
        'log_handle_4',
        { method: 'kmeans', k: 5 }
      );

      expect(baseline.algorithm).toBe('ml_cluster');
      expect(baseline.fitness).toBe(0.75); // Silhouette score from mock
    });
  });

  // Category B: Regression detection
  describe('checkRegressionAgainstBaseline', () => {
    it('B1: detects fitness regression (critical)', () => {
      const baseline: AlgorithmBaseline = {
        id: 'dfg_n100_a10',
        algorithm: 'dfg',
        logSize: 100,
        activityCount: 10,
        fitness: 0.95,
        precision: 0.92,
        qualityScore: 0.935,
        nodeCount: 10,
        edgeCount: 24,
        durationMs: 2,
        profile: 'browser',
        capturedAt: '2026-05-18T00:00:00Z',
      };

      const current: AlgorithmBaseline = {
        ...baseline,
        fitness: 0.90, // 5.3% drop
      };

      const report = checkRegression(current, 5);

      expect(report.passed).toBe(false);
      expect(report.regressions.length).toBeGreaterThan(0);
      expect(report.regressions.some((r) => r.metric === 'fitness' && r.severity === 'critical')).toBe(true);
    });

    it('B2: detects quality score regression (warning)', () => {
      const baseline: AlgorithmBaseline = {
        id: 'heuristic_n100_a10',
        algorithm: 'heuristic_miner',
        logSize: 100,
        activityCount: 10,
        fitness: 0.87,
        precision: 0.84,
        qualityScore: 0.855,
        nodeCount: 10,
        edgeCount: 22,
        durationMs: 6,
        profile: 'browser',
        capturedAt: '2026-05-18T00:00:00Z',
      };

      const current: AlgorithmBaseline = {
        ...baseline,
        qualityScore: 0.82, // 4.1% drop
      };

      const report = checkRegression(current, 5);

      expect(report.regressions.some((r) => r.metric === 'qualityScore')).toBe(true);
    });

    it('B3: detects performance regression (info)', () => {
      const baseline: AlgorithmBaseline = {
        id: 'dfg_n100_a10',
        algorithm: 'dfg',
        logSize: 100,
        activityCount: 10,
        fitness: 0.95,
        precision: 0.92,
        qualityScore: 0.935,
        nodeCount: 10,
        edgeCount: 24,
        durationMs: 2,
        profile: 'browser',
        capturedAt: '2026-05-18T00:00:00Z',
      };

      const current: AlgorithmBaseline = {
        ...baseline,
        durationMs: 3, // 50% slower
      };

      const report = checkRegression(current, 5);

      expect(report.regressions.some((r) => r.metric === 'durationMs' && r.severity === 'info')).toBe(true);
    });

    it('B4: passes when metrics improve', () => {
      const baseline: AlgorithmBaseline = {
        id: 'dfg_n100_a10',
        algorithm: 'dfg',
        logSize: 100,
        activityCount: 10,
        fitness: 0.95,
        precision: 0.92,
        qualityScore: 0.935,
        nodeCount: 10,
        edgeCount: 24,
        durationMs: 2,
        profile: 'browser',
        capturedAt: '2026-05-18T00:00:00Z',
      };

      const current: AlgorithmBaseline = {
        ...baseline,
        fitness: 0.97, // Improved
        precision: 0.94, // Improved
      };

      const report = checkRegression(current, 5);

      expect(report.passed).toBe(true);
      expect(report.regressions.filter((r) => r.severity === 'critical')).toHaveLength(0);
    });

    it('B5: handles missing baseline gracefully', () => {
      const current: AlgorithmBaseline = {
        id: 'unknown_algo_n100_a10',
        algorithm: 'unknown_algo',
        logSize: 100,
        activityCount: 10,
        fitness: 0.80,
        precision: 0.77,
        qualityScore: 0.785,
        nodeCount: 10,
        edgeCount: 20,
        durationMs: 10,
        profile: 'browser',
        capturedAt: '2026-05-18T00:00:00Z',
      };

      const report = checkRegression(current, 5);

      expect(report.baseline).toBeNull();
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations[0]).toContain('No baseline found');
    });
  });

  // Category C: Fixture format validation
  describe('Baseline Fixture Format', () => {
    it('C1: fixture has required top-level fields', () => {
      expect(baselines).toHaveProperty('version');
      expect(baselines).toHaveProperty('timestamp');
      expect(baselines).toHaveProperty('description');
      expect(baselines).toHaveProperty('environment');
      expect(baselines).toHaveProperty('metadata');
    });

    it('C2: fixture has algorithm categories', () => {
      expect(baselines).toHaveProperty('discovery_algorithms');
      expect(baselines).toHaveProperty('analysis_algorithms');
      expect(baselines).toHaveProperty('simulation_algorithms');
      expect(baselines).toHaveProperty('ml_algorithms');
    });

    it('C3: each algorithm entry has required baseline fields', () => {
      const entries = Object.values(baselines.discovery_algorithms || {});
      expect(entries.length).toBeGreaterThan(0);

      entries.forEach((entry) => {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('algorithm');
        expect(entry).toHaveProperty('fitness');
        expect(entry).toHaveProperty('precision');
        expect(entry).toHaveProperty('qualityScore');
        expect(entry).toHaveProperty('nodeCount');
        expect(entry).toHaveProperty('edgeCount');
        expect(entry).toHaveProperty('durationMs');
        expect(entry).toHaveProperty('profile');
        expect(entry).toHaveProperty('capturedAt');

        // Validate value ranges
        expect(entry.fitness).toBeGreaterThanOrEqual(0);
        expect(entry.fitness).toBeLessThanOrEqual(1);
        expect(entry.precision).toBeGreaterThanOrEqual(0);
        expect(entry.precision).toBeLessThanOrEqual(1);
        expect(entry.qualityScore).toBeGreaterThanOrEqual(0);
        expect(entry.qualityScore).toBeLessThanOrEqual(1);
        expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      });
    });

    it('C4: quality score is correctly calculated', () => {
      const entries = [
        ...Object.values(baselines.discovery_algorithms || {}),
        ...Object.values(baselines.analysis_algorithms || {}),
      ];

      entries.forEach((entry) => {
        const calculated = (entry.fitness + entry.precision) / 2;
        expect(entry.qualityScore).toBeCloseTo(calculated, 3);
      });
    });

    it('C5: fixture has minimum coverage', () => {
      const discoveryCount = Object.keys(baselines.discovery_algorithms || {}).length;
      const analysisCount = Object.keys(baselines.analysis_algorithms || {}).length;
      const simulationCount = Object.keys(baselines.simulation_algorithms || {}).length;
      const mlCount = Object.keys(baselines.ml_algorithms || {}).length;

      expect(discoveryCount).toBeGreaterThanOrEqual(10);
      expect(analysisCount).toBeGreaterThanOrEqual(8);
      expect(simulationCount).toBeGreaterThanOrEqual(2);
      expect(mlCount).toBeGreaterThanOrEqual(5);
    });
  });

  // Category D: Batch operations
  describe('captureAlgorithmBaselineBatch', () => {
    it('D1: captures baselines for multiple algorithms', async () => {
      const algorithms = ['dfg', 'heuristic_miner', 'genetic_algorithm'];
      const baselines = await captureAlgorithmBaselineBatch(kernel, algorithms, 'log_handle_batch', {
        activityKey: 'concept:name',
      });

      expect(baselines).toHaveLength(3);
      expect(baselines[0].algorithm).toBe('dfg');
      expect(baselines[1].algorithm).toBe('heuristic_miner');
      expect(baselines[2].algorithm).toBe('genetic_algorithm');
    });

    it('D2: handles partial failures gracefully', async () => {
      const algorithms = ['dfg', 'nonexistent_algo', 'heuristic_miner'];
      const baselines = await captureAlgorithmBaselineBatch(kernel, algorithms, 'log_handle_partial');

      // Should still capture known algorithms
      expect(baselines.length).toBeGreaterThanOrEqual(2);
      expect(baselines.some((b) => b.algorithm === 'dfg')).toBe(true);
    });
  });

  // Category E: Summary and reporting
  describe('Regression Reporting', () => {
    it('E1: generates summary from multiple reports', () => {
      const reports = [
        {
          algorithm: 'dfg',
          passed: true,
          baseline: baselines.discovery_algorithms.dfg_n100,
          current: {
            ...baselines.discovery_algorithms.dfg_n100,
            fitness: 0.97,
          } as AlgorithmBaseline,
          regressions: [],
          recommendations: [],
        },
        {
          algorithm: 'heuristic_miner',
          passed: false,
          baseline: baselines.discovery_algorithms.heuristic_miner_n100,
          current: {
            ...baselines.discovery_algorithms.heuristic_miner_n100,
            fitness: 0.82,
          } as AlgorithmBaseline,
          regressions: [
            {
              metric: 'fitness',
              baselineValue: 0.87,
              currentValue: 0.82,
              delta: -0.05,
              deltaPercent: -5.7,
              threshold: 0.0435,
              severity: 'critical' as const,
            },
          ],
          recommendations: ['Check algorithm parameters'],
        },
      ];

      const summary = summarizeRegressionReports(reports);

      expect(summary).toContain('Passed: 1/2');
      expect(summary).toContain('Failed: 1/2');
      expect(summary).toContain('CRITICAL REGRESSIONS');
      expect(summary).toContain('Check algorithm parameters');
    });

    it('E2: generates detailed report for single algorithm', () => {
      const report = {
        algorithm: 'dfg',
        passed: false,
        baseline: baselines.discovery_algorithms.dfg_n100,
        current: {
          ...baselines.discovery_algorithms.dfg_n100,
          fitness: 0.90,
        } as AlgorithmBaseline,
        regressions: [
          {
            metric: 'fitness',
            baselineValue: 0.95,
            currentValue: 0.90,
            delta: -0.05,
            deltaPercent: -5.26,
            threshold: 0.0475,
            severity: 'critical' as const,
          },
        ],
        recommendations: ['Review discovery logic'],
      };

      const detailed = detailedRegressionReport(report);

      expect(detailed).toContain('dfg');
      expect(detailed).toContain('Fitness');
      expect(detailed).toContain('↓');
      expect(detailed).toContain('Regressions Detected');
    });
  });
});
