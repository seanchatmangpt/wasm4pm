import { describe, it, expect } from 'vitest';
import { evolve, dominates, nonDominatedSort, canonicalGenome } from '../engine.js';
import { mulberry32, type SeededRng } from '../rng.js';
import type { Objectives, PipelineGenome } from '../types.js';

/**
 * Trivial inline operators used ONLY to exercise the pure engine. Real
 * process-mining scoring + operators come from other modules.
 *
 * We model a 1-D genome whose single param `x` (integer 0..9) drives both
 * objectives via a known Pareto-shaped function, so we can assert engine
 * mechanics independent of process mining.
 */
function genome(x: number): PipelineGenome {
  return { stages: [{ kind: 'discover', algorithm: 'alpha', params: { x } }] };
}
function xOf(g: PipelineGenome): number {
  return g.stages[0].params.x as number;
}
// quality maximized when x is high; cost increases with x -> genuine trade-off.
function evaluate(g: PipelineGenome): Objectives {
  const x = xOf(g);
  return { quality: x / 9, cost: x * 10 };
}
function mutate(g: PipelineGenome, rng: SeededRng): PipelineGenome {
  const delta = rng.pick([-1, 0, 1]);
  const x = Math.max(0, Math.min(9, xOf(g) + delta));
  return genome(x);
}
function crossover(a: PipelineGenome, b: PipelineGenome, rng: SeededRng): PipelineGenome {
  const x = rng.next() < 0.5 ? xOf(a) : xOf(b);
  return genome(x);
}

const baseOpts = {
  initialPopulation: [genome(0), genome(3), genome(6), genome(9)],
  evaluate,
  mutate,
  crossover,
  generations: 8,
  populationSize: 6,
  seed: 42,
};

describe('rng', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
  it('differs across seeds', () => {
    expect(mulberry32(1).next()).not.toEqual(mulberry32(2).next());
  });
  it('pick throws on empty', () => {
    expect(() => mulberry32(1).pick([])).toThrow();
  });
});

describe('dominates', () => {
  it('maximizes quality and minimizes cost', () => {
    expect(dominates({ quality: 0.8, cost: 10 }, { quality: 0.5, cost: 20 })).toBe(true);
    expect(dominates({ quality: 0.8, cost: 10 }, { quality: 0.8, cost: 20 })).toBe(true); // tie q, better cost
    expect(dominates({ quality: 0.8, cost: 10 }, { quality: 0.8, cost: 10 })).toBe(false); // equal
    expect(dominates({ quality: 0.5, cost: 10 }, { quality: 0.8, cost: 20 })).toBe(false); // trade-off
  });
});

describe('nonDominatedSort', () => {
  it('ranks a hand-built set correctly', () => {
    // Build individuals with known objectives.
    const objs: Objectives[] = [
      { quality: 0.9, cost: 90 }, // A — front 0 (best quality)
      { quality: 0.1, cost: 10 }, // B — front 0 (cheapest)
      { quality: 0.5, cost: 50 }, // C — front 0 (middle, non-dominated)
      { quality: 0.4, cost: 80 }, // D — dominated by C (lower q, higher cost)
      { quality: 0.05, cost: 60 }, // E — dominated by B and C
    ];
    const pop = objs.map((o, i) => ({
      genome: genome(i),
      objectives: o,
      key: String(i),
      rank: -1,
      crowding: 0,
    }));
    const fronts = nonDominatedSort(pop);
    // Front 0 should be exactly {A,B,C} = indices 0,1,2.
    expect(new Set(fronts[0])).toEqual(new Set([0, 1, 2]));
    expect(pop[0].rank).toBe(0);
    expect(pop[1].rank).toBe(0);
    expect(pop[2].rank).toBe(0);
    // D and E are dominated -> rank > 0.
    expect(pop[3].rank).toBeGreaterThan(0);
    expect(pop[4].rank).toBeGreaterThan(0);
  });
});

describe('canonicalGenome', () => {
  it('is order-independent over params', () => {
    const g1: PipelineGenome = { stages: [{ kind: 'discover', params: { a: 1, b: 2 } }] };
    const g2: PipelineGenome = { stages: [{ kind: 'discover', params: { b: 2, a: 1 } }] };
    expect(canonicalGenome(g1)).toEqual(canonicalGenome(g2));
  });
});

describe('evolve', () => {
  it('returns a non-empty Pareto front with rank-0 candidates', () => {
    const result = evolve(baseOpts);
    expect(result.paretoFront.length).toBeGreaterThan(0);
    expect(result.paretoFront.every((c) => c.rank === 0)).toBe(true);
    expect(result.seed).toBe(42);
    expect(result.generations).toBe(8);
    expect(result.evaluated).toBeGreaterThan(0);
  });

  it('Pareto front contains no dominated point', () => {
    const result = evolve(baseOpts);
    const front = result.paretoFront;
    for (let i = 0; i < front.length; i++) {
      for (let j = 0; j < front.length; j++) {
        if (i === j) continue;
        expect(dominates(front[j].objectives, front[i].objectives)).toBe(false);
      }
    }
  });

  it('Pareto front is deduped (unique genomes)', () => {
    const result = evolve(baseOpts);
    const keys = result.paretoFront.map((c) => canonicalGenome(c.genome));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('Pareto front is stably sorted: quality desc, then cost asc', () => {
    const result = evolve(baseOpts);
    const f = result.paretoFront;
    for (let i = 1; i < f.length; i++) {
      const prev = f[i - 1].objectives;
      const cur = f[i].objectives;
      const ok =
        prev.quality > cur.quality ||
        (prev.quality === cur.quality && prev.cost <= cur.cost);
      expect(ok).toBe(true);
    }
  });

  it('winner maximizes quality (tie-break: min cost)', () => {
    const result = evolve(baseOpts);
    const maxQ = Math.max(...result.paretoFront.map((c) => c.objectives.quality));
    expect(result.winner.objectives.quality).toBe(maxQ);
    expect(result.winner).toEqual(result.paretoFront[0]);
  });

  it('is byte-identical for the same seed (determinism is law)', () => {
    const a = evolve(baseOpts);
    const b = evolve(baseOpts);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('may differ across seeds but stays valid', () => {
    const a = evolve({ ...baseOpts, seed: 42 });
    const b = evolve({ ...baseOpts, seed: 1337 });
    // Both are valid fronts; we only assert structural validity, not inequality
    // (the toy landscape can converge to the same optimum from any seed).
    expect(a.paretoFront.length).toBeGreaterThan(0);
    expect(b.paretoFront.length).toBeGreaterThan(0);
    expect(a.seed).not.toEqual(b.seed);
  });

  it('throws on empty initial population', () => {
    expect(() => evolve({ ...baseOpts, initialPopulation: [] })).toThrow();
  });
});
