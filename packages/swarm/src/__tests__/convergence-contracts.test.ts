/**
 * Convergence oracle-ranked tests
 *
 * Oracle hierarchy (Van der Aalst / Chicago TDD):
 *   Rank 1 — Mathematical theorem: properties that hold for any correct implementation
 *   Rank 2 — Domain contract:      design-decided properties
 *   Rank 3 — Metamorphic relation: input perturbation → output relation
 *   Rank 4 — Statistical property: convergence trends over N trials
 *
 * No FM-5 violations: expected values are derived from domain theory, not the
 * implementation under test.
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
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
  workerId: string,
  hash: string,
  algorithmId = 'dfg',
  result: unknown = {}
): WorkerResult {
  return {
    workerId,
    algorithmId,
    resultHash: hash,
    result,
    runAt: new Date().toISOString(),
    durationMs: 10,
  };
}

function makeResults(
  n: number,
  hash: string,
  algorithmId = 'dfg'
): WorkerResult[] {
  return Array.from({ length: n }, (_, i) =>
    makeResult(`w${i + 1}`, hash, algorithmId)
  );
}

// ---------------------------------------------------------------------------
// Rank 1 — Mathematical theorem: hashOutput invariants
// ---------------------------------------------------------------------------

describe('Rank 1 — hashOutput mathematical invariants', () => {
  it('identical values produce identical hashes', () => {
    const h1 = hashOutput({ edges: 5, nodes: 3 });
    const h2 = hashOutput({ edges: 5, nodes: 3 });
    expect(h1).toBe(h2);
  });

  it('distinct values produce distinct hashes (collision resistance)', () => {
    const h1 = hashOutput({ edges: 5 });
    const h2 = hashOutput({ edges: 6 });
    expect(h1).not.toBe(h2);
  });

  it('key order does not affect hash (canonical form)', () => {
    const h1 = hashOutput({ a: 1, b: 2 });
    const h2 = hashOutput({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  it('nested object key order does not affect hash', () => {
    const h1 = hashOutput({ outer: { x: 1, y: 2 }, z: 3 });
    const h2 = hashOutput({ z: 3, outer: { y: 2, x: 1 } });
    expect(h1).toBe(h2);
  });

  it('hash output is a non-empty hex string', () => {
    const h = hashOutput({ test: true });
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });

  it('hash of null differs from hash of empty object', () => {
    const h1 = hashOutput(null);
    const h2 = hashOutput({});
    expect(h1).not.toBe(h2);
  });

  it('hash of array differs from hash of object with same values', () => {
    const h1 = hashOutput([1, 2, 3]);
    const h2 = hashOutput({ 0: 1, 1: 2, 2: 3 });
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// Rank 1 — Mathematical theorem: consensusRatio is in [0, 1]
// ---------------------------------------------------------------------------

describe('Rank 1 — consensusRatio is always in [0, 1]', () => {
  const cases: Array<{ label: string; hashes: string[]; threshold: number }> = [
    { label: 'unanimous 3 workers', hashes: ['a', 'a', 'a'], threshold: 1.0 },
    { label: 'all distinct 4 workers', hashes: ['a', 'b', 'c', 'd'], threshold: 1.0 },
    { label: '2 of 3 agree', hashes: ['a', 'a', 'b'], threshold: 0.8 },
    { label: 'single worker', hashes: ['solo'], threshold: 1.0 },
  ];

  for (const { label, hashes, threshold } of cases) {
    it(`[${label}] consensusRatio ∈ [0, 1]`, () => {
      const results = hashes.map((h, i) => makeResult(`w${i}`, h));
      const report = checkConvergence(results, 'dfg', threshold);
      expect(report.consensusRatio).toBeGreaterThanOrEqual(0);
      expect(report.consensusRatio).toBeLessThanOrEqual(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Rank 1 — Mathematical theorem: converged ↔ consensusRatio ≥ threshold
// This is the formal definition; verifying it independently catches implementation
// bugs where the boolean and numeric fields diverge.
// ---------------------------------------------------------------------------

describe('Rank 1 — converged is logically consistent with consensusRatio ≥ threshold', () => {
  const cases: Array<{ hashes: string[]; threshold: number }> = [
    { hashes: ['a', 'a', 'a'], threshold: 1.0 },
    { hashes: ['a', 'a', 'b'], threshold: 0.66 },
    { hashes: ['a', 'a', 'b'], threshold: 0.75 },
    { hashes: ['a', 'b', 'c'], threshold: 0.4 },
    { hashes: ['solo'], threshold: 1.0 },
    { hashes: ['a', 'a', 'a', 'b'], threshold: 0.7 },
    { hashes: ['a', 'a', 'a', 'b'], threshold: 0.8 },
  ];

  for (const { hashes, threshold } of cases) {
    it(`hashes=[${hashes}] threshold=${threshold}: converged === (ratio >= threshold)`, () => {
      const results = hashes.map((h, i) => makeResult(`w${i}`, h));
      const report = checkConvergence(results, 'dfg', threshold);
      expect(report.converged).toBe(report.consensusRatio >= threshold);
    });
  }
});

// ---------------------------------------------------------------------------
// Rank 1 — Mathematical theorem: empty results → converged is false
// By definition, convergence requires at least one worker to have produced
// results. An empty set cannot satisfy any quorum.
// ---------------------------------------------------------------------------

describe('Rank 1 — empty results are always not-converged', () => {
  it('checkConvergence with empty results returns converged=false', () => {
    const report = checkConvergence([], 'dfg');
    expect(report.converged).toBe(false);
  });

  it('checkConvergence empty results: totalChecked=0 and consensusRatio=0', () => {
    const report = checkConvergence([], 'dfg');
    expect(report.totalChecked).toBe(0);
    expect(report.consensusRatio).toBe(0);
    expect(report.dominantHash).toBeNull();
    expect(report.dissentingWorkers).toHaveLength(0);
  });

  it('checkSwarmConvergence with empty results returns converged=false', () => {
    const history = new Map<string, string[]>();
    const result = checkSwarmConvergence([], history, 2);
    expect(result.converged).toBe(false);
    expect(result.stableWorkers).toHaveLength(0);
    expect(result.unstableWorkers).toHaveLength(0);
    expect(result.agreementRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rank 1 — Mathematical theorem: unanimous agreement → consensusRatio = 1.0
// When all workers produce the same hash, the dominant hash count equals N,
// so N/N = 1.0 exactly.
// ---------------------------------------------------------------------------

describe('Rank 1 — unanimous agreement → consensusRatio exactly 1.0', () => {
  it('2 identical workers → consensusRatio = 1.0', () => {
    const results = makeResults(2, 'same');
    expect(checkConvergence(results, 'dfg').consensusRatio).toBe(1.0);
  });

  it('5 identical workers → consensusRatio = 1.0', () => {
    const results = makeResults(5, 'same');
    expect(checkConvergence(results, 'dfg').consensusRatio).toBe(1.0);
  });

  it('unanimous → dissentingWorkers is empty', () => {
    const results = makeResults(3, 'same');
    const report = checkConvergence(results, 'dfg');
    expect(report.dissentingWorkers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rank 1 — Mathematical theorem: all-distinct workers → consensusRatio = 1/N
// When no two workers agree, the best possible ratio is 1 vote / N total.
// ---------------------------------------------------------------------------

describe('Rank 1 — all distinct hashes → consensusRatio = 1/N', () => {
  it('3 distinct → consensusRatio ≈ 1/3', () => {
    const results = ['a', 'b', 'c'].map((h, i) => makeResult(`w${i}`, h));
    const report = checkConvergence(results, 'dfg');
    expect(report.consensusRatio).toBeCloseTo(1 / 3, 9);
  });

  it('4 distinct → consensusRatio = 0.25', () => {
    const results = ['a', 'b', 'c', 'd'].map((h, i) => makeResult(`w${i}`, h));
    const report = checkConvergence(results, 'dfg');
    expect(report.consensusRatio).toBeCloseTo(0.25, 9);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: filter by algorithmId
// Workers running different algorithms must not affect each other's convergence.
// ---------------------------------------------------------------------------

describe('Rank 2 — algorithm filter contract', () => {
  it('results for a different algorithmId are excluded', () => {
    const results: WorkerResult[] = [
      makeResult('w1', 'hash_dfg', 'dfg'),
      makeResult('w2', 'hash_dfg', 'dfg'),
      makeResult('w3', 'hash_other', 'heuristic_miner'),
    ];
    const report = checkConvergence(results, 'dfg');
    expect(report.totalChecked).toBe(2);
    expect(report.converged).toBe(true);
  });

  it('requesting an algorithm with no results returns converged=false', () => {
    const results = makeResults(3, 'same', 'dfg');
    const report = checkConvergence(results, 'ilp');
    expect(report.converged).toBe(false);
    expect(report.totalChecked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: workerIds filter
// An optional workerIds subset restricts which workers participate in the check.
// ---------------------------------------------------------------------------

describe('Rank 2 — workerIds filter contract', () => {
  it('workerIds filter limits the checked set', () => {
    const results: WorkerResult[] = [
      makeResult('w1', 'h1'),
      makeResult('w2', 'h2'),
      makeResult('w3', 'h1'),
    ];
    // Only check w1 and w3 — they both have h1 → should converge
    const report = checkConvergence(results, 'dfg', 1.0, ['w1', 'w3']);
    expect(report.totalChecked).toBe(2);
    expect(report.converged).toBe(true);
  });

  it('workerIds filter with a dissenting subset → not converged', () => {
    const results: WorkerResult[] = [
      makeResult('w1', 'h1'),
      makeResult('w2', 'h1'),
      makeResult('w3', 'h2'),
    ];
    // Only check w1 and w3 — they differ → not converged at threshold 1.0
    const report = checkConvergence(results, 'dfg', 1.0, ['w1', 'w3']);
    expect(report.converged).toBe(false);
  });

  it('empty workerIds filter returns converged=false (no relevant results)', () => {
    const results = makeResults(3, 'same');
    const report = checkConvergence(results, 'dfg', 1.0, []);
    expect(report.converged).toBe(false);
    expect(report.totalChecked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: temporal stability requires convergenceRuns rounds
// checkSwarmConvergence must not declare convergence before the ring buffer
// holds at least convergenceRuns identical hashes.
// ---------------------------------------------------------------------------

describe('Rank 2 — temporal stability requires exactly convergenceRuns rounds', () => {
  it('N-1 identical rounds are not enough (convergenceRuns=3)', () => {
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [makeResult('w1', 'stable', 'dfg')];
    checkSwarmConvergence(results, history, 3); // round 1
    const r2 = checkSwarmConvergence(results, history, 3); // round 2
    expect(r2.converged).toBe(false);
  });

  it('exactly convergenceRuns identical rounds → converged', () => {
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [makeResult('w1', 'stable', 'dfg')];
    checkSwarmConvergence(results, history, 2); // round 1
    const r2 = checkSwarmConvergence(results, history, 2); // round 2
    expect(r2.converged).toBe(true);
  });

  it('convergenceRuns=1 converges on first round', () => {
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [makeResult('w1', 'h', 'dfg')];
    const r = checkSwarmConvergence(results, history, 1);
    expect(r.converged).toBe(true);
  });

  it('hash change after stable rounds resets convergence', () => {
    const history = new Map<string, string[]>();
    const stable: WorkerResult[] = [makeResult('w1', 'v1', 'dfg')];
    const changed: WorkerResult[] = [makeResult('w1', 'v2', 'dfg')];
    checkSwarmConvergence(stable, history, 3);
    checkSwarmConvergence(stable, history, 3);
    const r = checkSwarmConvergence(changed, history, 3);
    expect(r.converged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: agreementRate consistency
// agreementRate must equal stableWorkers.length / (stable + unstable).
// ---------------------------------------------------------------------------

describe('Rank 2 — agreementRate is consistent with stableWorkers / total', () => {
  it('agreementRate equals stableWorkers.length / total when all stable', () => {
    const history = new Map<string, string[]>();
    const results = makeResults(3, 'same', 'dfg');
    checkSwarmConvergence(results, history, 2); // round 1
    const r = checkSwarmConvergence(results, history, 2); // round 2 → all stable
    expect(r.converged).toBe(true);
    const total = r.stableWorkers.length + r.unstableWorkers.length;
    expect(r.agreementRate).toBeCloseTo(r.stableWorkers.length / total, 9);
  });

  it('agreementRate = 0 when nothing is stable', () => {
    const history = new Map<string, string[]>();
    const results = makeResults(3, 'same', 'dfg');
    const r = checkSwarmConvergence(results, history, 2); // first round, never stable
    expect(r.agreementRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: ConvergenceMaxIterationsError
// ---------------------------------------------------------------------------

describe('Rank 2 — ConvergenceMaxIterationsError domain contract', () => {
  it('is an instance of Error', () => {
    const err = new ConvergenceMaxIterationsError(150, 100, 0.75);
    expect(err).toBeInstanceOf(Error);
  });

  it('name is "ConvergenceMaxIterationsError"', () => {
    const err = new ConvergenceMaxIterationsError(150, 100, 0.75);
    expect(err.name).toBe('ConvergenceMaxIterationsError');
  });

  it('exposes iterationsRun property', () => {
    const err = new ConvergenceMaxIterationsError(150, 100, 0.75);
    expect(err.iterationsRun).toBe(150);
  });

  it('exposes maxIterations property', () => {
    const err = new ConvergenceMaxIterationsError(150, 100, 0.75);
    expect(err.maxIterations).toBe(100);
  });

  it('exposes finalAgreementRate property', () => {
    const err = new ConvergenceMaxIterationsError(150, 100, 0.75);
    expect(err.finalAgreementRate).toBeCloseTo(0.75, 9);
  });

  it('message contains iteration counts', () => {
    const err = new ConvergenceMaxIterationsError(200, 100, 0.5);
    expect(err.message).toMatch(/200/);
    expect(err.message).toMatch(/100/);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: ConvergenceTimeoutError
// ---------------------------------------------------------------------------

describe('Rank 2 — ConvergenceTimeoutError domain contract', () => {
  it('is an instance of Error', () => {
    const err = new ConvergenceTimeoutError(10, 10, 0.6);
    expect(err).toBeInstanceOf(Error);
  });

  it('name is "ConvergenceTimeoutError"', () => {
    const err = new ConvergenceTimeoutError(10, 10, 0.6);
    expect(err.name).toBe('ConvergenceTimeoutError');
  });

  it('exposes episodesRun property', () => {
    const err = new ConvergenceTimeoutError(10, 10, 0.6);
    expect(err.episodesRun).toBe(10);
  });

  it('exposes maxEpisodes property', () => {
    const err = new ConvergenceTimeoutError(10, 15, 0.6);
    expect(err.maxEpisodes).toBe(15);
  });

  it('exposes finalAgreementRate property', () => {
    const err = new ConvergenceTimeoutError(10, 10, 0.42);
    expect(err.finalAgreementRate).toBeCloseTo(0.42, 9);
  });

  it('message mentions episodes and agreement rate', () => {
    const err = new ConvergenceTimeoutError(5, 5, 0.8);
    expect(err.message).toMatch(/5/);
    // 80.0% is how the message renders finalAgreementRate
    expect(err.message).toMatch(/80\.0%/);
  });

  it('ConvergenceTimeoutError is distinct from ConvergenceMaxIterationsError', () => {
    const timeout = new ConvergenceTimeoutError(10, 10, 0.6);
    const maxIter = new ConvergenceMaxIterationsError(100, 50, 0.6);
    expect(timeout.name).not.toBe(maxIter.name);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: dominantHash
// The dominant hash must be one of the hashes provided, never invented.
// ---------------------------------------------------------------------------

describe('Rank 2 — dominantHash is always one of the provided hashes', () => {
  it('dominantHash is one of the actual worker hashes', () => {
    const hashes = ['hash_alpha', 'hash_alpha', 'hash_beta'];
    const results = hashes.map((h, i) => makeResult(`w${i}`, h));
    const report = checkConvergence(results, 'dfg');
    expect(['hash_alpha', 'hash_beta']).toContain(report.dominantHash);
  });

  it('dominantHash is null when no workers produced results', () => {
    const report = checkConvergence([], 'dfg');
    expect(report.dominantHash).toBeNull();
  });

  it('dominantHash is the majority hash (not a minority hash)', () => {
    // 3 workers on hash_a, 1 on hash_b → dominant must be hash_a
    const results: WorkerResult[] = [
      ...makeResults(3, 'hash_a'),
      makeResult('w_outlier', 'hash_b'),
    ];
    const report = checkConvergence(results, 'dfg');
    expect(report.dominantHash).toBe('hash_a');
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: checkMlConvergence uses epsilon-equivalence
// ML results within epsilon of each other should converge; results outside
// epsilon must not.
// ---------------------------------------------------------------------------

describe('Rank 2 — checkMlConvergence epsilon-equivalence contract', () => {
  it('numeric values within epsilon → converged', () => {
    const results: WorkerResult[] = [
      { ...makeResult('w1', 'h1', 'ml_cluster'), result: { score: 0.85 } },
      { ...makeResult('w2', 'h2', 'ml_cluster'), result: { score: 0.854 } },
    ];
    const report = checkMlConvergence(results, 'ml_cluster', 0.01);
    expect(report.converged).toBe(true);
  });

  it('numeric values outside epsilon → not converged', () => {
    const results: WorkerResult[] = [
      { ...makeResult('w1', 'h1', 'ml_cluster'), result: { score: 0.85 } },
      { ...makeResult('w2', 'h2', 'ml_cluster'), result: { score: 0.90 } },
    ];
    const report = checkMlConvergence(results, 'ml_cluster', 0.01);
    expect(report.converged).toBe(false);
  });

  it('identical ML results always converge regardless of epsilon', () => {
    const results: WorkerResult[] = [
      { ...makeResult('w1', 'h1', 'ml_cluster'), result: { score: 0.85, k: 3 } },
      { ...makeResult('w2', 'h2', 'ml_cluster'), result: { score: 0.85, k: 3 } },
    ];
    const report = checkMlConvergence(results, 'ml_cluster', 0.0);
    expect(report.converged).toBe(true);
  });

  it('empty ML results → not converged', () => {
    const report = checkMlConvergence([], 'ml_cluster', 0.01);
    expect(report.converged).toBe(false);
    expect(report.totalChecked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rank 3 — Metamorphic: tightening the threshold makes convergence harder
// Shrinking threshold from T1 to T2 (T2 > T1) must not make it easier
// to converge. If a set does not converge at T2, it must not converge at T2+δ.
// ---------------------------------------------------------------------------

describe('Rank 3 — monotonic threshold: higher threshold is strictly harder', () => {
  it('set converging at 0.6 does not converge at 0.8 (same results)', () => {
    // 3 workers: 2 agree (ratio=0.667), 1 dissents
    const results = [
      makeResult('w1', 'h1'),
      makeResult('w2', 'h1'),
      makeResult('w3', 'h2'),
    ];
    const looseReport = checkConvergence(results, 'dfg', 0.6);
    const strictReport = checkConvergence(results, 'dfg', 0.8);
    // At 0.6 the 2/3 agreement (≈0.667) should converge
    expect(looseReport.converged).toBe(true);
    // At 0.8 the same 2/3 agreement (≈0.667 < 0.8) should NOT converge
    expect(strictReport.converged).toBe(false);
  });

  it('if converged at strict threshold T2, must also converge at looser T1 < T2', () => {
    // 4 workers all agree → ratio = 1.0 which satisfies any threshold
    const results = makeResults(4, 'same');
    const atStrict = checkConvergence(results, 'dfg', 1.0);
    const atLoose = checkConvergence(results, 'dfg', 0.5);
    expect(atStrict.converged).toBe(true);
    expect(atLoose.converged).toBe(true);
  });

  it('consensusRatio is independent of threshold value', () => {
    const results = [
      makeResult('w1', 'h1'),
      makeResult('w2', 'h1'),
      makeResult('w3', 'h2'),
    ];
    const r1 = checkConvergence(results, 'dfg', 0.5);
    const r2 = checkConvergence(results, 'dfg', 0.9);
    // consensusRatio is a property of the result set, not the threshold
    expect(r1.consensusRatio).toBe(r2.consensusRatio);
  });
});

// ---------------------------------------------------------------------------
// Rank 3 — Metamorphic: more rounds required → convergence needs more history
// Increasing convergenceRuns from R to R+1 delays convergence by exactly 1 round.
// ---------------------------------------------------------------------------

describe('Rank 3 — monotonic convergenceRuns: more rounds = harder convergence', () => {
  it('convergenceRuns=2 converges on round 2; convergenceRuns=3 does not', () => {
    const results: WorkerResult[] = [makeResult('w1', 'stable', 'dfg')];

    const history2 = new Map<string, string[]>();
    checkSwarmConvergence(results, history2, 2); // round 1
    const r2 = checkSwarmConvergence(results, history2, 2); // round 2 → converged
    expect(r2.converged).toBe(true);

    const history3 = new Map<string, string[]>();
    checkSwarmConvergence(results, history3, 3); // round 1
    const r3_2 = checkSwarmConvergence(results, history3, 3); // round 2 → NOT converged
    expect(r3_2.converged).toBe(false);
  });

  it('convergenceRuns=N requires exactly N identical rounds (not N-1)', () => {
    const results: WorkerResult[] = [makeResult('w1', 'h', 'dfg')];
    for (const runs of [2, 3, 4]) {
      const history = new Map<string, string[]>();
      // Run (runs - 2) preparatory calls — history is building up
      for (let i = 0; i < runs - 2; i++) {
        checkSwarmConvergence(results, history, runs);
      }
      // The (runs-1)-th call: ring buffer has runs-1 entries — not yet stable
      const beforeLast = checkSwarmConvergence(results, history, runs);
      expect(beforeLast.converged).toBe(false);

      // The runs-th call: ring buffer now has exactly `runs` identical entries → stable
      const atConvergence = checkSwarmConvergence(results, history, runs);
      expect(atConvergence.converged).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Rank 3 — Metamorphic: adding an outlier to a unanimous set reduces ratio
// If the baseline is unanimous convergence, injecting one dissenter must
// reduce consensusRatio and may break convergence.
// ---------------------------------------------------------------------------

describe('Rank 3 — outlier injection reduces consensusRatio', () => {
  it('adding 1 dissenter to N unanimous workers reduces consensusRatio', () => {
    const n = 4;
    const base = makeResults(n, 'same');
    const withOutlier = [...base, makeResult('outlier', 'different')];

    const baseReport = checkConvergence(base, 'dfg');
    const outlierReport = checkConvergence(withOutlier, 'dfg');

    // Base: ratio = N/N = 1.0; with outlier: N/(N+1) < 1.0
    expect(outlierReport.consensusRatio).toBeLessThan(baseReport.consensusRatio);
    expect(outlierReport.converged).toBe(false); // drops below 1.0 threshold
  });

  it('outlier worker appears in dissentingWorkers', () => {
    const base = makeResults(3, 'same');
    const withOutlier = [...base, makeResult('rogue', 'different')];
    const report = checkConvergence(withOutlier, 'dfg');
    expect(report.dissentingWorkers).toContain('rogue');
  });
});

// ---------------------------------------------------------------------------
// Rank 4 — Statistical property: repeated identical runs stay converged
// Once all workers are stable, additional identical rounds must not break
// convergence (ring buffer is bounded; oldest entries roll off).
// ---------------------------------------------------------------------------

describe('Rank 4 — stability over many rounds', () => {
  it('30 identical rounds remain converged after initial convergence', () => {
    const history = new Map<string, string[]>();
    const results: WorkerResult[] = [
      makeResult('w1', 'stable', 'dfg'),
      makeResult('w2', 'stable', 'dfg'),
    ];
    const convergenceRuns = 3;
    // Warm-up: run enough to converge
    for (let i = 0; i < convergenceRuns; i++) {
      checkSwarmConvergence(results, history, convergenceRuns);
    }
    // Continued identical runs must all stay converged
    for (let i = 0; i < 27; i++) {
      const r = checkSwarmConvergence(results, history, convergenceRuns);
      expect(r.converged).toBe(true);
    }
  });

  it('agreementRate stays 1.0 over many stable rounds', () => {
    const history = new Map<string, string[]>();
    const results = makeResults(2, 'stable', 'dfg');
    for (let i = 0; i < 20; i++) {
      checkSwarmConvergence(results, history, 2);
    }
    const final = checkSwarmConvergence(results, history, 2);
    expect(final.agreementRate).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Rank 2 — Domain contract: convergenceReason is a non-empty string
// The API must always explain why convergence did or did not occur.
// ---------------------------------------------------------------------------

describe('Rank 2 — convergenceReason is always a non-empty string', () => {
  it('convergenceReason is non-empty for unanimous convergence', () => {
    const report = checkConvergence(makeResults(3, 'h'), 'dfg');
    expect(typeof report.convergenceReason).toBe('string');
    expect(report.convergenceReason.length).toBeGreaterThan(0);
  });

  it('convergenceReason is non-empty when no workers ran', () => {
    const report = checkConvergence([], 'dfg');
    expect(typeof report.convergenceReason).toBe('string');
    expect(report.convergenceReason.length).toBeGreaterThan(0);
  });

  it('convergenceReason mentions "unanimous" for 100% agreement', () => {
    const report = checkConvergence(makeResults(4, 'h'), 'dfg');
    expect(report.convergenceReason).toMatch(/unanimous/);
  });

  it('checkSwarmConvergence convergenceReason is non-empty', () => {
    const history = new Map<string, string[]>();
    const r = checkSwarmConvergence([], history, 2);
    expect(typeof r.convergenceReason).toBe('string');
    expect(r.convergenceReason.length).toBeGreaterThan(0);
  });
});
