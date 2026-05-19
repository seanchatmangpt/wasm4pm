/**
 * coordination-harness.test.ts
 *
 * Tests for SwarmCoordinationHarness — multi-worker consensus, divergence,
 * convergence timing, and failure isolation.
 */

import { describe, it, expect } from 'vitest';
import {
  SwarmCoordinationHarness,
  createSwarmCoordinationHarness,
} from '../testing-harness.js';
import type { WorkerResult } from '../types.js';

/**
 * Test 1: Consensus Achievement
 *
 * Verifies that when all workers produce identical hashes, consensus is confirmed.
 * Rank-1 oracle: consensus is a mathematical invariant—all identical inputs must
 * converge on the same output.
 */
describe('SwarmCoordinationHarness', () => {
  it('should verify agent consensus when all workers agree', () => {
    const harness = createSwarmCoordinationHarness();

    // Create mock worker results with identical hashes (consensus)
    const consensusHash = '4d967a2a6991c4e8d6f8f5e6e5e9f6e7e5e6e7e8e9f6e7e8e9f6e7e8e9f6e7';
    const agents: WorkerResult[] = [
      {
        workerId: 'worker-1',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: { edges: [['A', 'B']], nodes: ['A', 'B'] },
        runAt: new Date().toISOString(),
        durationMs: 100,
        resultType: 'discovery',
      },
      {
        workerId: 'worker-2',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: { edges: [['A', 'B']], nodes: ['A', 'B'] },
        runAt: new Date().toISOString(),
        durationMs: 105,
        resultType: 'discovery',
      },
      {
        workerId: 'worker-3',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: { edges: [['A', 'B']], nodes: ['A', 'B'] },
        runAt: new Date().toISOString(),
        durationMs: 102,
        resultType: 'discovery',
      },
    ];

    const result = harness.verifyAgentConsensus(agents);

    expect(result.achieved).toBe(true);
    expect(result.algorithm).toBe('dfg');
    expect(result.consensusRatio).toBe(1.0);
    expect(result.totalWorkers).toBe(3);
    expect(result.dissentingWorkerIds).toHaveLength(0);
    expect(result.dominantHash).toBe(consensusHash);
    expect(result.details).toContain('Consensus verified');
  });

  it('should detect divergence when workers disagree', () => {
    const harness = createSwarmCoordinationHarness();

    // Create mock worker results with different hashes (divergence)
    const agents: WorkerResult[] = [
      {
        workerId: 'worker-1',
        algorithmId: 'dfg',
        resultHash: 'hash1111111111111111111111111111111111111111111111111111111111111111',
        result: { edges: [['A', 'B']] },
        runAt: new Date().toISOString(),
        durationMs: 100,
        resultType: 'discovery',
      },
      {
        workerId: 'worker-2',
        algorithmId: 'dfg',
        resultHash: 'hash1111111111111111111111111111111111111111111111111111111111111111',
        result: { edges: [['A', 'B']] },
        runAt: new Date().toISOString(),
        durationMs: 105,
        resultType: 'discovery',
      },
      {
        workerId: 'worker-3',
        algorithmId: 'dfg',
        resultHash: 'hash2222222222222222222222222222222222222222222222222222222222222222',
        result: { edges: [['A', 'C']] }, // Different result
        runAt: new Date().toISOString(),
        durationMs: 102,
        resultType: 'discovery',
      },
    ];

    const result = harness.verifyAgentConsensus(agents, undefined, 1.0);

    expect(result.achieved).toBe(false);
    expect(result.consensusRatio).toBeLessThan(1.0);
    expect(result.dissentingWorkerIds).toContain('worker-3');
    expect(result.details).toContain('Consensus failed');
  });

  /**
   * Test 2: Divergence Tracking
   *
   * Verifies that the harness can track opinion divergence over multiple rounds.
   * A healthy convergence should show divergence trending toward 0%.
   */
  it('should track divergence across multiple rounds', () => {
    const harness = createSwarmCoordinationHarness();

    // Simulate 3 rounds: divergence starts high, then decreases (convergence)
    const hash1 = 'hash1111111111111111111111111111111111111111111111111111111111111111';
    const hash2 = 'hash2222222222222222222222222222222222222222222222222222222222222222';

    // Round 0: 2 agree on hash1, 1 on hash2 (33% divergence)
    const round0: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: hash2,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
    ];

    // Round 1: all 3 agree on hash1 (0% divergence)
    const round1: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
    ];

    const report = harness.trackDivergence([round0, round1], 'dfg');

    expect(report.totalRounds).toBe(2);
    expect(report.avgDivergenceRatio).toBeGreaterThan(0);
    expect(report.minDivergenceRatio).toBe(0); // Round 1 converged
    expect(report.maxDivergenceRatio).toBeCloseTo(0.333, 2); // Round 0: 1/3 dissent
    expect(report.roundDetails).toHaveLength(2);
    expect(report.roundDetails[0].divergenceRatio).toBeCloseTo(0.333, 2);
    expect(report.roundDetails[1].divergenceRatio).toBe(0);
    expect(report.details).toContain('converged');
  });

  /**
   * Test 3: Convergence Timing
   *
   * Verifies that the harness can measure how many rounds are needed for consensus.
   * Healthy convergence should reach unanimous consensus within 3-5 rounds.
   */
  it('should measure convergence time (rounds to consensus)', () => {
    const harness = createSwarmCoordinationHarness();

    const hash1 = 'hash1111111111111111111111111111111111111111111111111111111111111111';
    const hash2 = 'hash2222222222222222222222222222222222222222222222222222222222222222';

    // Round 0: partial divergence
    const round0: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'alpha_plus_plus',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 200,
      },
      {
        workerId: 'w2',
        algorithmId: 'alpha_plus_plus',
        resultHash: hash2,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 210,
      },
    ];

    // Round 1: convergence achieved
    const round1: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'alpha_plus_plus',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 150,
      },
      {
        workerId: 'w2',
        algorithmId: 'alpha_plus_plus',
        resultHash: hash1,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 155,
      },
    ];

    const timing = harness.measureConvergenceTime(
      [round0, round1],
      'alpha_plus_plus',
      1.0
    );

    expect(timing.converged).toBe(true);
    expect(timing.roundsToConvergence).toBe(2); // 0-indexed: round 1 is the 2nd round
    expect(timing.totalDurationMs).toBeGreaterThan(0);
    expect(timing.avgRoundDurationMs).toBeGreaterThan(0);
    expect(timing.dominantHash).toBe(hash1);
    expect(timing.details).toContain('Convergence in');
  });

  /**
   * Test 4: Failure Isolation
   *
   * Verifies that when one worker fails, the swarm continues with healthy workers
   * and re-converges (resilience property).
   */
  it('should detect failure isolation and recovery', () => {
    const harness = createSwarmCoordinationHarness();

    const consensusHash =
      'hash1111111111111111111111111111111111111111111111111111111111111111';

    // Pre-failure: all 3 workers agree
    const preFailure: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
    ];

    // Post-failure: w1 failed, w2 and w3 still agree
    const postFailure: WorkerResult[] = [
      {
        workerId: 'w1',
        algorithmId: 'dfg',
        resultHash: '',
        result: null,
        runAt: new Date().toISOString(),
        durationMs: 0,
        failed: true, // Marked as failed
      },
      {
        workerId: 'w2',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
      {
        workerId: 'w3',
        algorithmId: 'dfg',
        resultHash: consensusHash,
        result: {},
        runAt: new Date().toISOString(),
        durationMs: 100,
      },
    ];

    const isolation = harness.testFailureIsolation(
      preFailure,
      postFailure,
      'dfg',
      3
    );

    expect(isolation.swarmRecovered).toBe(true);
    expect(isolation.failedWorkerId).toBe('w1');
    expect(isolation.healthyWorkerCount).toBe(2);
    expect(isolation.preFailureConsensusRatio).toBe(1.0); // 3/3 before
    expect(isolation.postFailureConsensusRatio).toBe(1.0); // 2/2 after (healthy workers agree)
    expect(isolation.details).toContain('Failure isolation verified');
  });
});
