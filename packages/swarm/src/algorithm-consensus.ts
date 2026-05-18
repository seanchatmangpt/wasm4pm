/**
 * algorithm-consensus.ts — LinUCB-based Algorithm Selection Consensus
 *
 * Contextual bandit for selecting the best algorithm across a swarm of workers.
 * Uses the LinUCB (Linear Upper Confidence Bound) algorithm to balance exploration
 * and exploitation based on historical performance and log characteristics.
 *
 * Key features:
 * - Tracks per-algorithm: quality scores, variances, confidence intervals
 * - Context-aware selection: adapts to log size, complexity, and event distribution
 * - Convergence: after sufficient history, selects best-performing algorithm
 * - Non-deterministic: uses controlled randomization for exploration
 */

import { getTracer, RunningSpans } from '@wasm4pm/observability';
import type { WorkerResult } from './types.js';

/**
 * Log statistics computed from XES/OCEL content.
 * Used as context features for LinUCB.
 */
export interface LogStats {
  eventCount: number;
  traceCount: number;
  activityCount: number;
  eventRate: number; // events per trace
  avgTraceLength: number;
  complexity: 'simple' | 'moderate' | 'complex'; // Derived from event/activity ratio
  maxTraceLength: number;
}

/**
 * Historical performance record for a single algorithm.
 */
export interface AlgorithmPerformance {
  algorithmId: string;
  runCount: number;
  qualityScores: number[]; // Ring buffer of quality scores
  meanQuality: number;
  variance: number;
  standardDeviation: number;
  confidenceInterval95: [number, number]; // [lower, upper]
  lastRunAt: string;
  explorationCount: number; // How many times this algorithm was chosen for exploration
}

/**
 * Consensus decision result.
 */
export interface ConsensusDecision {
  selectedAlgorithm: string;
  confidence: number; // 0-1, higher = more confident
  reason: string;
  explorationRate: number; // Current exploration/exploitation tradeoff
  context: LogStats;
  timestamp: string;
}

/**
 * LinUCB consensus tracker.
 * Maintains algorithm performance history and makes selection decisions.
 */
export class AlgorithmConsensus {
  private performanceHistory: Map<string, AlgorithmPerformance> = new Map();
  private contextHistory: LogStats[] = [];
  private consensusDecisions: ConsensusDecision[] = [];
  private readonly maxHistorySize = 100; // Ring buffer size
  private readonly explorationParameter = 1.0; // UCB exploration bonus
  private readonly qualityWeightFresh = 0.3; // Weight for recent quality
  private readonly qualityWeightDecay = 0.7; // Decay for older quality

  /**
   * Initialize consensus tracker with algorithm IDs to track.
   */
  constructor(algorithmIds: string[]) {
    for (const algoId of algorithmIds) {
      this.performanceHistory.set(algoId, {
        algorithmId: algoId,
        runCount: 0,
        qualityScores: [],
        meanQuality: 0.5, // Start optimistic
        variance: 0.25,
        standardDeviation: 0.5,
        confidenceInterval95: [0.0, 1.0],
        lastRunAt: new Date().toISOString(),
        explorationCount: 0,
      });
    }
  }

  /**
   * Select the best algorithm based on LinUCB with the given log statistics.
   *
   * Algorithm:
   * 1. For each algorithm, compute UCB value = mean + (explorationParameter * SE * sqrt(ln(t)))
   * 2. If not enough history, apply context-based heuristic (prefer fast algorithms for large logs)
   * 3. Return algorithm with highest UCB value
   * 4. Track exploration rate
   */
  selectAlgorithm(logStats: LogStats, rng?: { random(): number }): ConsensusDecision {
    const tracer = getTracer();
    const span = tracer.startSpan('swarm.algorithm_consensus.select', {
      attributes: {
        'consensus.event_count': logStats.eventCount,
        'consensus.trace_count': logStats.traceCount,
        'consensus.complexity': logStats.complexity,
      },
    });

    try {
      this.contextHistory.push(logStats);
      if (this.contextHistory.length > this.maxHistorySize) {
        this.contextHistory.shift();
      }

      const algorithms = Array.from(this.performanceHistory.values());
      const totalRuns = algorithms.reduce((sum, a) => sum + a.runCount, 0);

      let selectedAlgo = algorithms[0];
      let selectedUcb = -Infinity;
      let reason = '';
      let explorationRate = 0;

      // LinUCB selection
      if (totalRuns < 10) {
        // Exploration phase: try all algorithms
        const candidate = this.selectByContext(logStats, algorithms, rng);
        selectedAlgo = candidate;
        reason = `Exploration phase (${totalRuns} total runs): selected ${candidate.algorithmId} for context ${logStats.complexity}`;
        explorationRate = 1.0;
      } else {
        // Exploitation phase: use UCB
        for (const algo of algorithms) {
          const ucbValue = this.computeUcbValue(algo, totalRuns);
          if (ucbValue > selectedUcb) {
            selectedUcb = ucbValue;
            selectedAlgo = algo;
          }
        }
        explorationRate = Math.max(0.1, 1.0 / Math.sqrt(totalRuns + 1)); // Decaying exploration
        reason = `LinUCB (${totalRuns} total runs): selected ${selectedAlgo.algorithmId} with UCB=${selectedUcb.toFixed(3)}`;
      }

      const confidence = Math.min(
        1.0,
        Math.max(0.0, selectedAlgo.meanQuality + selectedAlgo.standardDeviation * 0.5)
      );

      const decision: ConsensusDecision = {
        selectedAlgorithm: selectedAlgo.algorithmId,
        confidence,
        reason,
        explorationRate,
        context: logStats,
        timestamp: new Date().toISOString(),
      };

      this.consensusDecisions.push(decision);
      if (this.consensusDecisions.length > this.maxHistorySize) {
        this.consensusDecisions.shift();
      }

      span.setAttribute('consensus.selected_algorithm', decision.selectedAlgorithm);
      span.setAttribute('consensus.confidence', decision.confidence);
      span.setAttribute('consensus.exploration_rate', decision.explorationRate);

      return decision;
    } finally {
      span.end();
    }
  }

  /**
   * Update algorithm performance after a run completes.
   *
   * Quality score is derived from result characteristics:
   * - If result is valid JSON with expected fields: quality = 0.8-1.0
   * - If result is partial/degraded: quality = 0.4-0.8
   * - If result failed: quality = 0.0
   */
  updatePerformance(
    algorithmId: string,
    workerResult: WorkerResult,
    qualityScore: number // 0-1
  ): void {
    const tracer = getTracer();
    const span = tracer.startSpan('swarm.algorithm_consensus.update', {
      attributes: {
        'consensus.algorithm': algorithmId,
        'consensus.quality': qualityScore,
      },
    });

    try {
      const perf = this.performanceHistory.get(algorithmId);
      if (!perf) {
        throw new Error(`Unknown algorithm ${algorithmId}`);
      }

      // Update run count and quality scores
      perf.runCount++;
      perf.qualityScores.push(qualityScore);
      if (perf.qualityScores.length > this.maxHistorySize) {
        perf.qualityScores.shift();
      }

      // Recompute statistics
      this.computeStatistics(perf);
      perf.lastRunAt = new Date().toISOString();

      span.setAttribute('consensus.run_count', perf.runCount);
      span.setAttribute('consensus.mean_quality', perf.meanQuality);
    } finally {
      span.end();
    }
  }

  /**
   * Get the current best algorithm based on mean quality.
   */
  getBestAlgorithm(): string {
    let best = '';
    let bestQuality = -1;
    for (const perf of this.performanceHistory.values()) {
      if (perf.runCount > 0 && perf.meanQuality > bestQuality) {
        bestQuality = perf.meanQuality;
        best = perf.algorithmId;
      }
    }
    return best || (this.performanceHistory.keys().next().value as string);
  }

  /**
   * Get all consensus decisions made so far.
   */
  getDecisionHistory(): ConsensusDecision[] {
    return [...this.consensusDecisions];
  }

  /**
   * Export performance data as JSON for logging/analysis.
   */
  exportPerformanceMetrics(): Record<string, AlgorithmPerformance> {
    const result: Record<string, AlgorithmPerformance> = {};
    for (const [algoId, perf] of this.performanceHistory) {
      result[algoId] = {
        ...perf,
        qualityScores: [...perf.qualityScores], // Freeze snapshot
      };
    }
    return result;
  }

  /**
   * Clear history (useful for testing or resetting between cycles).
   */
  reset(): void {
    this.performanceHistory.clear();
    this.contextHistory = [];
    this.consensusDecisions = [];
  }

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Compute UCB value for an algorithm.
   * UCB = mean + explorationParameter * SE * sqrt(ln(t))
   * where SE = standardDeviation / sqrt(runCount)
   */
  private computeUcbValue(perf: AlgorithmPerformance, totalRuns: number): number {
    if (perf.runCount === 0) {
      return Infinity; // Unexplored algorithms get infinite bonus
    }

    const standardError = perf.standardDeviation / Math.sqrt(perf.runCount);
    const explorationBonus = this.explorationParameter * standardError * Math.sqrt(Math.log(totalRuns));
    return perf.meanQuality + explorationBonus;
  }

  /**
   * Select algorithm based on log context when in exploration phase.
   *
   * Heuristic:
   * - Simple, large logs: prefer fast algorithms (DFG, skeleton)
   * - Complex, small logs: prefer quality algorithms (genetic, ILP)
   * - Moderate: prefer balanced algorithms (heuristic, alpha++)
   */
  private selectByContext(
    logStats: LogStats,
    algorithms: AlgorithmPerformance[],
    rng?: { random(): number }
  ): AlgorithmPerformance {
    const scoredAlgos = algorithms.map((algo) => {
      let contextScore = 0.5; // Base score

      // Prefer fast algorithms for large logs
      if (logStats.eventCount > 100000 && logStats.complexity === 'simple') {
        if (algo.algorithmId.includes('dfg') || algo.algorithmId.includes('skeleton')) {
          contextScore += 0.3;
        }
      }

      // Prefer quality algorithms for small, complex logs
      if (logStats.eventCount < 5000 && logStats.complexity === 'complex') {
        if (
          algo.algorithmId.includes('genetic') ||
          algo.algorithmId.includes('ilp') ||
          algo.algorithmId.includes('astar')
        ) {
          contextScore += 0.3;
        }
      }

      // Prefer balanced for moderate logs
      if (logStats.complexity === 'moderate') {
        if (
          algo.algorithmId.includes('heuristic') ||
          algo.algorithmId.includes('alpha') ||
          algo.algorithmId.includes('inductive')
        ) {
          contextScore += 0.2;
        }
      }

      return { algo, score: contextScore };
    });

    // Sort by context score, then by recent performance
    scoredAlgos.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return b.algo.meanQuality - a.algo.meanQuality;
    });

    // Add some randomness for exploration (if RNG provided)
    if (rng && rng.random() < 0.2) {
      // 20% chance to pick a different algorithm for exploration
      const idx = Math.floor(rng.random() * Math.min(3, scoredAlgos.length));
      return scoredAlgos[idx].algo;
    }

    return scoredAlgos[0].algo;
  }

  /**
   * Recompute mean, variance, and confidence interval for an algorithm.
   */
  private computeStatistics(perf: AlgorithmPerformance): void {
    if (perf.qualityScores.length === 0) {
      perf.meanQuality = 0.5;
      perf.variance = 0.25;
      perf.standardDeviation = 0.5;
      perf.confidenceInterval95 = [0.0, 1.0];
      return;
    }

    // Mean
    perf.meanQuality =
      perf.qualityScores.reduce((sum, q) => sum + q, 0) / perf.qualityScores.length;

    // Variance
    const variance =
      perf.qualityScores.reduce((sum, q) => sum + Math.pow(q - perf.meanQuality, 2), 0) /
      perf.qualityScores.length;
    perf.variance = variance;
    perf.standardDeviation = Math.sqrt(variance);

    // 95% confidence interval
    const se = perf.standardDeviation / Math.sqrt(perf.qualityScores.length);
    const margin = 1.96 * se; // z-score for 95% CI
    perf.confidenceInterval95 = [
      Math.max(0.0, perf.meanQuality - margin),
      Math.min(1.0, perf.meanQuality + margin),
    ];
  }
}

/**
 * Helper: Compute quality score from worker result.
 * Returns 0-1 score based on result validity and completeness.
 */
export function computeQualityScore(result: WorkerResult): number {
  if (result.failed || result.error) {
    return 0.0; // Failed run
  }

  if (!result.result) {
    return 0.2; // Empty result
  }

  // If result is a string, assume it parsed successfully
  if (typeof result.result === 'string') {
    try {
      JSON.parse(result.result);
      return 0.85; // Valid JSON result
    } catch {
      return 0.4; // Invalid JSON
    }
  }

  // If result is an object, check for expected algorithm output fields
  if (typeof result.result === 'object') {
    const obj = result.result as Record<string, unknown>;

    // Discovery results should have edges/nodes/places/transitions
    if ('edges' in obj || 'nodes' in obj || 'places' in obj) {
      return 0.9; // Complete discovery result
    }

    // ML results should have predictions/classifications/clusters
    if ('predictions' in obj || 'classifications' in obj || 'clusters' in obj) {
      return 0.85; // Complete ML result
    }

    // Partial result
    return 0.6;
  }

  return 0.5; // Unknown format, assume partial success
}
