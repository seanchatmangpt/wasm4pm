import { describe, it, expect } from 'vitest';
import {
  makeEvaluator,
  mutate,
  crossover,
  seedPopulation,
  receiptForCandidate,
  DISCOVERY_ALGORITHMS,
  REASON_BREEDS,
} from '../scoring.js';
import { mulberry32 } from '../rng.js';
import type { Candidate, LogCharacteristics, PipelineGenome } from '../types.js';

const SMALL_CLEAN: LogCharacteristics = {
  traceCount: 500,
  eventCount: 5_000,
  activityCount: 8,
  avgTraceLength: 10,
  maxTraceLength: 12,
};

const HUGE_NOISY: LogCharacteristics = {
  traceCount: 80_000,
  eventCount: 2_000_000,
  activityCount: 60,
  avgTraceLength: 12,
  maxTraceLength: 80,
};

/** Structural validity: exactly one discover stage, registered discovery algorithm. */
function assertValid(g: PipelineGenome): void {
  const discovers = g.stages.filter((s) => s.kind === 'discover');
  expect(discovers).toHaveLength(1);
  const d = discovers[0];
  expect(d.algorithm).toBeDefined();
  expect(DISCOVERY_ALGORITHMS).toContain(d.algorithm);
  // first stage must be the discover
  expect(g.stages[0].kind).toBe('discover');
  for (const s of g.stages) {
    if (s.kind === 'reason') {
      expect(s.breed).toBeDefined();
      expect(REASON_BREEDS).toContain(s.breed);
    }
  }
}

describe('DISCOVERY_ALGORITHMS', () => {
  it('is a non-empty, sorted, registered-only set', () => {
    expect(DISCOVERY_ALGORITHMS.length).toBeGreaterThan(0);
    const sorted = [...DISCOVERY_ALGORITHMS].sort();
    expect([...DISCOVERY_ALGORITHMS]).toEqual(sorted);
  });
});

describe('makeEvaluator', () => {
  const g: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'inductive_miner', params: {} }] };

  it('is deterministic: same genome -> identical objectives', () => {
    const e1 = makeEvaluator(SMALL_CLEAN);
    const e2 = makeEvaluator(SMALL_CLEAN);
    const a = e1(g);
    const b = e2(g);
    expect(a).toEqual(b);
    expect(e1(g)).toEqual(a); // repeat call stable
  });

  it('produces quality in [0,1] and positive cost', () => {
    const o = makeEvaluator(SMALL_CLEAN)(g);
    expect(o.quality).toBeGreaterThanOrEqual(0);
    expect(o.quality).toBeLessThanOrEqual(1);
    expect(o.cost).toBeGreaterThan(0);
  });

  it('rewards a conform stage', () => {
    const evalFn = makeEvaluator(SMALL_CLEAN);
    const withConform: PipelineGenome = {
      stages: [...g.stages, { kind: 'conform', params: {} }],
    };
    expect(evalFn(withConform).quality).toBeGreaterThan(evalFn(g).quality);
  });

  it('scores a fast scalable algorithm above an O(n^2)/non-scaling one on a huge noisy log', () => {
    const evalFn = makeEvaluator(HUGE_NOISY);
    // dfg: O(n), scalesWell, robustToNoise. alpha_plus_plus: O(n^2), !scalesWell, !robustToNoise.
    const fast: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'dfg', params: {} }] };
    const slow: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'alpha_plus_plus', params: {} }] };
    const fastQ = evalFn(fast).quality;
    const slowQ = evalFn(slow).quality;
    expect(fastQ).toBeGreaterThan(slowQ);
  });

  it('cost grows with event count for a size-scaled algorithm', () => {
    // dfg has bench nativeEventsPerSec, so its grounded cost scales with eventCount.
    const dfg: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'dfg', params: {} }] };
    const small = makeEvaluator(SMALL_CLEAN)(dfg).cost;
    const huge = makeEvaluator(HUGE_NOISY)(dfg).cost;
    expect(huge).toBeGreaterThan(small);
  });
});

describe('mutate', () => {
  it('always yields a structurally valid genome', () => {
    const rng = mulberry32(7);
    let g: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'dfg', params: {} }] };
    for (let i = 0; i < 500; i++) {
      g = mutate(g, rng);
      assertValid(g);
    }
  });

  it('repairs an invalid genome (no discover / unknown algorithm)', () => {
    const rng = mulberry32(3);
    const bad: PipelineGenome = {
      stages: [
        { kind: 'discover', algorithm: 'definitely_not_real', params: {} },
        { kind: 'conform', params: {} },
      ],
    };
    assertValid(mutate(bad, rng));
  });

  it('is deterministic for a given seed', () => {
    const g: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'dfg', params: {} }] };
    const a = mutate(g, mulberry32(42));
    const b = mutate(g, mulberry32(42));
    expect(a).toEqual(b);
  });
});

describe('crossover', () => {
  it('always yields a structurally valid genome', () => {
    const rng = mulberry32(11);
    const a: PipelineGenome = {
      stages: [
        { kind: 'discover', algorithm: 'dfg', params: {} },
        { kind: 'conform', params: {} },
        { kind: 'reason', breed: 'mycin', params: {} },
      ],
    };
    const b: PipelineGenome = {
      stages: [
        { kind: 'discover', algorithm: 'inductive_miner', params: {} },
        { kind: 'reason', breed: 'bayes', params: {} },
      ],
    };
    for (let i = 0; i < 500; i++) {
      assertValid(crossover(a, b, rng));
    }
  });

  it('is deterministic for a given seed', () => {
    const a: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'dfg', params: {} }] };
    const b: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'ilp', params: {} }] };
    expect(crossover(a, b, mulberry32(99))).toEqual(crossover(a, b, mulberry32(99)));
  });
});

describe('seedPopulation', () => {
  it('produces the requested number of distinct, valid genomes', () => {
    const pop = seedPopulation(SMALL_CLEAN, mulberry32(1), 12);
    expect(pop.length).toBeGreaterThan(0);
    expect(pop.length).toBeLessThanOrEqual(12);
    for (const g of pop) assertValid(g);
    const keys = new Set(pop.map((g) => JSON.stringify(g)));
    expect(keys.size).toBe(pop.length); // distinct
  });

  it('is deterministic for a given seed', () => {
    const a = seedPopulation(SMALL_CLEAN, mulberry32(5), 8);
    const b = seedPopulation(SMALL_CLEAN, mulberry32(5), 8);
    expect(a).toEqual(b);
  });
});

describe('receiptForCandidate', () => {
  function candidate(algorithm: string): Candidate {
    const genome: PipelineGenome = { stages: [{ kind: 'discover', algorithm, params: {} }] };
    return { genome, objectives: { quality: 0.5, cost: 1.25 }, rank: 0 };
  }

  it('is a stable 64-char BLAKE3 hex hash', () => {
    const c = candidate('dfg');
    const h1 = receiptForCandidate(c);
    const h2 = receiptForCandidate(c);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different genomes/objectives', () => {
    expect(receiptForCandidate(candidate('dfg'))).not.toBe(receiptForCandidate(candidate('ilp')));
  });

  it('is invariant to param key ordering (canonicalization)', () => {
    const g1: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'dfg', params: { a: 1, b: 2 } }] };
    const g2: PipelineGenome = { stages: [{ kind: 'discover', algorithm: 'dfg', params: { b: 2, a: 1 } }] };
    const obj = { quality: 0.5, cost: 1.25 };
    const h1 = receiptForCandidate({ genome: g1, objectives: obj, rank: 0 });
    const h2 = receiptForCandidate({ genome: g2, objectives: obj, rank: 0 });
    expect(h1).toBe(h2);
  });
});
