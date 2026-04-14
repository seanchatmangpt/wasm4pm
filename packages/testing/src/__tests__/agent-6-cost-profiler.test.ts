/**
 * Agent 6: Cost Profiler — RED Test
 *
 * Mandate: Choose optimal algorithm per resource budget (cost, latency, compute)
 * Ground Truth: van der Aalst — fitness/precision matter only if affordable
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostProfiler } from '../harness/cost-profiler';
import type { AlgorithmResult } from '../harness/algorithm-discovery';

describe('Agent 6: Cost Profiler', () => {
  let profiler: CostProfiler;

  beforeEach(() => {
    profiler = new CostProfiler();
  });

  describe('Algorithm Selection by Budget', () => {
    it('selects fastest algorithm under strict latency budget', async () => {
      const algorithms: AlgorithmResult[] = [
        { name: 'dfg', fitness: 0.85, precision: 0.75, simplicity: 0.9, generalization: 0.8, executionTimeMs: 2, edgeCount: 10, transitionCount: 5 },
        { name: 'genetic_algorithm', fitness: 0.95, precision: 0.92, simplicity: 0.7, generalization: 0.9, executionTimeMs: 500, edgeCount: 15, transitionCount: 12 },
        { name: 'ilp', fitness: 0.98, precision: 0.96, simplicity: 0.6, generalization: 0.95, executionTimeMs: 1000, edgeCount: 20, transitionCount: 18 },
      ];

      const budget = { maxLatencyMs: 10, maxComputeUnits: 100, costLimit: 5 };
      const selected = await profiler.selectOptimalAlgorithm(algorithms, budget);

      expect(selected.name).toBe('dfg');
      expect(selected.executionTimeMs).toBeLessThanOrEqual(10);
    });

    it('selects highest quality within compute budget', async () => {
      const algorithms: AlgorithmResult[] = [
        { name: 'dfg', fitness: 0.85, precision: 0.75, simplicity: 0.9, generalization: 0.8, executionTimeMs: 2, edgeCount: 10, transitionCount: 5 },
        { name: 'heuristic_miner', fitness: 0.88, precision: 0.85, simplicity: 0.8, generalization: 0.85, executionTimeMs: 20, edgeCount: 12, transitionCount: 8 },
        { name: 'genetic_algorithm', fitness: 0.95, precision: 0.92, simplicity: 0.7, generalization: 0.9, executionTimeMs: 500, edgeCount: 15, transitionCount: 12 },
      ];

      const budget = { maxLatencyMs: 100, maxComputeUnits: 50, costLimit: 10 };
      const selected = await profiler.selectOptimalAlgorithm(algorithms, budget);

      // Should pick heuristic_miner (best quality within budget)
      expect(selected.executionTimeMs).toBeLessThanOrEqual(100);
      expect(selected.fitness).toBeGreaterThanOrEqual(0.88);
    });

    it('balances fitness vs cost tradeoff', async () => {
      const algorithms: AlgorithmResult[] = [
        { name: 'dfg', fitness: 0.8, precision: 0.7, simplicity: 0.95, generalization: 0.75, executionTimeMs: 1, edgeCount: 5, transitionCount: 3 },
        { name: 'a_star', fitness: 0.92, precision: 0.9, simplicity: 0.65, generalization: 0.88, executionTimeMs: 200, edgeCount: 20, transitionCount: 15 },
        { name: 'ilp', fitness: 0.98, precision: 0.97, simplicity: 0.5, generalization: 0.96, executionTimeMs: 2000, edgeCount: 30, transitionCount: 25 },
      ];

      const result = await profiler.rankByFitnessPerCost(algorithms);

      // Should rank a_star high (good balance of fitness and cost)
      expect(result[0].fitnessPerCostRatio).toBeGreaterThan(result[1].fitnessPerCostRatio);
    });
  });

  describe('Cost Estimation', () => {
    it('calculates algorithm cost per log size', async () => {
      const algo: AlgorithmResult = {
        name: 'genetic_algorithm',
        fitness: 0.95,
        precision: 0.92,
        simplicity: 0.7,
        generalization: 0.9,
        executionTimeMs: 500,
        edgeCount: 15,
        transitionCount: 12,
      };

      const logSizes = [100, 1000, 10000];
      const costs = logSizes.map((size) => profiler.estimateCost(algo, size));

      // Cost should increase with log size (roughly linear or sublinear)
      expect(costs[1]).toBeGreaterThan(costs[0]);
      expect(costs[2]).toBeGreaterThan(costs[1]);
    });

    it('identifies cost-prohibitive algorithms', async () => {
      const algorithms: AlgorithmResult[] = [
        { name: 'dfg', fitness: 0.85, precision: 0.75, simplicity: 0.9, generalization: 0.8, executionTimeMs: 2, edgeCount: 10, transitionCount: 5 },
        { name: 'ilp', fitness: 0.98, precision: 0.96, simplicity: 0.6, generalization: 0.95, executionTimeMs: 5000, edgeCount: 50, transitionCount: 45 },
      ];

      const budget = { maxLatencyMs: 100, maxComputeUnits: 200, costLimit: 20 };
      const affordable = await profiler.filterAffordable(algorithms, budget);

      expect(affordable).toContainEqual(expect.objectContaining({ name: 'dfg' }));
      expect(affordable).not.toContainEqual(expect.objectContaining({ name: 'ilp' }));
    });
  });

  describe('Resource Tier Selection', () => {
    it('recommends tier based on budget constraints', async () => {
      const algorithms: AlgorithmResult[] = [
        { name: 'dfg', fitness: 0.85, precision: 0.75, simplicity: 0.9, generalization: 0.8, executionTimeMs: 2, edgeCount: 10, transitionCount: 5 },
        { name: 'genetic_algorithm', fitness: 0.95, precision: 0.92, simplicity: 0.7, generalization: 0.9, executionTimeMs: 500, edgeCount: 15, transitionCount: 12 },
        { name: 'ilp', fitness: 0.98, precision: 0.96, simplicity: 0.6, generalization: 0.95, executionTimeMs: 2000, edgeCount: 30, transitionCount: 25 },
      ];

      const budget = { maxLatencyMs: 100, maxComputeUnits: 100, costLimit: 50 };
      const recommendation = await profiler.recommendTier(algorithms, budget);

      expect(recommendation.tier).toBeDefined();
      expect(recommendation.selectedAlgorithm).toBeDefined();
      expect(recommendation.reason).toBeDefined();
    });
  });
});
