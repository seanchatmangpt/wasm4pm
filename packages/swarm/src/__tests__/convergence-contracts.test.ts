/**
 * Convergence domain-contract tests (Rank-2)
 *
 * These tests verify design-decided properties of the convergence API.
 * They are not derived from the implementation being tested (no FM-5).
 * Each assertion is justified by a named domain contract.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { checkConvergence, checkSwarmConvergence } from '../convergence.js';
import type { WorkerResult } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(workerId: string, value: unknown, hash: string): WorkerResult {
  return {
    workerId,
    algorithmId: 'dfg',
    resultHash: hash,
    result: value,
    runAt: new Date().toISOString(),
    durationMs: 10,
  };
}

function makeResultWithAlgo(
  workerId: string,
  algorithmId: string,
  hash: string
): WorkerResult {
  return {
    workerId,
    algorithmId,
    resultHash: hash,
    result: {},
    runAt: new Date().toISOString(),
    durationMs: 10,
  };
}

// ---------------------------------------------------------------------------
// Contract 1: Unanimous agreement → converged
// Three workers at the same hash value must converge (threshold = 1.0 default).
// ---------------------------------------------------------------------------
describe('Contract 1: unanimous agreement → converged', () => {
  it('3 workers with identical hashes converge at default threshold', () => {
    const results = [
      makeResult('w1', { edges: 5 }, 'same_hash'),
      makeResult('w2', { edges: 5 }, 'same_hash'),
      makeResult('w3', { edges: 5 }, 'same_hash'),
    ];
    const report = checkConvergence(results, 'dfg');
    expect(report.converged).toBe(true);
    expect(report.consensusRatio).toBe(1.0);
    expect(report.dissentingWorkers).toHaveLength(0);
  });

  it('convergenceReason mentions unanimous when all workers agree', () => {
    const results = [
      makeResult('w1', {}, 'h1'),
      makeResult('w2', {}, 'h1'),
      makeResult('w3', {}, 'h1'),
    ];
    const report = checkConvergence(results, 'dfg');
    expect(report.convergenceReason).toMatch(/unanimous/);
    expect(report.convergenceReason).toMatch(/3\/3/);
  });
});

// ---------------------------------------------------------------------------
// Contract 2: Workers spread beyond threshold → not converged
// When worker hashes are all distinct the consensus ratio = 1/N which is
// below the default threshold of 1.0 for N > 1.
// ---------------------------------------------------------------------------
describe('Contract 2: spread workers → not converged', () => {
  it('3 workers with 3 distinct hashes do not converge at threshold 1.0', () => {
    const results = [
      makeResult('w1', { edges: 10 }, 'hash_a'),
      makeResult('w2', { edges: 11 }, 'hash_b'),
      makeResult('w3', { edges: 12 }, 'hash_c'),
    ];
    const report = checkConvergence(results, 'dfg');
    expect(report.converged).toBe(false);
    // consensusRatio = 1/3 ≈ 0.333 — below default threshold 1.0
    expect(report.consensusRatio).toBeCloseTo(1 / 3, 5);
  });

  it('2-of-4 workers agreeing does not satisfy unanimous threshold', () => {
    const results = [
      makeResult('w1', {}, 'hash_x'),
      makeResult('w2', {}, 'hash_x'),
      makeResult('w3', {}, 'hash_y'),
      makeResult('w4', {}, 'hash_z'),
    ];
    const report = checkConvergence(results, 'dfg');
    expect(report.converged).toBe(false);
    expect(report.consensusRatio).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Contract 3: isConverged consistency — converged ↔ consensusRatio ≥ threshold
// The `converged` boolean must be logically consistent with the numeric ratio.
// ---------------------------------------------------------------------------
describe('Contract 3: converged flag is consistent with consensusRatio', () => {
  const scenarios: Array<{ label: string; hashes: string[]; threshold: number }> = [
    { label: '3 identical (threshold 1.0)', hashes: ['a', 'a', 'a'], threshold: 1.0 },
    { label: '2 identical 1 different (threshold 0.66)', hashes: ['a', 'a', 'b'], threshold: 0.66 },
    { label: '2 identical 1 different (threshold 0.75)', hashes: ['a', 'a', 'b'], threshold: 0.75 },
    { label: '3 distinct (threshold 0.4)', hashes: ['a', 'b', 'c'], threshold: 0.4 },
    { label: '1 worker (any threshold)', hashes: ['solo'], threshold: 1.0 },
  ];

  for (const { label, hashes, threshold } of scenarios) {
    it(`[${label}] converged === (consensusRatio >= threshold)`, () => {
      const results = hashes.map((h, i) => makeResult(`w${i}`, {}, h));
      const report = checkConvergence(results, 'dfg', threshold);
      // Domain contract: converged must exactly match the numeric predicate
      expect(report.converged).toBe(report.consensusRatio >= threshold);
    });
  }
});

// ---------------------------------------------------------------------------
// Contract 4: After convergence — adding a worker with the dominant hash keeps
// the system converged (at the same threshold).
// This tests the addWorkerResult-after-convergence scenario via a fresh call
// with the extended result set.
// ---------------------------------------------------------------------------
describe('Contract 4: adding agreeing worker after convergence stays converged', () => {
  it('4 identical workers remain converged when a 5th agreeing worker joins', () => {
    const baseResults: WorkerResult[] = [
      makeResult('w1', {}, 'dominant'),
      makeResult('w2', {}, 'dominant'),
      makeResult('w3', {}, 'dominant'),
      makeResult('w4', {}, 'dominant'),
    ];
    const reportBefore = checkConvergence(baseResults, 'dfg');
    expect(reportBefore.converged).toBe(true);

    const extendedResults = [...baseResults, makeResult('w5', {}, 'dominant')];
    const reportAfter = checkConvergence(extendedResults, 'dfg');
    expect(reportAfter.converged).toBe(true);
    expect(reportAfter.consensusRatio).toBe(1.0);
  });

  it('adding a dissenting worker after convergence may break unanimous convergence', () => {
    const baseResults: WorkerResult[] = [
      makeResult('w1', {}, 'dominant'),
      makeResult('w2', {}, 'dominant'),
    ];
    const reportBefore = checkConvergence(baseResults, 'dfg');
    expect(reportBefore.converged).toBe(true);

    const extendedResults = [...baseResults, makeResult('w3', {}, 'different')];
    // 2/3 = 0.667 — does not meet unanimous (1.0) threshold
    const reportAfter = checkConvergence(extendedResults, 'dfg');
    expect(reportAfter.converged).toBe(false);
    expect(reportAfter.dissentingWorkers).toContain('w3');
  });
});

// ---------------------------------------------------------------------------
// Contract 5: Temporal stability — 3 cycles of identical results → converged
// checkSwarmConvergence with convergenceRuns=3 must require 3 identical runs.
// ---------------------------------------------------------------------------
describe('Contract 5: temporal stability — 3 identical rounds → converged', () => {
  it('swarm with 2 workers converges after exactly 3 identical rounds', () => {
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [
      makeResultWithAlgo('w1', 'dfg', 'stable_hash'),
      makeResultWithAlgo('w2', 'dfg', 'stable_hash'),
    ];

    // Round 1 — not yet stable (need 3)
    const r1 = checkSwarmConvergence(results, history, 3);
    expect(r1.converged).toBe(false);

    // Round 2 — still not stable (need 3)
    const r2 = checkSwarmConvergence(results, history, 3);
    expect(r2.converged).toBe(false);

    // Round 3 — all 3 identical → converged
    const r3 = checkSwarmConvergence(results, history, 3);
    expect(r3.converged).toBe(true);
    expect(r3.convergenceReason).toMatch(/3 consecutive rounds/);
  });

  it('a hash change mid-sequence resets convergence', () => {
    const history = new Map<string, string[]>();
    const stable: WorkerResult[] = [makeResultWithAlgo('w1', 'dfg', 'hash_v1')];
    const changed: WorkerResult[] = [makeResultWithAlgo('w1', 'dfg', 'hash_v2')];

    // 2 stable rounds
    checkSwarmConvergence(stable, history, 3);
    checkSwarmConvergence(stable, history, 3);
    // hash changes — ring buffer now has [v1, v1, v2] — not uniform
    const r = checkSwarmConvergence(changed, history, 3);
    expect(r.converged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract 6: Empty inputs have well-defined, non-crashing behaviour
// ---------------------------------------------------------------------------
describe('Contract 6: empty inputs are handled gracefully', () => {
  it('checkConvergence with no results returns converged=false', () => {
    const report = checkConvergence([], 'dfg');
    expect(report.converged).toBe(false);
    expect(report.totalChecked).toBe(0);
    expect(report.consensusRatio).toBe(0);
  });

  it('checkSwarmConvergence with no results returns converged=false', () => {
    const history = new Map<string, string[]>();
    const result = checkSwarmConvergence([], history, 2);
    expect(result.converged).toBe(false);
    expect(result.stableWorkers).toHaveLength(0);
    expect(result.unstableWorkers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Contract 7: agreementRate is consistent with stableWorkers / total
// ---------------------------------------------------------------------------
describe('Contract 7: agreementRate consistency', () => {
  it('agreementRate equals stableWorkers.length / total workers', () => {
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [
      makeResultWithAlgo('w1', 'dfg', 'h1'),
      makeResultWithAlgo('w2', 'dfg', 'h2'),
      makeResultWithAlgo('w3', 'dfg', 'h3'),
    ];
    // First call — nothing stable yet (history is empty)
    const r = checkSwarmConvergence(results, history, 2);
    const expected = r.stableWorkers.length / (r.stableWorkers.length + r.unstableWorkers.length);
    expect(r.agreementRate).toBeCloseTo(expected, 5);
  });
});
