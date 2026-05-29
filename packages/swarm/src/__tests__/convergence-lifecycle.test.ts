/**
 * convergence-lifecycle.test.ts
 *
 * Covers gaps NOT addressed by convergence.test.ts or convergence-contracts.test.ts:
 *
 * Rank-1 (mathematical invariants):
 *   - consensusRatio is always in [0, 1]
 *   - Single worker always gives consensusRatio = 1.0
 *   - All-different workers give consensusRatio = 1/N exactly
 *   - dominantHash is null for empty input, non-null when results exist
 *   - hashOutput key-ordering invariant (same data, different key order → same hash)
 *   - checkMlConvergence numeric-equivalence properties
 *
 * Rank-2 (domain contracts):
 *   - Failed workers (failed:true) are EXCLUDED from checkConvergence (crashed workers must not
 *     contribute a synthetic 'FAILED' hash that could dilute or dominate the consensus)
 *   - checkSwarmConvergence: failed workers are always unstable and never enter the ring buffer
 *   - dissentingWorkers is empty when fully converged (threshold=1.0, all agree)
 *   - dissentingWorkers lists all workers when NOT converged (threshold=1.0)
 *   - workerIds filter in checkConvergence restricts the checked set
 *   - convergenceRuns=1 converges on the very first call
 *   - ConvergenceMaxIterationsError shape (name, message fields)
 *   - ConvergenceTimeoutError shape (name, message fields)
 *
 * Rank-3 (metamorphic):
 *   - Adding an agreeing worker never decreases consensusRatio
 *   - Adding a disagreeing worker never increases consensusRatio
 *   - Determinism: identical inputs → identical consensusRatio on repeated calls
 *   - hashOutput: different key-orderings in source object produce the same hash
 */

import { describe, it, expect } from 'vitest';
import {
  checkConvergence,
  checkSwarmConvergence,
  checkMlConvergence,
  hashOutput,
} from '../convergence.js';
import {
  ConvergenceMaxIterationsError,
  ConvergenceTimeoutError,
} from '../types.js';
import type { WorkerResult } from '../types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeResult(
  workerId: string,
  hash: string,
  algorithmId = 'dfg',
  overrides: Partial<WorkerResult> = {}
): WorkerResult {
  return {
    workerId,
    algorithmId,
    resultHash: hash,
    result: { data: hash },
    runAt: new Date().toISOString(),
    durationMs: 10,
    ...overrides,
  };
}

function makeFailedResult(workerId: string, algorithmId = 'dfg'): WorkerResult {
  return {
    workerId,
    algorithmId,
    resultHash: 'FAILED',
    result: null,
    runAt: new Date().toISOString(),
    durationMs: 0,
    error: 'simulated worker failure',
    failed: true,
  };
}

// ---------------------------------------------------------------------------
// Rank-1: Mathematical invariants for checkConvergence
// ---------------------------------------------------------------------------

describe('Rank-1: consensusRatio is always in [0, 1]', () => {
  it('empty input → consensusRatio = 0', () => {
    const { consensusRatio } = checkConvergence([], 'dfg');
    expect(consensusRatio).toBeGreaterThanOrEqual(0);
    expect(consensusRatio).toBeLessThanOrEqual(1);
    expect(consensusRatio).toBe(0);
  });

  it('single worker → consensusRatio = 1.0', () => {
    const results = [makeResult('w1', 'only_hash')];
    const { consensusRatio } = checkConvergence(results, 'dfg');
    expect(consensusRatio).toBe(1.0);
  });

  it('all-agree (N=5) → consensusRatio = 1.0', () => {
    const results = Array.from({ length: 5 }, (_, i) =>
      makeResult(`w${i}`, 'same_hash')
    );
    const { consensusRatio } = checkConvergence(results, 'dfg');
    expect(consensusRatio).toBe(1.0);
  });

  it('all-different (N=4) → consensusRatio = 1/4', () => {
    const results = [
      makeResult('w1', 'h_a'),
      makeResult('w2', 'h_b'),
      makeResult('w3', 'h_c'),
      makeResult('w4', 'h_d'),
    ];
    const { consensusRatio } = checkConvergence(results, 'dfg');
    expect(consensusRatio).toBeCloseTo(1 / 4, 10);
  });

  it('consensusRatio never exceeds 1.0 regardless of worker count', () => {
    for (const n of [1, 2, 5, 10, 20]) {
      const results = Array.from({ length: n }, (_, i) =>
        makeResult(`w${i}`, 'uniform_hash')
      );
      const { consensusRatio } = checkConvergence(results, 'dfg');
      expect(consensusRatio).toBeGreaterThanOrEqual(0);
      expect(consensusRatio).toBeLessThanOrEqual(1);
    }
  });
});

describe('Rank-1: single worker is always unanimously converged', () => {
  it('single worker → converged=true at default threshold', () => {
    const { converged, consensusRatio, dissentingWorkers } = checkConvergence(
      [makeResult('solo', 'any_hash')],
      'dfg'
    );
    expect(converged).toBe(true);
    expect(consensusRatio).toBe(1.0);
    expect(dissentingWorkers).toHaveLength(0);
  });

  it('single worker → convergenceReason mentions unanimous', () => {
    const { convergenceReason } = checkConvergence(
      [makeResult('solo', 'solo_hash')],
      'dfg'
    );
    expect(convergenceReason).toMatch(/unanimous/);
  });
});

describe('Rank-1: dominantHash nullability contract', () => {
  it('empty input → dominantHash is null', () => {
    const { dominantHash } = checkConvergence([], 'dfg');
    expect(dominantHash).toBeNull();
  });

  it('non-empty input → dominantHash is a non-empty string', () => {
    const results = [makeResult('w1', 'abc123')];
    const { dominantHash } = checkConvergence(results, 'dfg');
    expect(typeof dominantHash).toBe('string');
    expect((dominantHash as string).length).toBeGreaterThan(0);
  });

  it('dominantHash equals the hash held by the majority', () => {
    const results = [
      makeResult('w1', 'majority_hash'),
      makeResult('w2', 'majority_hash'),
      makeResult('w3', 'minority_hash'),
    ];
    const { dominantHash } = checkConvergence(results, 'dfg');
    expect(dominantHash).toBe('majority_hash');
  });
});

describe('Rank-1: hashOutput key-ordering invariant', () => {
  it('same data with different key order produces identical hash', () => {
    const h1 = hashOutput({ a: 1, b: 2, c: 3 });
    const h2 = hashOutput({ c: 3, a: 1, b: 2 });
    const h3 = hashOutput({ b: 2, c: 3, a: 1 });
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('nested objects: inner key order does not affect hash', () => {
    const h1 = hashOutput({ outer: { x: 10, y: 20 }, z: 30 });
    const h2 = hashOutput({ z: 30, outer: { y: 20, x: 10 } });
    expect(h1).toBe(h2);
  });

  it('null input hashes without throwing', () => {
    expect(() => hashOutput(null)).not.toThrow();
  });

  it('array input preserves order (different orders → different hashes)', () => {
    const h1 = hashOutput([1, 2, 3]);
    const h2 = hashOutput([3, 2, 1]);
    expect(h1).not.toBe(h2);
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const h = hashOutput({ anything: true });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Rank-2: Domain contracts for failed workers
// ---------------------------------------------------------------------------

describe('Rank-2: failed workers are excluded from checkConvergence', () => {
  it('a single failed worker produces totalChecked=0 and converged=false (no healthy results)', () => {
    // Failed workers are excluded: no healthy results → no-results path, not consensus.
    const results = [makeFailedResult('w1')];
    const report = checkConvergence(results, 'dfg');
    expect(report.totalChecked).toBe(0);
    expect(report.consensusRatio).toBe(0);
    expect(report.converged).toBe(false);
    expect(report.convergenceReason).toMatch(/no workers produced results/);
  });

  it('failed worker is excluded so healthy workers reach unanimous consensus', () => {
    const results = [
      makeResult('w1', 'good_hash'),
      makeResult('w2', 'good_hash'),
      makeFailedResult('w3'), // must NOT dilute the healthy 2/2 consensus
    ];
    const report = checkConvergence(results, 'dfg');
    // Only w1 and w2 counted → 2/2 = 1.0 unanimous
    expect(report.totalChecked).toBe(2);
    expect(report.consensusRatio).toBe(1.0);
    expect(report.converged).toBe(true);
  });

  it('all workers failed → totalChecked=0, converged=false (no-results path)', () => {
    const results = [makeFailedResult('w1'), makeFailedResult('w2'), makeFailedResult('w3')];
    const report = checkConvergence(results, 'dfg');
    expect(report.totalChecked).toBe(0);
    expect(report.converged).toBe(false);
    expect(report.dominantHash).toBeNull();
  });
});

describe('Rank-2: checkSwarmConvergence with failed workers stays unstable', () => {
  it('failed worker in any round is always unstable (never enters ring buffer)', () => {
    const history = new Map<string, string[]>();
    const goodRound: WorkerResult[] = [makeResult('w1', 'stable_hash')];
    const failedRound: WorkerResult[] = [makeFailedResult('w1')];

    // Round 1: good — enters ring buffer
    checkSwarmConvergence(goodRound, history, 2);
    // Round 2: failed — must be unstable regardless of prior history
    const r = checkSwarmConvergence(failedRound, history, 2);
    expect(r.converged).toBe(false);
    expect(r.unstableWorkers).toContain('w1/dfg');
  });

  it('failed worker never converges even when it consistently fails (FAILED hash not buffered)', () => {
    // A persistently-failing worker must NOT declare convergence via repeated
    // 'FAILED' sentinel hashes — that would stop the swarm despite zero healthy output.
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [
      makeResult('w1', 'good_hash'),
      makeFailedResult('w2'), // always failed
    ];

    // Prime the ring buffer for w1; w2 is always excluded
    checkSwarmConvergence(results, history, 2);
    const r = checkSwarmConvergence(results, history, 2);

    // w2 is always unstable because it is always excluded from the ring buffer
    expect(r.converged).toBe(false);
    expect(r.stableWorkers).toContain('w1/dfg');
    expect(r.unstableWorkers).toContain('w2/dfg');
  });
});

describe('Rank-2: dissentingWorkers list contracts', () => {
  it('fully converged result has empty dissentingWorkers', () => {
    const results = [
      makeResult('w1', 'same'),
      makeResult('w2', 'same'),
      makeResult('w3', 'same'),
    ];
    const { dissentingWorkers } = checkConvergence(results, 'dfg');
    expect(dissentingWorkers).toHaveLength(0);
  });

  it('not-converged result lists all workers in dissentingWorkers', () => {
    // With threshold=1.0 and 2 different hashes, nobody converges
    const results = [
      makeResult('w1', 'hash_a'),
      makeResult('w2', 'hash_b'),
    ];
    const { dissentingWorkers, converged } = checkConvergence(results, 'dfg');
    expect(converged).toBe(false);
    // All workers are reported as dissenting when threshold is not met
    expect(dissentingWorkers).toHaveLength(results.length);
    expect(dissentingWorkers).toContain('w1');
    expect(dissentingWorkers).toContain('w2');
  });

  it('partial convergence (threshold=0.5 met): only minority is dissenting', () => {
    const results = [
      makeResult('w1', 'dominant'),
      makeResult('w2', 'dominant'),
      makeResult('w3', 'dominant'),
      makeResult('w4', 'minority'),
    ];
    const { converged, dissentingWorkers } = checkConvergence(results, 'dfg', 0.5);
    expect(converged).toBe(true); // 3/4 = 0.75 >= 0.5
    expect(dissentingWorkers).toEqual(['w4']);
  });
});

describe('Rank-2: workerIds filter restricts the checked set', () => {
  it('filtering to a subset changes totalChecked', () => {
    const results = [
      makeResult('alpha', 'h1'),
      makeResult('beta', 'h2'),
      makeResult('gamma', 'h1'),
    ];
    const full = checkConvergence(results, 'dfg');
    const filtered = checkConvergence(results, 'dfg', 1.0, ['alpha', 'gamma']);

    expect(full.totalChecked).toBe(3);
    expect(filtered.totalChecked).toBe(2);
  });

  it('filtering to 2 agreeing workers → converged even if overall not converged', () => {
    const results = [
      makeResult('alpha', 'same'),
      makeResult('beta', 'same'),
      makeResult('gamma', 'different'),
    ];
    // Without filter: 2/3 = 0.667 < 1.0 → not converged
    const full = checkConvergence(results, 'dfg');
    expect(full.converged).toBe(false);

    // With filter: alpha+beta both 'same' → 2/2 = 1.0 → converged
    const filtered = checkConvergence(results, 'dfg', 1.0, ['alpha', 'beta']);
    expect(filtered.converged).toBe(true);
    expect(filtered.consensusRatio).toBe(1.0);
  });

  it('filtering to non-existent worker IDs → totalChecked=0 and converged=false', () => {
    const results = [makeResult('w1', 'hash'), makeResult('w2', 'hash')];
    const report = checkConvergence(results, 'dfg', 1.0, ['ghost']);
    expect(report.totalChecked).toBe(0);
    expect(report.converged).toBe(false);
  });
});

describe('Rank-2: convergenceRuns=1 converges immediately on first call', () => {
  it('single round is enough when convergenceRuns=1', () => {
    const history = new Map<string, string[]>();
    const results = [makeResult('w1', 'hash_a')];
    const r = checkSwarmConvergence(results, history, 1);
    expect(r.converged).toBe(true);
    expect(r.stableWorkers).toContain('w1/dfg');
  });

  it('multiple workers with convergenceRuns=1 all converge on first call', () => {
    const history = new Map<string, string[]>();
    const results = [
      makeResult('w1', 'h1', 'dfg'),
      makeResult('w2', 'h2', 'dfg'),
      makeResult('w3', 'h3', 'dfg'),
    ];
    const r = checkSwarmConvergence(results, history, 1);
    // Each worker had 1 run = 1 consistent hash → all stable
    expect(r.converged).toBe(true);
    expect(r.stableWorkers).toHaveLength(3);
  });
});

describe('Rank-2: error class shape contracts', () => {
  it('ConvergenceMaxIterationsError has correct name and message', () => {
    const err = new ConvergenceMaxIterationsError(110, 100, 0.6);
    expect(err.name).toBe('ConvergenceMaxIterationsError');
    expect(err.message).toContain('110');
    expect(err.message).toContain('100');
    expect(err instanceof Error).toBe(true);
    expect(err.iterationsRun).toBe(110);
    expect(err.maxIterations).toBe(100);
    expect(err.finalAgreementRate).toBe(0.6);
  });

  it('ConvergenceTimeoutError has correct name and message', () => {
    const err = new ConvergenceTimeoutError(5, 5, 0.4);
    expect(err.name).toBe('ConvergenceTimeoutError');
    expect(err.message).toContain('5');
    expect(err instanceof Error).toBe(true);
    expect(err.episodesRun).toBe(5);
    expect(err.maxEpisodes).toBe(5);
    expect(err.finalAgreementRate).toBe(0.4);
  });

  it('ConvergenceMaxIterationsError is catchable as Error', () => {
    let caught: unknown;
    try {
      throw new ConvergenceMaxIterationsError(50, 30, 0.2);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof Error).toBe(true);
    expect(caught instanceof ConvergenceMaxIterationsError).toBe(true);
  });

  it('ConvergenceTimeoutError is catchable as Error', () => {
    let caught: unknown;
    try {
      throw new ConvergenceTimeoutError(3, 3, 0.0);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof Error).toBe(true);
    expect(caught instanceof ConvergenceTimeoutError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rank-3: Metamorphic relations
// ---------------------------------------------------------------------------

describe('Rank-3: monotonicity — adding an agreeing worker never decreases consensusRatio', () => {
  it('ratio non-decreasing when majority-agreeing worker added to majority set', () => {
    const base = [
      makeResult('w1', 'dominant'),
      makeResult('w2', 'dominant'),
      makeResult('w3', 'minority'),
    ];
    const { consensusRatio: ratioBefore } = checkConvergence(base, 'dfg');

    const extended = [...base, makeResult('w4', 'dominant')];
    const { consensusRatio: ratioAfter } = checkConvergence(extended, 'dfg');

    expect(ratioAfter).toBeGreaterThanOrEqual(ratioBefore);
  });

  it('ratio is monotonically increasing as workers are added one-by-one agreeing', () => {
    const ratios: number[] = [];
    const results: WorkerResult[] = [];
    for (let i = 0; i < 5; i++) {
      results.push(makeResult(`w${i}`, 'same_hash'));
      const { consensusRatio } = checkConvergence(results, 'dfg');
      ratios.push(consensusRatio);
    }
    // Each addition of an agreeing worker keeps ratio at 1.0 (all agree)
    for (const r of ratios) {
      expect(r).toBe(1.0);
    }
  });
});

describe('Rank-3: adding a disagreeing worker never increases consensusRatio', () => {
  it('ratio non-increasing when minority worker added to unanimous set', () => {
    const base = [
      makeResult('w1', 'hash_a'),
      makeResult('w2', 'hash_a'),
    ];
    const { consensusRatio: ratioBefore } = checkConvergence(base, 'dfg');
    expect(ratioBefore).toBe(1.0);

    const extended = [...base, makeResult('w3', 'hash_b')];
    const { consensusRatio: ratioAfter } = checkConvergence(extended, 'dfg');
    expect(ratioAfter).toBeLessThanOrEqual(ratioBefore);
  });

  it('ratio strictly decreases when 1 dissenter added to all-agreeing N-worker set (N>1)', () => {
    const base = Array.from({ length: 4 }, (_, i) => makeResult(`w${i}`, 'hash_a'));
    const { consensusRatio: ratioBefore } = checkConvergence(base, 'dfg');
    expect(ratioBefore).toBe(1.0);

    const extended = [...base, makeResult('w4', 'hash_b')];
    const { consensusRatio: ratioAfter } = checkConvergence(extended, 'dfg');
    // 4/5 = 0.8 < 1.0
    expect(ratioAfter).toBeLessThan(ratioBefore);
    expect(ratioAfter).toBeCloseTo(4 / 5, 10);
  });
});

describe('Rank-3: determinism — identical inputs produce identical outputs', () => {
  it('two calls with same results produce the same consensusRatio', () => {
    const results = [
      makeResult('w1', 'h1'),
      makeResult('w2', 'h2'),
      makeResult('w3', 'h1'),
    ];
    const r1 = checkConvergence(results, 'dfg');
    const r2 = checkConvergence(results, 'dfg');
    expect(r1.consensusRatio).toBe(r2.consensusRatio);
    expect(r1.converged).toBe(r2.converged);
    expect(r1.dominantHash).toBe(r2.dominantHash);
  });

  it('hashOutput is deterministic across calls', () => {
    const data = { nodes: [1, 2, 3], edges: { a: 'b' } };
    expect(hashOutput(data)).toBe(hashOutput(data));
    expect(hashOutput(data)).toBe(hashOutput(data));
  });
});

// ---------------------------------------------------------------------------
// Rank-1: checkMlConvergence — untested API surface
// ---------------------------------------------------------------------------

describe('Rank-1: checkMlConvergence mathematical invariants', () => {
  it('empty input → converged=false, totalChecked=0', () => {
    const { converged, totalChecked, consensusRatio } = checkMlConvergence([], 'ml_cluster');
    expect(converged).toBe(false);
    expect(totalChecked).toBe(0);
    expect(consensusRatio).toBe(0);
  });

  it('single worker → consensusRatio=1.0, converged=true', () => {
    const results = [makeResult('w1', 'h1', 'ml_cluster', { result: { score: 0.9 } })];
    const { converged, consensusRatio } = checkMlConvergence(results, 'ml_cluster');
    expect(converged).toBe(true);
    expect(consensusRatio).toBe(1.0);
  });

  it('two workers with numeric results within epsilon → converged', () => {
    const results = [
      makeResult('w1', 'h1', 'ml_cluster', { result: { score: 0.900 } }),
      makeResult('w2', 'h2', 'ml_cluster', { result: { score: 0.905 } }),
    ];
    // epsilon=0.01 default; diff=0.005 < 0.01 → equivalent
    const { converged, consensusRatio } = checkMlConvergence(results, 'ml_cluster', 0.01);
    expect(converged).toBe(true);
    expect(consensusRatio).toBe(1.0);
  });

  it('two workers with numeric results outside epsilon → not converged', () => {
    const results = [
      makeResult('w1', 'h1', 'ml_cluster', { result: { score: 0.5 } }),
      makeResult('w2', 'h2', 'ml_cluster', { result: { score: 0.9 } }),
    ];
    // epsilon=0.01 default; diff=0.4 >> 0.01 → not equivalent
    const { converged, consensusRatio } = checkMlConvergence(results, 'ml_cluster', 0.01);
    expect(converged).toBe(false);
    expect(consensusRatio).toBeCloseTo(0.5, 10); // 1/2
  });

  it('ML consensusRatio is always in [0, 1]', () => {
    for (const n of [0, 1, 3, 5]) {
      const results = Array.from({ length: n }, (_, i) =>
        makeResult(`w${i}`, `h${i}`, 'ml_cluster', { result: { val: i * 100 } })
      );
      const { consensusRatio } = checkMlConvergence(results, 'ml_cluster', 0.01);
      expect(consensusRatio).toBeGreaterThanOrEqual(0);
      expect(consensusRatio).toBeLessThanOrEqual(1);
    }
  });

  it('convergenceReason is a non-empty string in all ML cases', () => {
    const empty = checkMlConvergence([], 'ml_cluster');
    expect(typeof empty.convergenceReason).toBe('string');
    expect(empty.convergenceReason.length).toBeGreaterThan(0);

    const single = checkMlConvergence(
      [makeResult('w1', 'h1', 'ml_cluster', { result: { v: 1 } })],
      'ml_cluster'
    );
    expect(typeof single.convergenceReason).toBe('string');
    expect(single.convergenceReason.length).toBeGreaterThan(0);
  });

  it('ML filtering by algorithm ID: results for wrong algorithm are ignored', () => {
    const results = [
      makeResult('w1', 'h1', 'ml_cluster', { result: { v: 1 } }),
      makeResult('w2', 'h2', 'ml_forecast', { result: { v: 1 } }), // different algo
    ];
    // checkMlConvergence filters by algorithm
    const { totalChecked } = checkMlConvergence(results, 'ml_cluster');
    expect(totalChecked).toBe(1); // only w1 counts
  });
});

// ---------------------------------------------------------------------------
// Rank-2: checkSwarmConvergence — agreementRate boundary values
// ---------------------------------------------------------------------------

describe('Rank-2: checkSwarmConvergence agreementRate boundary values', () => {
  it('all workers stable → agreementRate = 1.0', () => {
    const history = new Map<string, string[]>();
    const results = [
      makeResult('w1', 'h1', 'dfg'),
      makeResult('w2', 'h2', 'dfg'),
    ];
    checkSwarmConvergence(results, history, 2);
    const r = checkSwarmConvergence(results, history, 2);
    expect(r.agreementRate).toBe(1.0);
  });

  it('no workers stable → agreementRate = 0.0', () => {
    // New history, first call: nobody has 2 consecutive rounds yet
    const history = new Map<string, string[]>();
    const results = [
      makeResult('w1', 'h1', 'dfg'),
      makeResult('w2', 'h2', 'dfg'),
    ];
    const r = checkSwarmConvergence(results, history, 2);
    // On the very first call, neither has 2 rounds yet → all unstable
    expect(r.agreementRate).toBe(0.0);
    expect(r.converged).toBe(false);
  });

  it('empty results → agreementRate = 0', () => {
    const history = new Map<string, string[]>();
    const { agreementRate } = checkSwarmConvergence([], history, 2);
    expect(agreementRate).toBe(0);
  });
});
