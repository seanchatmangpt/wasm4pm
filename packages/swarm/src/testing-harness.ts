/**
 * Swarm coordination test harness.
 *
 * Verifies multi-worker consensus, divergence detection, convergence speed,
 * and failure isolation in autonomous agent swarms.
 *
 * Rank-1 oracle: Agent consensus is a mathematical invariant—all agents must
 * converge on the same decision for a given input. Divergence is a defect.
 */

import type { WorkerResult, SwarmConvergenceReport } from './types.js';
import { hashOutput, checkConvergence, checkMlConvergence } from './convergence.js';

/**
 * Result of a consensus verification check.
 */
export interface ConsensusVerificationResult {
  achieved: boolean;
  algorithm: string;
  consensusRatio: number;
  dissentingWorkerIds: string[];
  dominantHash: string | null;
  totalWorkers: number;
  details: string;
}

/**
 * Divergence tracking over multiple rounds.
 */
export interface DivergenceReport {
  totalRounds: number;
  avgDivergenceRatio: number;
  maxDivergenceRatio: number;
  minDivergenceRatio: number;
  roundDetails: Array<{
    round: number;
    divergenceRatio: number;
    dissentingCount: number;
    totalWorkers: number;
  }>;
  details: string;
}

/**
 * Convergence timing measurement.
 */
export interface ConvergenceTimingResult {
  converged: boolean;
  roundsToConvergence: number;
  totalDurationMs: number;
  avgRoundDurationMs: number;
  dominantHash: string | null;
  convergenceThreshold: number;
  details: string;
}

/**
 * Failure isolation and recovery measurement.
 */
export interface FailureIsolationResult {
  swarmRecovered: boolean;
  failedWorkerId: string;
  healthyWorkerCount: number;
  preFailureConsensusRatio: number;
  postFailureConsensusRatio: number;
  recoveryRounds: number;
  details: string;
}

/**
 * SwarmCoordinationHarness — Test harness for multi-worker consensus and convergence.
 */
export class SwarmCoordinationHarness {
  /**
   * Verify that all agents converge on the same decision.
   *
   * Rank-1 oracle: Given identical input, all agents MUST produce the same output hash
   * (or agree within epsilon tolerance for ML algorithms). Consensus failure is a defect.
   *
   * @param agents - WorkerResult[] from a single swarm episode
   * @param expectedDecision - Expected dominant hash (if known; optional for discovery)
   * @param threshold - Consensus threshold (default 1.0 for unanimous consensus)
   * @returns ConsensusVerificationResult
   */
  verifyAgentConsensus(
    agents: WorkerResult[],
    expectedDecision?: string,
    threshold: number = 1.0
  ): ConsensusVerificationResult {
    if (!agents || agents.length === 0) {
      return {
        achieved: false,
        algorithm: 'unknown',
        consensusRatio: 0,
        dissentingWorkerIds: [],
        dominantHash: null,
        totalWorkers: 0,
        details: 'No agents provided for consensus verification',
      };
    }

    // Determine algorithm from first result
    const algorithm = agents[0].algorithmId || 'unknown';

    // Determine if this is an ML algorithm (requires epsilon-tolerance)
    const isMl = algorithm.startsWith('ml_');

    // Check convergence using appropriate method
    let report: SwarmConvergenceReport;
    if (isMl) {
      report = checkMlConvergence(agents, algorithm, 0.01, threshold);
    } else {
      report = checkConvergence(agents, algorithm, threshold);
    }

    const achieved = report.converged;
    const didMatchExpected =
      !expectedDecision || report.dominantHash === expectedDecision;

    const details = achieved
      ? `Consensus verified: ${agents.length} workers, all agree on hash ${report.dominantHash?.slice(0, 8) || 'null'}${
          didMatchExpected ? '' : ' (⚠️ differs from expected)'
        }`
      : `Consensus failed: ${report.dissentingWorkers.length}/${agents.length} workers disagree. Dominant: ${report.dominantHash?.slice(0, 8) || 'null'}, Dissenters: [${report.dissentingWorkers.join(', ')}]`;

    return {
      achieved: achieved && didMatchExpected,
      algorithm,
      consensusRatio: report.consensusRatio,
      dissentingWorkerIds: report.dissentingWorkers,
      dominantHash: report.dominantHash,
      totalWorkers: agents.length,
      details,
    };
  }

  /**
   * Track opinion divergence over N rounds.
   *
   * Divergence is the fraction of workers that disagree with the dominant hash in each round.
   * Healthy convergence trends toward divergence→0. Sustained divergence >0.2 indicates
   * a learning or consensus failure.
   *
   * @param roundResults - Array of WorkerResult[] from successive episodes
   * @param algorithm - Algorithm ID to track (default: first result's algorithmId)
   * @returns DivergenceReport
   */
  trackDivergence(
    roundResults: WorkerResult[][],
    algorithm?: string
  ): DivergenceReport {
    if (!roundResults || roundResults.length === 0) {
      return {
        totalRounds: 0,
        avgDivergenceRatio: 0,
        maxDivergenceRatio: 0,
        minDivergenceRatio: 0,
        roundDetails: [],
        details: 'No rounds provided for divergence tracking',
      };
    }

    const algoId = algorithm || roundResults[0]?.[0]?.algorithmId || 'unknown';
    const roundDetails: DivergenceReport['roundDetails'] = [];
    const divergenceRatios: number[] = [];

    for (let round = 0; round < roundResults.length; round++) {
      const results = roundResults[round];
      if (!results || results.length === 0) continue;

      const report = checkConvergence(results, algoId, 1.0);
      const divergenceRatio = 1 - report.consensusRatio;
      divergenceRatios.push(divergenceRatio);

      roundDetails.push({
        round,
        divergenceRatio,
        dissentingCount: report.dissentingWorkers.length,
        totalWorkers: results.length,
      });
    }

    const avgDivergenceRatio =
      divergenceRatios.length > 0
        ? divergenceRatios.reduce((a, b) => a + b, 0) / divergenceRatios.length
        : 0;

    const maxDivergenceRatio =
      divergenceRatios.length > 0 ? Math.max(...divergenceRatios) : 0;

    const minDivergenceRatio =
      divergenceRatios.length > 0 ? Math.min(...divergenceRatios) : 0;

    const converging = minDivergenceRatio === 0;
    const details = converging
      ? `Divergence tracked: ${roundResults.length} rounds, converged by round ${roundDetails.findIndex((r) => r.divergenceRatio === 0)}`
      : `Divergence trend: avg=${(avgDivergenceRatio * 100).toFixed(1)}%, max=${(maxDivergenceRatio * 100).toFixed(1)}%, min=${(minDivergenceRatio * 100).toFixed(1)}%`;

    return {
      totalRounds: roundResults.length,
      avgDivergenceRatio,
      maxDivergenceRatio,
      minDivergenceRatio,
      roundDetails,
      details,
    };
  }

  /**
   * Measure convergence speed: how many rounds until consensus is achieved?
   *
   * Healthy convergence reaches unanimous consensus (threshold=1.0) within 3-5 rounds
   * for well-designed agents. Slower convergence (<80% consensus after N rounds) is a signal
   * of poor reward structure, slow learning, or inadequate exploration.
   *
   * @param roundResults - Array of WorkerResult[] from successive episodes
   * @param algorithm - Algorithm ID to track
   * @param threshold - Consensus threshold (default 1.0 for unanimous)
   * @returns ConvergenceTimingResult
   */
  measureConvergenceTime(
    roundResults: WorkerResult[][],
    algorithm: string,
    threshold: number = 1.0
  ): ConvergenceTimingResult {
    if (!roundResults || roundResults.length === 0) {
      return {
        converged: false,
        roundsToConvergence: 0,
        totalDurationMs: 0,
        avgRoundDurationMs: 0,
        dominantHash: null,
        convergenceThreshold: threshold,
        details: 'No rounds provided for timing measurement',
      };
    }

    let convergenceRound = -1;
    let dominantHash: string | null = null;
    let totalDurationMs = 0;

    for (let round = 0; round < roundResults.length; round++) {
      const results = roundResults[round];
      if (!results || results.length === 0) continue;

      const report = checkConvergence(results, algorithm, threshold);

      // Sum durations from all workers in this round
      totalDurationMs += results.reduce((sum, r) => sum + r.durationMs, 0);

      if (report.converged) {
        convergenceRound = round;
        dominantHash = report.dominantHash;
        break;
      }
    }

    const converged = convergenceRound >= 0;
    const roundsToConvergence = converged ? convergenceRound + 1 : roundResults.length;
    const avgRoundDurationMs =
      roundResults.length > 0 ? totalDurationMs / roundResults.length : 0;

    const details = converged
      ? `Convergence in ${roundsToConvergence} round(s), ${totalDurationMs}ms total, avg ${avgRoundDurationMs.toFixed(0)}ms/round`
      : `No convergence after ${roundResults.length} rounds, avg ${avgRoundDurationMs.toFixed(0)}ms/round`;

    return {
      converged,
      roundsToConvergence,
      totalDurationMs,
      avgRoundDurationMs,
      dominantHash,
      convergenceThreshold: threshold,
      details,
    };
  }

  /**
   * Test failure isolation: when one agent fails, does the swarm continue and recover?
   *
   * Failure isolation is a resilience property: the swarm must not abort when a single
   * worker fails. The remaining healthy workers should continue and eventually re-converge.
   *
   * @param preFailureResults - WorkerResult[] before failure injection
   * @param postFailureResults - WorkerResult[] after failure (with one result marked failed:true)
   * @param algorithm - Algorithm ID
   * @param expectedRecoveryRounds - Expected number of rounds to recover (default 3)
   * @returns FailureIsolationResult
   */
  testFailureIsolation(
    preFailureResults: WorkerResult[],
    postFailureResults: WorkerResult[],
    algorithm: string,
    expectedRecoveryRounds: number = 3
  ): FailureIsolationResult {
    if (!preFailureResults || preFailureResults.length === 0) {
      return {
        swarmRecovered: false,
        failedWorkerId: 'unknown',
        healthyWorkerCount: 0,
        preFailureConsensusRatio: 0,
        postFailureConsensusRatio: 0,
        recoveryRounds: expectedRecoveryRounds,
        details: 'No pre-failure results provided',
      };
    }

    // Measure pre-failure consensus
    const preReport = checkConvergence(preFailureResults, algorithm, 1.0);
    const preFailureConsensusRatio = preReport.consensusRatio;

    // Identify failed worker
    const failedWorker = postFailureResults.find((r) => r.failed);
    const failedWorkerId = failedWorker?.workerId || 'unknown';

    // Count healthy workers post-failure
    const healthyWorkers = postFailureResults.filter((r) => !r.failed);
    const healthyWorkerCount = healthyWorkers.length;

    // Measure post-failure consensus (only among healthy workers)
    const postReport = checkConvergence(healthyWorkers, algorithm, 1.0);
    const postFailureConsensusRatio = postReport.consensusRatio;

    // Recovery is successful if healthy workers re-converge
    const swarmRecovered = postFailureConsensusRatio >= 0.8;

    const details = swarmRecovered
      ? `Failure isolation verified: ${failedWorkerId} failed, ${healthyWorkerCount} healthy workers re-converged (consensus=${(postFailureConsensusRatio * 100).toFixed(1)}%)`
      : `Failure isolation incomplete: post-failure consensus only ${(postFailureConsensusRatio * 100).toFixed(1)}% (need ≥80%)`;

    return {
      swarmRecovered,
      failedWorkerId,
      healthyWorkerCount,
      preFailureConsensusRatio,
      postFailureConsensusRatio,
      recoveryRounds: expectedRecoveryRounds,
      details,
    };
  }
}

/**
 * Factory function for creating a SwarmCoordinationHarness.
 */
export function createSwarmCoordinationHarness(): SwarmCoordinationHarness {
  return new SwarmCoordinationHarness();
}
