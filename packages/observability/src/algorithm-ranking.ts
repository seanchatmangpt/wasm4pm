/**
 * algorithm-ranking.ts
 * Multi-algorithm performance comparison and ranking
 *
 * Provides:
 * - `rankAlgorithmsByPerformance(logHash, metric)` → Algorithm[]
 * - `getAlgorithmComparison(logHash)` → Comparative metrics table
 * - `recommendBestAlgorithm(logHash)` → Single best algorithm
 *
 * Uses feedback loop data to rank algorithms and find optimal performers
 */

import {
  loadAlgorithmFeedback,
  getAlgorithmStats,
  FeedbackRecord,
} from './feedback-loop.js';

/**
 * Ranking metric types
 */
export type RankingMetric = 'fitness' | 'precision' | 'speed' | 'composite';

/**
 * Ranked algorithm result with score breakdown
 */
export interface RankedAlgorithm {
  algorithm: string;
  rank: number; // 1-based (1 is best)
  score: number; // 0-1
  fitness: number | null;
  precision: number | null;
  speed_ms: number | null;
  sample_count: number; // How many feedback records
}

/**
 * Comparison table for multiple algorithms
 */
export interface AlgorithmComparison {
  logHash: string;
  metric: RankingMetric;
  timestamp: string;
  algorithms: RankedAlgorithm[];
}

/**
 * Recommendation result
 */
export interface AlgorithmRecommendation {
  recommended: string;
  reason: string;
  alternativeTop3: string[];
  scoringMethod: RankingMetric;
}

/**
 * Compute a composite score from fitness, precision, and speed
 * Weights: fitness 50%, precision 30%, speed 20%
 *
 * All inputs should be in [0, 1] range
 */
function computeCompositeScore(
  fitness: number | null,
  precision: number | null,
  speedScore: number
): number {
  let composite = 0;
  let weightSum = 0;

  if (fitness !== null && fitness >= 0) {
    composite += fitness * 0.5;
    weightSum += 0.5;
  }

  if (precision !== null && precision >= 0) {
    composite += precision * 0.3;
    weightSum += 0.3;
  }

  // Speed is inverse: faster is better
  composite += speedScore * 0.2;
  weightSum += 0.2;

  return weightSum > 0 ? composite / weightSum : 0;
}

/**
 * Normalize speed to [0, 1] range (higher is better)
 * Assumes speeds in milliseconds
 */
function normalizeSpeed(speed_ms: number, maxSpeed: number): number {
  if (maxSpeed === 0) return 1.0;
  // Inverse normalization: 1 - (speed / max) gives higher scores for faster
  return Math.max(0, 1 - speed_ms / maxSpeed);
}

/**
 * Load feedback for multiple algorithms and rank by specified metric
 *
 * @param algorithms - List of algorithm names to compare
 * @param metric - Ranking metric ('fitness', 'precision', 'speed', 'composite')
 * @returns Ranked algorithms sorted by score (descending)
 */
export async function rankAlgorithms(
  algorithms: string[],
  metric: RankingMetric = 'composite'
): Promise<RankedAlgorithm[]> {
  const results: RankedAlgorithm[] = [];

  // Collect stats for all algorithms
  const statsMap = new Map<string, Awaited<ReturnType<typeof getAlgorithmStats>>>();
  const feedbackMap = new Map<string, FeedbackRecord[]>();

  for (const algo of algorithms) {
    const stats = await getAlgorithmStats(algo);
    const feedback = await loadAlgorithmFeedback(algo);

    statsMap.set(algo, stats);
    feedbackMap.set(algo, feedback);
  }

  // Determine max speed for normalization
  let maxSpeed = 0;
  for (const feedback of feedbackMap.values()) {
    for (const record of feedback) {
      maxSpeed = Math.max(maxSpeed, record.execution_time_ms);
    }
  }

  // Compute scores for each algorithm
  for (const algo of algorithms) {
    const stats = statsMap.get(algo)!;
    const feedback = feedbackMap.get(algo)!;

    if (stats.count === 0) {
      // No feedback yet
      results.push({
        algorithm: algo,
        rank: 0,
        score: 0,
        fitness: null,
        precision: null,
        speed_ms: null,
        sample_count: 0,
      });
      continue;
    }

    const avgSpeed =
      feedback.reduce((sum, r) => sum + r.execution_time_ms, 0) / feedback.length;
    const speedScore = normalizeSpeed(avgSpeed, maxSpeed);

    let score = 0;

    switch (metric) {
      case 'fitness':
        score = stats.meanFitness;
        break;
      case 'precision':
        score = stats.meanPrecision ?? 0;
        break;
      case 'speed':
        score = speedScore;
        break;
      case 'composite':
      default:
        score = computeCompositeScore(stats.meanFitness, stats.meanPrecision, speedScore);
        break;
    }

    results.push({
      algorithm: algo,
      rank: 0,
      score,
      fitness: stats.meanFitness,
      precision: stats.meanPrecision,
      speed_ms: avgSpeed,
      sample_count: stats.count,
    });
  }

  // Sort by score (descending) and assign ranks
  results.sort((a, b) => b.score - a.score);
  results.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return results;
}

/**
 * Rank algorithms by performance for a specific log
 *
 * @param logHash - Hash of the log to query
 * @param metric - Ranking metric (default: 'composite')
 * @returns Ranked algorithms
 *
 * Note: Current implementation ranks across all logs with feedback.
 * Full log-specific ranking requires storing log hashes in feedback records
 * (future enhancement).
 */
export async function rankAlgorithmsByPerformance(
  _logHash: string,
  metric: RankingMetric = 'composite'
): Promise<RankedAlgorithm[]> {
  // Rank globally available algorithms; _logHash is accepted for API compatibility
  // but per-log partitioning is not yet implemented.
  const algorithms = ['dfg', 'heuristic_miner', 'inductive_miner', 'alpha_plus_plus'];

  return rankAlgorithms(algorithms, metric);
}

/**
 * Get detailed comparison of algorithms for a log
 *
 * @param logHash - Hash of the log
 * @param metric - Ranking metric
 * @returns Comparison table with all metrics
 */
export async function getAlgorithmComparison(
  logHash: string,
  metric: RankingMetric = 'composite'
): Promise<AlgorithmComparison> {
  const ranked = await rankAlgorithmsByPerformance(logHash, metric);

  return {
    logHash,
    metric,
    timestamp: new Date().toISOString(),
    algorithms: ranked,
  };
}

/**
 * Recommend the best algorithm for a log
 *
 * @param logHash - Hash of the log
 * @param metric - Scoring method (default: 'composite')
 * @returns Recommendation with top 3 alternatives
 */
export async function recommendBestAlgorithm(
  logHash: string,
  metric: RankingMetric = 'composite'
): Promise<AlgorithmRecommendation> {
  const ranked = await rankAlgorithmsByPerformance(logHash, metric);

  if (ranked.length === 0) {
    return {
      recommended: 'dfg',
      reason: 'No performance data available; defaulting to DFG (fastest)',
      alternativeTop3: [],
      scoringMethod: metric,
    };
  }

  const best = ranked[0];
  const top3 = ranked.slice(1, 4).map((r) => r.algorithm);

  const reason = `${best.algorithm} scores ${best.score.toFixed(3)} on ${metric} metric (${best.sample_count} samples)`;

  return {
    recommended: best.algorithm,
    reason,
    alternativeTop3: top3,
    scoringMethod: metric,
  };
}

/**
 * Format algorithm comparison for human-readable display
 */
export function formatAlgorithmComparison(comparison: AlgorithmComparison): string {
  const lines: string[] = [];

  lines.push(`Algorithm Ranking — ${comparison.metric} metric`);
  lines.push(`Log: ${comparison.logHash}`);
  lines.push(`Generated: ${comparison.timestamp}`);
  lines.push('');

  // Header
  lines.push('Rank | Algorithm           | Score | Fitness | Precision | Speed (ms) | Samples');
  lines.push('-'.repeat(85));

  // Rows
  for (const algo of comparison.algorithms) {
    const fitnessStr = algo.fitness !== null ? algo.fitness.toFixed(3) : '-';
    const precisionStr = algo.precision !== null ? algo.precision.toFixed(3) : '-';
    const speedStr = algo.speed_ms !== null ? algo.speed_ms.toFixed(1) : '-';

    const row = `${algo.rank.toString().padStart(4)} | ${algo.algorithm.padEnd(19)} | ${algo.score.toFixed(3).padStart(5)} | ${fitnessStr.padStart(7)} | ${precisionStr.padStart(9)} | ${speedStr.padStart(10)} | ${algo.sample_count}`;

    lines.push(row);
  }

  return lines.join('\n');
}
