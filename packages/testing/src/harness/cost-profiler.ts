/**
 * Agent 6: Cost Profiler
 *
 * Selects optimal algorithm per resource budget (cost, latency, compute).
 * Fitness matters only if affordable.
 */

import type { AlgorithmResult } from './algorithm-discovery';

export interface ResourceBudget {
  maxLatencyMs: number;
  maxComputeUnits: number;
  costLimit: number; // dollars
}

export interface CostAnalysis {
  name: string;
  fitnessPerCostRatio: number;
  costPerUnit: number;
  affordability: number; // 0-1
}

export interface TierRecommendation {
  tier: 'budget' | 'standard' | 'premium';
  selectedAlgorithm: AlgorithmResult;
  reason: string;
  estimatedCost: number;
}

export class CostProfiler {
  async selectOptimalAlgorithm(
    algorithms: AlgorithmResult[],
    budget: ResourceBudget
  ): Promise<AlgorithmResult> {
    // Filter affordable algorithms
    const affordable = await this.filterAffordable(algorithms, budget);

    if (affordable.length === 0) {
      // If nothing affordable, return fastest
      return algorithms.reduce((prev, curr) =>
        curr.executionTimeMs < prev.executionTimeMs ? curr : prev
      );
    }

    // Rank by fitness per cost
    const ranked = await this.rankByFitnessPerCost(affordable);
    return ranked[0];
  }

  async filterAffordable(
    algorithms: AlgorithmResult[],
    budget: ResourceBudget
  ): Promise<AlgorithmResult[]> {
    return algorithms.filter((algo) => {
      // Latency check
      if (algo.executionTimeMs > budget.maxLatencyMs) return false;

      // Compute check (rough: execution time * edges)
      const computeUsage = algo.executionTimeMs * (algo.edgeCount / 10);
      if (computeUsage > budget.maxComputeUnits) return false;

      // Cost check
      const cost = this.estimateCost(algo, 1000); // Assume 1K event log
      if (cost > budget.costLimit) return false;

      return true;
    });
  }

  async rankByFitnessPerCost(algorithms: AlgorithmResult[]): Promise<CostAnalysis[]> {
    const analysis = algorithms.map((algo) => ({
      name: algo.name,
      fitnessPerCostRatio: algo.fitness / (this.estimateCost(algo, 1000) + 0.1),
      costPerUnit: this.estimateCost(algo, 1000) / (algo.fitness + 0.1),
      affordability: 1.0 - algo.executionTimeMs / 2000, // Normalize to [0,1]
    }));

    return analysis.sort((a, b) => b.fitnessPerCostRatio - a.fitnessPerCostRatio);
  }

  estimateCost(algo: AlgorithmResult, logSize: number): number {
    // Simple cost model: base cost + scaling with log size
    const baseCost: Record<string, number> = {
      dfg: 0.5,
      process_skeleton: 0.5,
      alpha_plus_plus: 1,
      heuristic_miner: 1.5,
      inductive_miner: 2,
      hill_climbing: 5,
      declare: 3,
      simulated_annealing: 8,
      a_star: 10,
      aco: 12,
      pso: 12,
      genetic_algorithm: 15,
      optimized_dfg: 2,
      ilp: 25,
      powl: 3,
    };

    const base = baseCost[algo.name] || 5;
    const scaling = (algo.executionTimeMs / 100) * (logSize / 1000);
    return base + scaling;
  }

  async recommendTier(
    algorithms: AlgorithmResult[],
    budget: ResourceBudget
  ): Promise<TierRecommendation> {
    const affordable = await this.filterAffordable(algorithms, budget);

    if (affordable.length === 0) {
      return {
        tier: 'budget',
        selectedAlgorithm: algorithms[0],
        reason: 'No algorithms fit budget; using fastest available',
        estimatedCost: this.estimateCost(algorithms[0], 1000),
      };
    }

    const ranked = await this.rankByFitnessPerCost(affordable);
    const selected = algorithms.find((a) => a.name === ranked[0].name)!;

    let tier: 'budget' | 'standard' | 'premium';
    if (budget.costLimit <= 5) {
      tier = 'budget';
    } else if (budget.costLimit <= 50) {
      tier = 'standard';
    } else {
      tier = 'premium';
    }

    return {
      tier,
      selectedAlgorithm: selected,
      reason: `${tier} tier: fitness=${selected.fitness.toFixed(2)}, cost=${this.estimateCost(selected, 1000).toFixed(2)}, latency=${selected.executionTimeMs}ms`,
      estimatedCost: this.estimateCost(selected, 1000),
    };
  }
}
